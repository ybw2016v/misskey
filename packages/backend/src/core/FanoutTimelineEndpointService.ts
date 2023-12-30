/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { Packed } from '@/misc/json-schema.js';
import type { NotesRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { FanoutTimelineName, FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { isPureRenote } from '@/misc/is-pure-renote.js';
import { CacheService } from '@/core/CacheService.js';
import { isReply } from '@/misc/is-reply.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { MetaService } from '@/core/MetaService.js';

type TimelineOptions = {
	untilId: string | null,
	sinceId: string | null,
	limit: number,
	allowPartial: boolean,
	me?: { id: MiUser['id'] } | undefined | null,
	useDbFallback: boolean,
	redisTimelines: FanoutTimelineName[],
	noteFilter?: (note: MiNote) => boolean,
	alwaysIncludeMyNotes?: boolean;
	ignoreAuthorFromBlock?: boolean;
	ignoreAuthorFromMute?: boolean;
	excludeNoFiles?: boolean;
	excludeReplies?: boolean;
	excludePureRenotes: boolean;
	dbFallback: (untilId: string | null, sinceId: string | null, limit: number,nofilte ? : boolean | null) => Promise<MiNote[]>,
};

@Injectable()
export class FanoutTimelineEndpointService {
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteEntityService: NoteEntityService,
		private cacheService: CacheService,
		private fanoutTimelineService: FanoutTimelineService,
		private metaService: MetaService,
	) {
	}

	@bindThis
	async timeline(ps: TimelineOptions): Promise<Packed<'Note'>[]> {
		return await this.noteEntityService.packMany(await this.getMiNotes(ps), ps.me);
	}

	@bindThis
	private async getMiNotes(ps: TimelineOptions): Promise<MiNote[]> {
		let noteIds: string[];
		let shouldFallbackToDb = false;
		// let needexpire = false;

		// 呼び出し元と以下の処理をシンプルにするためにdbFallbackを置き換える
		if (!ps.useDbFallback) ps.dbFallback = () => Promise.resolve([]);


		const shouldPrepend = ps.sinceId && !ps.untilId;
		const idCompare: (a: string, b: string) => number = shouldPrepend ? (a, b) => a < b ? -1 : 1 : (a, b) => a > b ? -1 : 1;

		const redisResult = await this.fanoutTimelineService.getMulti(ps.redisTimelines, ps.untilId, ps.sinceId);

		// TODO: いい感じにgetMulti内でソート済だからuniqするときにredisResultが全てソート済なのを利用して再ソートを避けたい
		const redisResultIds = Array.from(new Set(redisResult.flat(1)));

		redisResultIds.sort(idCompare);
		noteIds = redisResultIds.slice(0, ps.limit);

		shouldFallbackToDb = shouldFallbackToDb || (noteIds.length === 0);

		if (!shouldFallbackToDb) {

			for (const n of ps.redisTimelines) {
				if (n.startsWith("homeTimeline") || n.startsWith("userTimeline") || n.startsWith("userListTimeline") || n.startsWith("localTimelineWithReplyTo")) {
					this.fanoutTimelineService.keyexpire(n, 60 * 60 * 24 * 7);
				}
			}

			let filter = ps.noteFilter ?? (_note => true);

			if (ps.alwaysIncludeMyNotes && ps.me) {
				const me = ps.me;
				const parentFilter = filter;
				filter = (note) => note.userId === me.id || parentFilter(note);
			}

			if (ps.excludeNoFiles) {
				const parentFilter = filter;
				filter = (note) => note.fileIds.length !== 0 && parentFilter(note);
			}

			if (ps.excludeReplies) {
				const parentFilter = filter;
				filter = (note) => !isReply(note, ps.me?.id) && parentFilter(note);
			}

			if (ps.excludePureRenotes) {
				const parentFilter = filter;
				filter = (note) => !isPureRenote(note) && parentFilter(note);
			}

			if (ps.me) {
				const me = ps.me;
				const [
					userIdsWhoMeMuting,
					userIdsWhoMeMutingRenotes,
					userIdsWhoBlockingMe,
					userMutedInstances,
				] = await Promise.all([
					this.cacheService.userMutingsCache.fetch(ps.me.id),
					this.cacheService.renoteMutingsCache.fetch(ps.me.id),
					this.cacheService.userBlockedCache.fetch(ps.me.id),
					this.cacheService.userProfileCache.fetch(me.id).then(p => new Set(p.mutedInstances)),
				]);

				const parentFilter = filter;
				filter = (note) => {
					if (isUserRelated(note, userIdsWhoBlockingMe, ps.ignoreAuthorFromBlock)) return false;
					if (isUserRelated(note, userIdsWhoMeMuting, ps.ignoreAuthorFromMute)) return false;
					if (isPureRenote(note) && isUserRelated(note, userIdsWhoMeMutingRenotes, ps.ignoreAuthorFromMute)) return false;
					if (isInstanceMuted(note, userMutedInstances)) return false;

					return parentFilter(note);
				};
			}

			const redisTimeline: MiNote[] = [];
			let readFromRedis = 0;
			let lastSuccessfulRate = 1; // rateをキャッシュする？

			while ((redisResultIds.length - readFromRedis) !== 0) {
				const remainingToRead = ps.limit - redisTimeline.length;

				// DBからの取り直しを減らす初回と同じ割合以上で成功すると仮定するが、クエリの長さを考えて三倍まで
				const countToGet = Math.ceil(remainingToRead * Math.min(1.1 / lastSuccessfulRate, 3));
				noteIds = redisResultIds.slice(readFromRedis, readFromRedis + countToGet);

				readFromRedis += noteIds.length;

				const gotFromDb = await this.getAndFilterFromDb(noteIds, filter, idCompare);
				redisTimeline.push(...gotFromDb);
				lastSuccessfulRate = gotFromDb.length / noteIds.length;

				if (ps.allowPartial ? redisTimeline.length !== 0 : redisTimeline.length >= ps.limit) {
					// 十分Redisからとれた
					const result = redisTimeline.slice(0, ps.limit);
					if (shouldPrepend) result.reverse();
					return result;
				}
			}

			// まだ足りない分はDBにフォールバック
			const remainingToRead = ps.limit - redisTimeline.length;
			let dbUntil: string | null;
			let dbSince: string | null;
			if (shouldPrepend) {
				redisTimeline.reverse();
				dbUntil = ps.untilId;
				dbSince = noteIds[noteIds.length - 1];
			} else {
				dbUntil = noteIds[noteIds.length - 1];
				dbSince = ps.sinceId;
			}
			const gotFromDb = await ps.dbFallback(dbUntil, dbSince, remainingToRead);
			return shouldPrepend ? [...gotFromDb, ...redisTimeline] : [...redisTimeline, ...gotFromDb];
		}

		let needInit = false;

		for (const n of ps.redisTimelines) {
			if (n.startsWith("homeTimeline") || n.startsWith("userTimeline") || n.startsWith("userListTimeline") ) {
				const exist = await this.fanoutTimelineService.isexist(n);
				if (exist==0) {
					needInit = true;
					break;
				}
			}
		}

		if (needInit) { //重建缓存
			const serverSettings = await this.metaService.fetch();
			let maxlimit = 300;
			if (ps.redisTimelines[0].startsWith('userListTimeline')) {
				maxlimit = ps.redisTimelines[0].startsWith('userListTimelineWithFiles') ? serverSettings.perUserListTimelineCacheMax / 2 : serverSettings.perUserListTimelineCacheMax;
			} else if (ps.redisTimelines[0].startsWith('homeTimeline')) {
				maxlimit = ps.redisTimelines[0].startsWith('homeTimelineWithFiles') ? serverSettings.perUserHomeTimelineCacheMax / 2 : serverSettings.perUserHomeTimelineCacheMax;
			} else if (ps.redisTimelines[0].startsWith('userTimeline')) {
				maxlimit = ps.redisTimelines[0].startsWith('userTimelineWithFiles') ? serverSettings.perLocalUserUserTimelineCacheMax / 2 : serverSettings.perLocalUserUserTimelineCacheMax;
			}

			const notelist = await ps.dbFallback(null,null,maxlimit,true);
			for (const nn of ps.redisTimelines){
				if (nn.startsWith("localTimelineWithReplyTo")) {
					continue;
				}
				for (const n in notelist) {
					this.fanoutTimelineService.pushall(nn, notelist[n].id);
				}
				this.fanoutTimelineService.keyexpire(nn, 60 * 60 * 24 * 7);
			} // 重建完毕

			return notelist.slice(0, ps.limit);
		}

		return await ps.dbFallback(ps.untilId, ps.sinceId, ps.limit);
	}

	private async getAndFilterFromDb(noteIds: string[], noteFilter: (note: MiNote) => boolean, idCompare: (a: string, b: string) => number): Promise<MiNote[]> {
		const query = this.notesRepository.createQueryBuilder('note')
			.where('note.id IN (:...noteIds)', { noteIds: noteIds })
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.leftJoinAndSelect('note.channel', 'channel');

		const notes = (await query.getMany()).filter(noteFilter);

		notes.sort((a, b) => idCompare(a.id, b.id));

		return notes;
	}
}
