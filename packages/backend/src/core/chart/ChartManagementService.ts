import { Injectable, Inject } from '@nestjs/common';

import FederationChart from './charts/federation.js';
import NotesChart from './charts/notes.js';
import UsersChart from './charts/users.js';
import ActiveUsersChart from './charts/active-users.js';
import InstanceChart from './charts/instance.js';
import PerUserNotesChart from './charts/per-user-notes.js';
import DriveChart from './charts/drive.js';
import PerUserReactionsChart from './charts/per-user-reactions.js';
import HashtagChart from './charts/hashtag.js';
import PerUserFollowingChart from './charts/per-user-following.js';
import PerUserDriveChart from './charts/per-user-drive.js';
import ApRequestChart from './charts/ap-request.js';
import type { OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class ChartManagementService implements OnApplicationShutdown {
	private charts;
	private saveIntervalId: NodeJS.Timer;

	constructor(
		private federationChart: FederationChart,
		private notesChart: NotesChart,
		private usersChart: UsersChart,
		private activeUsersChart: ActiveUsersChart,
		private instanceChart: InstanceChart,
		private perUserNotesChart: PerUserNotesChart,
		private driveChart: DriveChart,
		private perUserReactionsChart: PerUserReactionsChart,
		private hashtagChart: HashtagChart,
		private perUserFollowingChart: PerUserFollowingChart,
		private perUserDriveChart: PerUserDriveChart,
		private apRequestChart: ApRequestChart,
	) {
		this.charts = [
			this.federationChart,
			this.notesChart,
			this.usersChart,
			this.activeUsersChart,
			this.instanceChart,
			this.perUserNotesChart,
			this.driveChart,
			this.perUserReactionsChart,
			this.hashtagChart,
			this.perUserFollowingChart,
			this.perUserDriveChart,
			this.apRequestChart,
		];
	}

	public async run() {
		// 20分おきにメモリ情報をDBに書き込み
		this.saveIntervalId = setInterval(() => {
			for (const chart of this.charts) {
				chart.save();
			}
		}, 1000 * 60 * 20);
	}

	async onApplicationShutdown(signal: string): Promise<void> {
		clearInterval(this.saveIntervalId);
		await Promise.all(
			this.charts.map(chart => chart.save()),
		);
	}
}
