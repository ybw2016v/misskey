/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiNote, NotesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { QueryService } from '@/core/QueryService.js';
import { RedisTimelineService } from '@/core/RedisTimelineService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users', 'notes'],
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '27e494ba-2ac2-48e8-893b-10d4d8c2387b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		withReplies: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		withChannelNotes: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		includeMyRenotes: { type: 'boolean', default: true },
		withFiles: { type: 'boolean', default: false },
		excludeNsfw: { type: 'boolean', default: false },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private cacheService: CacheService,
		private idService: IdService,
		private redisTimelineService: RedisTimelineService,

		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.genId(new Date(ps.untilDate!)) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.genId(new Date(ps.sinceDate!)) : null);
			const isRangeSpecified = untilId != null && sinceId != null;
			const isSelf = me && (me.id === ps.userId);

			if (isRangeSpecified || sinceId == null) {
				const [
					userIdsWhoMeMuting,
				] = me ? await Promise.all([
					this.cacheService.userMutingsCache.fetch(me.id),
				]) : [new Set<string>()];

				const usertimelineexist = await this.redisTimelineService.isexist(ps.withFiles ? `userTimelineWithFiles:${ps.userId}` : `userTimeline:${ps.userId}`);
				if (usertimelineexist === 0) {
					const queryutl = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note')).andWhere('note.userId = :userId', { userId: ps.userId })
						.innerJoinAndSelect('note.user', 'user')
						.leftJoinAndSelect('note.reply', 'reply')
						.leftJoinAndSelect('note.renote', 'renote')
						.leftJoinAndSelect('note.channel', 'channel')
						.leftJoinAndSelect('reply.user', 'replyUser')
						.leftJoinAndSelect('renote.user', 'renoteUser').andWhere('note.channelId IS NULL');
					this.queryService.generateVisibilityQuery(queryutl, me);
					if (me) {
						this.queryService.generateMutedUserQuery(queryutl, me, { id: ps.userId });
						this.queryService.generateBlockedUserQuery(queryutl, me);
					}
					if (ps.withFiles) {
						queryutl.andWhere('note.fileIds != \'{}\'');
					}
					const metainfo = await this.metaService.fetch();
					const user = await this.usersRepository.findOneBy({ id: ps.userId });
					const limnum = user?.host == null ? metainfo.perLocalUserUserTimelineCacheMax : metainfo.perRemoteUserUserTimelineCacheMax;
					const timelineutl = await queryutl.limit(limnum).getMany();
					for (const note of timelineutl) {
						if (note.replyId == null) {
							this.redisTimelineService.pushall(ps.withFiles ? `userTimelineWithFiles:${ps.userId}` : `userTimeline:${ps.userId}`, note.id);
						}
					}
					const utlrpexist = await this.redisTimelineService.isexist(`userTimelineWithReplies:${ps.userId}`);
					if (utlrpexist === 0) {
						for (const note of timelineutl) {
							if (note.replyId != null) {
								this.redisTimelineService.pushall(`userTimelineWithReplies:${ps.userId}`, note.id);
							}
						}
					}
					const utlcexist = await this.redisTimelineService.isexist(`userTimelineWithChannel:${ps.userId}`);
					if (utlrpexist === 0) {
						const querycl = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note')).andWhere('note.userId = :userId', { userId: ps.userId })
							.innerJoinAndSelect('note.user', 'user')
							.leftJoinAndSelect('note.reply', 'reply')
							.leftJoinAndSelect('note.renote', 'renote')
							.leftJoinAndSelect('note.channel', 'channel')
							.leftJoinAndSelect('reply.user', 'replyUser')
							.leftJoinAndSelect('renote.user', 'renoteUser');
						this.queryService.generateVisibilityQuery(querycl, me);
						if (me) {
							this.queryService.generateMutedUserQuery(querycl, me, { id: ps.userId });
							this.queryService.generateBlockedUserQuery(querycl, me);
						}
						if (!isSelf) querycl.andWhere('channel.isSensitive = false');
						const timelinecl = await querycl.limit(limnum).getMany();
						for (const note of timelinecl) {
							this.redisTimelineService.pushall(`userTimelineWithReplies:${ps.userId}`, note.id);
						}
					}
				}


				const [noteIdsRes, repliesNoteIdsRes, channelNoteIdsRes] = await Promise.all([
					this.redisTimelineService.get(ps.withFiles ? `userTimelineWithFiles:${ps.userId}` : `userTimeline:${ps.userId}`, untilId, sinceId),
					ps.withReplies ? this.redisTimelineService.get(`userTimelineWithReplies:${ps.userId}`, untilId, sinceId) : Promise.resolve([]),
					ps.withChannelNotes ? this.redisTimelineService.get(`userTimelineWithChannel:${ps.userId}`, untilId, sinceId) : Promise.resolve([]),
				]);
				this.redisTimelineService.keyexpire(ps.withFiles ? `userTimelineWithFiles:${ps.userId}` : `userTimeline:${ps.userId}`,60*60*24*7);
				this.redisTimelineService.keyexpire(`userTimelineWithReplies:${ps.userId}`,60*60*24*7);
				this.redisTimelineService.keyexpire(`userTimelineWithChannel:${ps.userId}`,60*60*24*7);

				let noteIds = Array.from(new Set([
					...noteIdsRes,
					...repliesNoteIdsRes,
					...channelNoteIdsRes,
				]));
				noteIds.sort((a, b) => a > b ? -1 : 1);
				noteIds = noteIds.slice(0, ps.limit);

				if (noteIds.length > 0) {
					const isFollowing = me && Object.hasOwn(await this.cacheService.userFollowingsCache.fetch(me.id), ps.userId);

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
						if (me && isUserRelated(note, userIdsWhoMeMuting, true)) return false;

						if (note.renoteId) {
							if (note.text == null && note.fileIds.length === 0 && !note.hasPoll) {
								if (ps.withRenotes === false) return false;
							}
						}

						if (note.channel?.isSensitive && !isSelf) return false;
						if (note.visibility === 'specified' && (!me || (me.id !== note.userId && !note.visibleUserIds.some(v => v === me.id)))) return false;
						if (note.visibility === 'followers' && !isFollowing && !isSelf) return false;

						return true;
					});

					// TODO: フィルタで件数が減った場合の埋め合わせ処理

					timeline.sort((a, b) => a.id > b.id ? -1 : 1);

					if (timeline.length > 0) {
						return await this.noteEntityService.packMany(timeline, me);
					} else {
						return [];
					}
				} else {
					return [];
				}
			} else {

				//#region fallback to database
				const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
					.andWhere('note.userId = :userId', { userId: ps.userId })
					.innerJoinAndSelect('note.user', 'user')
					.leftJoinAndSelect('note.reply', 'reply')
					.leftJoinAndSelect('note.renote', 'renote')
					.leftJoinAndSelect('note.channel', 'channel')
					.leftJoinAndSelect('reply.user', 'replyUser')
					.leftJoinAndSelect('renote.user', 'renoteUser');

				if (ps.withChannelNotes) {
					if (!isSelf) query.andWhere('channel.isSensitive = false');
				} else {
					query.andWhere('note.channelId IS NULL');
				}

				this.queryService.generateVisibilityQuery(query, me);
				if (me) {
					this.queryService.generateMutedUserQuery(query, me, { id: ps.userId });
					this.queryService.generateBlockedUserQuery(query, me);
				}

				if (ps.withFiles) {
					query.andWhere('note.fileIds != \'{}\'');
				}

				if (ps.includeMyRenotes === false) {
					query.andWhere(new Brackets(qb => {
						qb.orWhere('note.userId != :userId', { userId: ps.userId });
						qb.orWhere('note.renoteId IS NULL');
						qb.orWhere('note.text IS NOT NULL');
						qb.orWhere('note.fileIds != \'{}\'');
						qb.orWhere('0 < (SELECT COUNT(*) FROM poll WHERE poll."noteId" = note.id)');
					}));
				}

				const timeline = await query.limit(ps.limit).getMany();

				return await this.noteEntityService.packMany(timeline, me);
			}
			//#endregion
		});
	}
}
