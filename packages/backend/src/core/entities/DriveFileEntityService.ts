import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import * as mfm from 'mfm-js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, DriveFilesRepository } from '@/models/index.js';
import type { Config } from '@/config.js';
import type { Packed } from '@/misc/schema.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { User } from '@/models/entities/User.js';
import type { DriveFile } from '@/models/entities/DriveFile.js';
import { appendQuery, query } from '@/misc/prelude/url.js';
import { deepClone } from '@/misc/clone.js';
import { UtilityService } from '../UtilityService.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFolderEntityService } from './DriveFolderEntityService.js';

type PackOptions = {
	detail?: boolean,
	self?: boolean,
	withUser?: boolean,
};
import { bindThis } from '@/decorators.js';

@Injectable()
export class DriveFileEntityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		// 循環参照のため / for circular dependency
		@Inject(forwardRef(() => UserEntityService))
		private userEntityService: UserEntityService,

		private utilityService: UtilityService,
		private driveFolderEntityService: DriveFolderEntityService,
	) {
	}
	
	@bindThis
	public validateFileName(name: string): boolean {
		return (
			(name.trim().length > 0) &&
			(name.length <= 200) &&
			(name.indexOf('\\') === -1) &&
			(name.indexOf('/') === -1) &&
			(name.indexOf('..') === -1)
		);
	}

	@bindThis
	public getPublicProperties(file: DriveFile): DriveFile['properties'] {
		if (file.properties.orientation != null) {
			const properties = deepClone(file.properties);
			if (file.properties.orientation >= 5) {
				[properties.width, properties.height] = [properties.height, properties.width];
			}
			properties.orientation = undefined;
			return properties;
		}

		return file.properties;
	}

	@bindThis
	public getPublicUrl(file: DriveFile, mode? : 'static' | 'avatar'): string | null { // static = thumbnail
		const proxiedUrl = (url: string) => appendQuery(
			`${this.config.mediaProxy}/${mode ?? 'image'}.webp`,
			query({
				url,
				...(mode ? { [mode]: '1' } : {}),
			})
		);

		// リモートかつメディアプロキシ
		if (file.uri != null && file.userHost != null && this.config.externalMediaProxyEnabled) {
			return proxiedUrl(file.uri);
		}

		// リモートかつ期限切れはローカルプロキシを試みる
		if (file.uri != null && file.isLink && this.config.proxyRemoteFiles) {
			const key = mode === 'static' ? file.thumbnailAccessKey : file.webpublicAccessKey;

			if (key && !key.match('/')) {	// 古いものはここにオブジェクトストレージキーが入ってるので除外
				const url = `${this.config.url}/files/${key}`;
				if (mode === 'avatar') return proxiedUrl(url);
				return url;
			}
		}

		const isImage = file.type && ['image/png', 'image/apng', 'image/gif', 'image/jpeg', 'image/webp', 'image/avif', 'image/svg+xml'].includes(file.type);

		if (mode === 'static') {
			return file.thumbnailUrl ?? (isImage ? (file.webpublicUrl ?? file.url) : null);
		}

		const url = file.webpublicUrl ?? file.url;

		if (mode === 'avatar') return proxiedUrl(url);
		return url;
	}

	@bindThis
	public async calcDriveUsageOf(user: User['id'] | { id: User['id'] }): Promise<number> {
		const id = typeof user === 'object' ? user.id : user;

		const { sum } = await this.driveFilesRepository
			.createQueryBuilder('file')
			.where('file.userId = :id', { id: id })
			.andWhere('file.isLink = FALSE')
			.select('SUM(file.size)', 'sum')
			.getRawOne();

		return parseInt(sum, 10) ?? 0;
	}

	@bindThis
	public async calcDriveUsageOfHost(host: string): Promise<number> {
		const { sum } = await this.driveFilesRepository
			.createQueryBuilder('file')
			.where('file.userHost = :host', { host: this.utilityService.toPuny(host) })
			.andWhere('file.isLink = FALSE')
			.select('SUM(file.size)', 'sum')
			.getRawOne();

		return parseInt(sum, 10) ?? 0;
	}

	@bindThis
	public async calcDriveUsageOfLocal(): Promise<number> {
		const { sum } = await this.driveFilesRepository
			.createQueryBuilder('file')
			.where('file.userHost IS NULL')
			.andWhere('file.isLink = FALSE')
			.select('SUM(file.size)', 'sum')
			.getRawOne();

		return parseInt(sum, 10) ?? 0;
	}

	@bindThis
	public async calcDriveUsageOfRemote(): Promise<number> {
		const { sum } = await this.driveFilesRepository
			.createQueryBuilder('file')
			.where('file.userHost IS NOT NULL')
			.andWhere('file.isLink = FALSE')
			.select('SUM(file.size)', 'sum')
			.getRawOne();

		return parseInt(sum, 10) ?? 0;
	}

	@bindThis
	public async pack(
		src: DriveFile['id'] | DriveFile,
		options?: PackOptions,
	): Promise<Packed<'DriveFile'>> {
		const opts = Object.assign({
			detail: false,
			self: false,
		}, options);

		const file = typeof src === 'object' ? src : await this.driveFilesRepository.findOneByOrFail({ id: src });

		return await awaitAll<Packed<'DriveFile'>>({
			id: file.id,
			createdAt: file.createdAt.toISOString(),
			name: file.name,
			type: file.type,
			md5: file.md5,
			size: file.size,
			isSensitive: file.isSensitive,
			blurhash: file.blurhash,
			properties: opts.self ? file.properties : this.getPublicProperties(file),
			url: opts.self ? file.url : this.getPublicUrl(file),
			thumbnailUrl: this.getPublicUrl(file, 'static'),
			comment: file.comment,
			folderId: file.folderId,
			folder: opts.detail && file.folderId ? this.driveFolderEntityService.pack(file.folderId, {
				detail: true,
			}) : null,
			userId: opts.withUser ? file.userId : null,
			user: (opts.withUser && file.userId) ? this.userEntityService.pack(file.userId) : null,
		});
	}

	@bindThis
	public async packNullable(
		src: DriveFile['id'] | DriveFile,
		options?: PackOptions,
	): Promise<Packed<'DriveFile'> | null> {
		const opts = Object.assign({
			detail: false,
			self: false,
		}, options);

		const file = typeof src === 'object' ? src : await this.driveFilesRepository.findOneBy({ id: src });
		if (file == null) return null;

		return await awaitAll<Packed<'DriveFile'>>({
			id: file.id,
			createdAt: file.createdAt.toISOString(),
			name: file.name,
			type: file.type,
			md5: file.md5,
			size: file.size,
			isSensitive: file.isSensitive,
			blurhash: file.blurhash,
			properties: opts.self ? file.properties : this.getPublicProperties(file),
			url: opts.self ? file.url : this.getPublicUrl(file),
			thumbnailUrl: this.getPublicUrl(file, 'static'),
			comment: file.comment,
			folderId: file.folderId,
			folder: opts.detail && file.folderId ? this.driveFolderEntityService.pack(file.folderId, {
				detail: true,
			}) : null,
			userId: opts.withUser ? file.userId : null,
			user: (opts.withUser && file.userId) ? this.userEntityService.pack(file.userId) : null,
		});
	}

	@bindThis
	public async packMany(
		files: (DriveFile['id'] | DriveFile)[],
		options?: PackOptions,
	): Promise<Packed<'DriveFile'>[]> {
		const items = await Promise.all(files.map(f => this.packNullable(f, options)));
		return items.filter((x): x is Packed<'DriveFile'> => x != null);
	}
}
