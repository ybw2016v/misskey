/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { NotesRepository, UserListsRepository, UserListMembershipsRepository, MiNote } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { IdService } from '@/core/IdService.js';
import { MetaService } from '@/core/MetaService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { RedisTimelineService } from '@/core/RedisTimelineService.js';
import { ApiError } from '../../error.js';
import timeline from './timeline.js';

export const meta = {
	tags: ['notes', 'lists'],

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

	errors: {
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '8fb1fbd5-e476-4c37-9fb0-43d55b63a2ff',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		includeMyRenotes: { type: 'boolean', default: true },
		includeRenotedMyNotes: { type: 'boolean', default: true },
		includeLocalRenotes: { type: 'boolean', default: true },
		withRenotes: { type: 'boolean', default: true },
		withFiles: {
			type: 'boolean',
			default: false,
			description: 'Only show notes that have attached files.',
		},
	},
	required: ['listId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private noteEntityService: NoteEntityService,
		private activeUsersChart: ActiveUsersChart,
		private cacheService: CacheService,
		private idService: IdService,
		private redisTimelineService: RedisTimelineService,
		private queryService: QueryService,

		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.genId(new Date(ps.untilDate!)) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.genId(new Date(ps.sinceDate!)) : null);

			const list = await this.userListsRepository.findOneBy({
				id: ps.listId,
				userId: me.id,
			});

			if (list == null) {
				throw new ApiError(meta.errors.noSuchList);
			}

			const listexist = await this.redisTimelineService.isexist(ps.withFiles ? `userListTimelineWithFiles:${list.id}` : `userListTimeline:${list.id}`);

			if (listexist > 0) {
				const [
					userIdsWhoMeMuting,
					userIdsWhoMeMutingRenotes,
					userIdsWhoBlockingMe,
				] = await Promise.all([
					this.cacheService.userMutingsCache.fetch(me.id),
					this.cacheService.renoteMutingsCache.fetch(me.id),
					this.cacheService.userBlockedCache.fetch(me.id),
				]);

				let noteIds = await this.redisTimelineService.get(ps.withFiles ? `userListTimelineWithFiles:${list.id}` : `userListTimeline:${list.id}`, untilId, sinceId);
				noteIds = noteIds.slice(0, ps.limit);

				if (noteIds.length === 0) {
					return [];
				}

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

					return true;
				});

				// TODO: フィルタした結果件数が足りなかった場合の対応

				timeline.sort((a, b) => a.id > b.id ? -1 : 1);

				this.activeUsersChart.read(me);

				const res = await this.noteEntityService.packMany(timeline, me);
				this.redisTimelineService.keyexpire(ps.withFiles ? `userListTimelineWithFiles:${list.id}` : `userListTimeline:${list.id}`,60*60*24*7);
				return res;
			} else {
				const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
					.innerJoin(this.userListMembershipsRepository.metadata.targetName, 'userMemberships', 'userMemberships.userId = note.userId')
					.innerJoinAndSelect('note.user', 'user')
					.leftJoinAndSelect('note.reply', 'reply')
					.leftJoinAndSelect('note.renote', 'renote')
					.leftJoinAndSelect('reply.user', 'replyUser')
					.leftJoinAndSelect('renote.user', 'renoteUser')
					.andWhere('userMemberships.userListId = :userListId', { userListId: list.id });

				this.queryService.generateVisibilityQuery(query, me);
				this.queryService.generateMutedUserQuery(query, me);
				this.queryService.generateBlockedUserQuery(query, me);
				this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

				if (ps.withFiles) {
					query.andWhere('note.fileIds != \'{}\'');
				}
				//#endregion
				const metainfo = await this.metaService.fetch();
				const timelineforredis = await query.limit(ps.withFiles ? metainfo.perUserListTimelineCacheMax/2 : metainfo.perUserListTimelineCacheMax).getMany();

				for (const note of timelineforredis) {
					this.redisTimelineService.pushall(ps.withFiles ? `userListTimelineWithFiles:${list.id}` : `userListTimeline:${list.id}`,note.id);
				}

				this.activeUsersChart.read(me);

				const timeline = timelineforredis.slice(0, ps.limit);

				const res = await this.noteEntityService.packMany(timeline, me);
				this.redisTimelineService.keyexpire(ps.withFiles ? `userListTimelineWithFiles:${list.id}` : `userListTimeline:${list.id}`,60*60*24*7);
				return res;
			}
		});
	}
}
