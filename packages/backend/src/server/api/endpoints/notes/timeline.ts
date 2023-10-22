/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, FollowingsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { CacheService } from '@/core/CacheService.js';
import { MetaService } from '@/core/MetaService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { FunoutTimelineService } from '@/core/FunoutTimelineService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		includeMyRenotes: { type: 'boolean', default: true },
		includeRenotedMyNotes: { type: 'boolean', default: true },
		includeLocalRenotes: { type: 'boolean', default: true },
		withFiles: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private activeUsersChart: ActiveUsersChart,
		private idService: IdService,
		private cacheService: CacheService,
		private funoutTimelineService: FunoutTimelineService,
		private userFollowingService: UserFollowingService,

		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const [
				followings,
				userIdsWhoMeMuting,
				userIdsWhoMeMutingRenotes,
				userIdsWhoBlockingMe,
			] = await Promise.all([
				this.cacheService.userFollowingsCache.fetch(me.id),
				this.cacheService.userMutingsCache.fetch(me.id),
				this.cacheService.renoteMutingsCache.fetch(me.id),
				this.cacheService.userBlockedCache.fetch(me.id),
			]);

			let exist = await this.funoutTimelineService.isexist(ps.withFiles ? `homeTimelineWithFiles:${me.id}` : `homeTimeline:${me.id}`);

			if (exist != 0) {

				let noteIds = await this.funoutTimelineService.get(ps.withFiles ? `homeTimelineWithFiles:${me.id}` : `homeTimeline:${me.id}`, untilId, sinceId);
				funoutTimelineService.keyexpire(ps.withFiles ? `homeTimelineWithFiles:${me.id}` : `homeTimeline:${me.id}`,60*60*24*7);
				noteIds = noteIds.slice(0, ps.limit);

				if (noteIds.length > 0) {
					const query = this.notesRepository.createQueryBuilder('note')
						.where('note.id IN (:...noteIds)', { noteIds: noteIds })
						.innerJoinAndSelect('note.user', 'user')
						.leftJoinAndSelect('note.reply', 'reply')
						.leftJoinAndSelect('note.renote', 'renote')
						.leftJoinAndSelect('reply.user', 'replyUser')
						.leftJoinAndSelect('renote.user', 'renoteUser')
						.leftJoinAndSelect('note.channel', 'channel');

					let timeline = await query.getMany();

					timeline = timeline.filter(note => {
						if (note.userId === me.id) {
							return true;
						}
						if (isUserRelated(note, userIdsWhoBlockingMe)) return false;
						if (isUserRelated(note, userIdsWhoMeMuting)) return false;
						if (note.renoteId) {
							if (note.text == null && note.fileIds.length === 0 && !note.hasPoll) {
								if (isUserRelated(note, userIdsWhoMeMutingRenotes)) return false;
								if (ps.withRenotes === false) return false;
							}
						}
						if (note.reply && note.reply.visibility === 'followers') {
							if (!Object.hasOwn(followings, note.reply.userId)) return false;
						}

						return true;
					});

					// TODO: フィルタした結果件数が足りなかった場合の対応

					timeline.sort((a, b) => a.id > b.id ? -1 : 1);

					process.nextTick(() => {
						this.activeUsersChart.read(me);
					});

					return await this.noteEntityService.packMany(timeline, me);
				} else { // fallback to db
					const followees = await this.userFollowingService.getFollowees(me.id);

					//#region Construct query
					const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
						.andWhere('note.channelId IS NULL')
						.innerJoinAndSelect('note.user', 'user')
						.leftJoinAndSelect('note.reply', 'reply')
						.leftJoinAndSelect('note.renote', 'renote')
						.leftJoinAndSelect('reply.user', 'replyUser')
						.leftJoinAndSelect('renote.user', 'renoteUser');

					if (followees.length > 0) {
						const meOrFolloweeIds = [me.id, ...followees.map(f => f.followeeId)];

						query.andWhere('note.userId IN (:...meOrFolloweeIds)', { meOrFolloweeIds: meOrFolloweeIds });
					} else {
						query.andWhere('note.userId = :meId', { meId: me.id });
					}

					query.andWhere(new Brackets(qb => {
						qb
							.where('note.replyId IS NULL') // 返信ではない
							.orWhere(new Brackets(qb => {
								qb // 返信だけど投稿者自身への返信
									.where('note.replyId IS NOT NULL')
									.andWhere('note.replyUserId = note.userId');
							}));
					}));

					this.queryService.generateVisibilityQuery(query, me);
					this.queryService.generateMutedUserQuery(query, me);
					this.queryService.generateBlockedUserQuery(query, me);
					this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

					if (ps.includeMyRenotes === false) {
						query.andWhere(new Brackets(qb => {
							qb.orWhere('note.userId != :meId', { meId: me.id });
							qb.orWhere('note.renoteId IS NULL');
							qb.orWhere('note.text IS NOT NULL');
							qb.orWhere('note.fileIds != \'{}\'');
							qb.orWhere('0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)');
						}));
					}

					if (ps.includeRenotedMyNotes === false) {
						query.andWhere(new Brackets(qb => {
							qb.orWhere('note.renoteUserId != :meId', { meId: me.id });
							qb.orWhere('note.renoteId IS NULL');
							qb.orWhere('note.text IS NOT NULL');
							qb.orWhere('note.fileIds != \'{}\'');
							qb.orWhere('0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)');
						}));
					}

					if (ps.includeLocalRenotes === false) {
						query.andWhere(new Brackets(qb => {
							qb.orWhere('note.renoteUserHost IS NOT NULL');
							qb.orWhere('note.renoteId IS NULL');
							qb.orWhere('note.text IS NOT NULL');
							qb.orWhere('note.fileIds != \'{}\'');
							qb.orWhere('0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)');
						}));
					}

					if (ps.withFiles) {
						query.andWhere('note.fileIds != \'{}\'');
					}
					//#endregion

					const timeline = await query.limit(ps.limit).getMany();

					process.nextTick(() => {
						this.activeUsersChart.read(me);
					});

					return await this.noteEntityService.packMany(timeline, me);
				}
			} else {
				const followees = await this.followingsRepository.createQueryBuilder('following')
				.select('following.followeeId')
				.where('following.followerId = :followerId', { followerId: me.id })
				.getMany();

			//#region Construct query
				const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
					ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
					// パフォーマンス上の利点が無さそう？
					//.andWhere('note.id > :minId', { minId: this.idService.genId(new Date(Date.now() - (1000 * 60 * 60 * 24 * 10))) }) // 10日前まで
					.innerJoinAndSelect('note.user', 'user')
					.leftJoinAndSelect('note.reply', 'reply')
					.leftJoinAndSelect('note.renote', 'renote')
					.leftJoinAndSelect('reply.user', 'replyUser')
					.leftJoinAndSelect('renote.user', 'renoteUser');

				if (followees.length > 0) {
					const meOrFolloweeIds = [me.id, ...followees.map(f => f.followeeId)];

					query.andWhere('note.userId IN (:...meOrFolloweeIds)', { meOrFolloweeIds: meOrFolloweeIds });
				} else {
					query.andWhere('note.userId = :meId', { meId: me.id });
				}
				// this.queryService.generateChannelQuery(query, me);
				// this.queryService.generateRepliesQuery(query, ps.withReplies, me);
				this.queryService.generateVisibilityQuery(query, me);
				this.queryService.generateMutedUserQuery(query, me);
				// this.queryService.generateMutedNoteQuery(query, me);
				this.queryService.generateBlockedUserQuery(query, me);
				this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

				if (ps.includeMyRenotes === false) {
					query.andWhere(new Brackets(qb => {
						qb.orWhere('note.userId != :meId', { meId: me.id });
						qb.orWhere('note.renoteId IS NULL');
						qb.orWhere('note.text IS NOT NULL');
						qb.orWhere('note.fileIds != \'{}\'');
						qb.orWhere('0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)');
					}));
				}

				if (ps.includeRenotedMyNotes === false) {
					query.andWhere(new Brackets(qb => {
						qb.orWhere('note.renoteUserId != :meId', { meId: me.id });
						qb.orWhere('note.renoteId IS NULL');
						qb.orWhere('note.text IS NOT NULL');
						qb.orWhere('note.fileIds != \'{}\'');
						qb.orWhere('0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)');
					}));
				}

				if (ps.includeLocalRenotes === false) {
					query.andWhere(new Brackets(qb => {
						qb.orWhere('note.renoteUserHost IS NOT NULL');
						qb.orWhere('note.renoteId IS NULL');
						qb.orWhere('note.text IS NOT NULL');
						qb.orWhere('note.fileIds != \'{}\'');
						qb.orWhere('0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)');
					}));
				}

				if (ps.withFiles) {
					query.andWhere('note.fileIds != \'{}\'');
				}

				if (ps.withRenotes === false) {
					query.andWhere(new Brackets(qb => {
						qb.orWhere('note.renoteId IS NULL');
						qb.orWhere(new Brackets(qb => {
							qb.orWhere('note.text IS NOT NULL');
							qb.orWhere('note.fileIds != \'{}\'');
						}));
					}));
				}
				//#endregion
				const metainfo = await this.metaService.fetch();
				const timelineforredis = await query.limit(ps.withFiles ? metainfo.perUserHomeTimelineCacheMax:metainfo.perUserHomeTimelineCacheMax/2).getMany();

				for (const note of timelineforredis) {
					this.funoutTimelineService.pushall(ps.withFiles ? `homeTimelineWithFiles:${me.id}` : `homeTimeline:${me.id}`,note.id);
				}

				// const timeline = await query.limit(ps.limit).getMany();
				const timeline = timelineforredis.slice(0, ps.limit);

				process.nextTick(() => {
					this.activeUsersChart.read(me);
				});

				funoutTimelineService.keyexpire(ps.withFiles ? `homeTimelineWithFiles:${me.id}` : `homeTimeline:${me.id}`,60*60*24*7);

				return await this.noteEntityService.packMany(timeline, me);
			}
		});
	}
}
