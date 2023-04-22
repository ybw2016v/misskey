process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import * as childProcess from 'child_process';
import * as openapi from '@redocly/openapi-core';
import { startServer, signup, post, request, simpleGet, port, shutdownServer, api } from '../utils.js';

describe('Endpoints', () => {
	let p: childProcess.ChildProcess;

	let alice: any;
	let bob: any;

	beforeAll(async () => {
		p = await startServer();
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
	}, 1000 * 30);

	afterAll(async () => {
		await shutdownServer(p);
	});

	describe('signup', () => {
		test('不正なユーザー名でアカウントが作成できない', async () => {
			const res = await request('api/signup', {
				username: 'test.',
				password: 'test',
			});
			assert.strictEqual(res.status, 400);
		});

		test('空のパスワードでアカウントが作成できない', async () => {
			const res = await request('api/signup', {
				username: 'test',
				password: '',
			});
			assert.strictEqual(res.status, 400);
		});

		test('正しくアカウントが作成できる', async () => {
			const me = {
				username: 'test1',
				password: 'test1',
			};

			const res = await request('api/signup', me);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.username, me.username);
		});

		test('同じユーザー名のアカウントは作成できない', async () => {
			const res = await request('api/signup', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 400);
		});
	});

	describe('signin', () => {
		test('間違ったパスワードでサインインできない', async () => {
			const res = await request('api/signin', {
				username: 'test1',
				password: 'bar',
			});

			assert.strictEqual(res.status, 403);
		});

		test('クエリをインジェクションできない', async () => {
			const res = await request('api/signin', {
				username: 'test1',
				password: {
					$gt: '',
				},
			});

			assert.strictEqual(res.status, 400);
		});

		test('正しい情報でサインインできる', async () => {
			const res = await request('api/signin', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 200);
		});
	});

	describe('i/update', () => {
		test('アカウント設定を更新できる', async () => {
			const myName = '大室櫻子';
			const myLocation = '七森中';
			const myBirthday = '2000-09-07';

			const res = await api('/i/update', {
				name: myName,
				location: myLocation,
				birthday: myBirthday,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, myName);
			assert.strictEqual(res.body.location, myLocation);
			assert.strictEqual(res.body.birthday, myBirthday);
		});

		test('名前を空白にできない', async () => {
			const res = await api('/i/update', {
				name: ' ',
			}, alice);
			assert.strictEqual(res.status, 400);
		});

		test('誕生日の設定を削除できる', async () => {
			await api('/i/update', {
				birthday: '2000-09-07',
			}, alice);

			const res = await api('/i/update', {
				birthday: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.birthday, null);
		});

		test('不正な誕生日の形式で怒られる', async () => {
			const res = await api('/i/update', {
				birthday: '2000/09/07',
			}, alice);
			assert.strictEqual(res.status, 400);
		});
	});

	describe('users/show', () => {
		test('ユーザーが取得できる', async () => {
			const res = await api('/users/show', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.id, alice.id);
		});

		test('ユーザーが存在しなかったら怒る', async () => {
			const res = await api('/users/show', {
				userId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('/users/show', {
				userId: 'kyoppie',
			});
			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/show', () => {
		test('投稿が取得できる', async () => {
			const myPost = await post(alice, {
				text: 'test',
			});

			const res = await api('/notes/show', {
				noteId: myPost.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.id, myPost.id);
			assert.strictEqual(res.body.text, myPost.text);
		});

		test('投稿が存在しなかったら怒る', async () => {
			const res = await api('/notes/show', {
				noteId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('/notes/show', {
				noteId: 'kyoppie',
			});
			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/reactions/create', () => {
		test('リアクションできる', async () => {
			const bobPost = await post(bob);

			const alice = await signup({ username: 'alice' });
			const res = await api('/notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);

			const resNote = await api('/notes/show', {
				noteId: bobPost.id,
			}, alice);

			assert.strictEqual(resNote.status, 200);
			assert.strictEqual(resNote.body.reactions['🚀'], [alice.id]);
		});

		test('自分の投稿にもリアクションできる', async () => {
			const myPost = await post(alice);

			const res = await api('/notes/reactions/create', {
				noteId: myPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('二重にリアクションできない', async () => {
			const bobPost = await post(bob);

			await api('/notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🥰',
			}, alice);

			const res = await api('/notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しない投稿にはリアクションできない', async () => {
			const res = await api('/notes/reactions/create', {
				noteId: '000000000000000000000000',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			const res = await api('/notes/reactions/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('/notes/reactions/create', {
				noteId: 'kyoppie',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/create', () => {
		test('フォローできる', async () => {
			const res = await api('/following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);
		});

		test('既にフォローしている場合は怒る', async () => {
			const res = await api('/following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォローできない', async () => {
			const res = await api('/following/create', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォローできない', async () => {
			const res = await api('/following/create', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			const res = await api('/following/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('/following/create', {
				userId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/delete', () => {
		test('フォロー解除できる', async () => {
			await api('/following/create', {
				userId: alice.id,
			}, bob);

			const res = await api('/following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);
		});

		test('フォローしていない場合は怒る', async () => {
			const res = await api('/following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォロー解除できない', async () => {
			const res = await api('/following/delete', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォロー解除できない', async () => {
			const res = await api('/following/delete', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			const res = await api('/following/delete', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('/following/delete', {
				userId: 'kyoppie',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	/*
	describe('/i', () => {
		test('', async () => {
		});
	});
	*/
});

/*
process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import * as childProcess from 'child_process';
import { async, signup, request, post, react, uploadFile, startServer, shutdownServer } from './utils.js';

describe('API: Endpoints', () => {
	let p: childProcess.ChildProcess;
	let alice: any;
	let bob: any;
	let carol: any;

	before(async () => {
		p = await startServer();
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
	});

	after(async () => {
		await shutdownServer(p);
	});

	describe('drive', () => {
		test('ドライブ情報を取得できる', async () => {
			await uploadFile({
				userId: alice.id,
				size: 256
			});
			await uploadFile({
				userId: alice.id,
				size: 512
			});
			await uploadFile({
				userId: alice.id,
				size: 1024
			});
			const res = await api('/drive', {}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			expect(res.body).have.property('usage').eql(1792);
		}));
	});

	describe('drive/files/create', () => {
		test('ファイルを作成できる', async () => {
			const res = await uploadFile(alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'Lenna.png');
		}));

		test('ファイルに名前を付けられる', async () => {
			const res = await assert.request(server)
				.post('/drive/files/create')
				.field('i', alice.token)
				.field('name', 'Belmond.png')
				.attach('file', fs.readFileSync(__dirname + '/resources/Lenna.png'), 'Lenna.png');

			expect(res).have.status(200);
			expect(res.body).be.a('object');
			expect(res.body).have.property('name').eql('Belmond.png');
		}));

		test('ファイル無しで怒られる', async () => {
			const res = await api('/drive/files/create', {}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('SVGファイルを作成できる', async () => {
			const res = await uploadFile(alice, __dirname + '/resources/image.svg');

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'image.svg');
			assert.strictEqual(res.body.type, 'image/svg+xml');
		}));
	});

	describe('drive/files/update', () => {
		test('名前を更新できる', async () => {
			const file = await uploadFile(alice);
			const newName = 'いちごパスタ.png';

			const res = await api('/drive/files/update', {
				fileId: file.id,
				name: newName
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, newName);
		}));

		test('他人のファイルは更新できない', async () => {
			const file = await uploadFile(bob);

			const res = await api('/drive/files/update', {
				fileId: file.id,
				name: 'いちごパスタ.png'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('親フォルダを更新できる', async () => {
			const file = await uploadFile(alice);
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;

			const res = await api('/drive/files/update', {
				fileId: file.id,
				folderId: folder.id
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, folder.id);
		}));

		test('親フォルダを無しにできる', async () => {
			const file = await uploadFile(alice);

			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;

			await api('/drive/files/update', {
				fileId: file.id,
				folderId: folder.id
			}, alice);

			const res = await api('/drive/files/update', {
				fileId: file.id,
				folderId: null
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, null);
		}));

		test('他人のフォルダには入れられない', async () => {
			const file = await uploadFile(alice);
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, bob)).body;

			const res = await api('/drive/files/update', {
				fileId: file.id,
				folderId: folder.id
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('存在しないフォルダで怒られる', async () => {
			const file = await uploadFile(alice);

			const res = await api('/drive/files/update', {
				fileId: file.id,
				folderId: '000000000000000000000000'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('不正なフォルダIDで怒られる', async () => {
			const file = await uploadFile(alice);

			const res = await api('/drive/files/update', {
				fileId: file.id,
				folderId: 'foo'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('ファイルが存在しなかったら怒る', async () => {
			const res = await api('/drive/files/update', {
				fileId: '000000000000000000000000',
				name: 'いちごパスタ.png'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('間違ったIDで怒られる', async () => {
			const res = await api('/drive/files/update', {
				fileId: 'kyoppie',
				name: 'いちごパスタ.png'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));
	});

	describe('drive/folders/create', () => {
		test('フォルダを作成できる', async () => {
			const res = await api('/drive/folders/create', {
				name: 'test'
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'test');
		}));
	});

	describe('drive/folders/update', () => {
		test('名前を更新できる', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				name: 'new name'
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'new name');
		}));

		test('他人のフォルダを更新できない', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, bob)).body;

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				name: 'new name'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('親フォルダを更新できる', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;
			const parentFolder = (await api('/drive/folders/create', {
				name: 'parent'
			}, alice)).body;

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, parentFolder.id);
		}));

		test('親フォルダを無しに更新できる', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;
			const parentFolder = (await api('/drive/folders/create', {
				name: 'parent'
			}, alice)).body;
			await api('/drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id
			}, alice);

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				parentId: null
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, null);
		}));

		test('他人のフォルダを親フォルダに設定できない', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;
			const parentFolder = (await api('/drive/folders/create', {
				name: 'parent'
			}, bob)).body;

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('フォルダが循環するような構造にできない', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;
			const parentFolder = (await api('/drive/folders/create', {
				name: 'parent'
			}, alice)).body;
			await api('/drive/folders/update', {
				folderId: parentFolder.id,
				parentId: folder.id
			}, alice);

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('フォルダが循環するような構造にできない(再帰的)', async () => {
			const folderA = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;
			const folderB = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;
			const folderC = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;
			await api('/drive/folders/update', {
				folderId: folderB.id,
				parentId: folderA.id
			}, alice);
			await api('/drive/folders/update', {
				folderId: folderC.id,
				parentId: folderB.id
			}, alice);

			const res = await api('/drive/folders/update', {
				folderId: folderA.id,
				parentId: folderC.id
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('フォルダが循環するような構造にできない(自身)', async () => {
			const folderA = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;

			const res = await api('/drive/folders/update', {
				folderId: folderA.id,
				parentId: folderA.id
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('存在しない親フォルダを設定できない', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				parentId: '000000000000000000000000'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('不正な親フォルダIDで怒られる', async () => {
			const folder = (await api('/drive/folders/create', {
				name: 'test'
			}, alice)).body;

			const res = await api('/drive/folders/update', {
				folderId: folder.id,
				parentId: 'foo'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('存在しないフォルダを更新できない', async () => {
			const res = await api('/drive/folders/update', {
				folderId: '000000000000000000000000'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));

		test('不正なフォルダIDで怒られる', async () => {
			const res = await api('/drive/folders/update', {
				folderId: 'foo'
			}, alice);

			assert.strictEqual(res.status, 400);
		}));
	});

	describe('notes/replies', () => {
		test('自分に閲覧権限のない投稿は含まれない', async () => {
			const alicePost = await post(alice, {
				text: 'foo'
			});

			await post(bob, {
				replyId: alicePost.id,
				text: 'bar',
				visibility: 'specified',
				visibleUserIds: [alice.id]
			});

			const res = await api('/notes/replies', {
				noteId: alicePost.id
			}, carol);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		}));
	});

	describe('notes/timeline', () => {
		test('フォロワー限定投稿が含まれる', async () => {
			await api('/following/create', {
				userId: alice.id
			}, bob);

			const alicePost = await post(alice, {
				text: 'foo',
				visibility: 'followers'
			});

			const res = await api('/notes/timeline', {}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].id, alicePost.id);
		}));
	});
});
*/
