import test from 'node:test';
import assert from 'node:assert/strict';
import { characterAliases, characterAvatarValue, characterRelationships } from '../src/lib/characterProfileData.ts';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import express from 'express';

test('profile payloads accept JSON storage and arrays without double encoding', () => {
  assert.equal(characterAliases('["小夏"]'), '["小夏"]');
  assert.equal(characterAliases(['小夏']), '["小夏"]');
  const relation = { targetId: 'other', kind: 'ally', label: ' 同桌 ', notes: '借出草稿本' };
  const expected = [{ ...relation, label: '同桌', directed: false }];
  assert.deepEqual(characterRelationships([relation]), expected);
  assert.deepEqual(characterRelationships(JSON.stringify([relation])), expected);
  assert.equal(characterAvatarValue('school/images/portraits.webp#cell=0,4,3'), 'school/images/portraits.webp#cell=0,4,3');
  assert.equal(characterAvatarValue(null), null);
});

test('malformed relationships and avatar data are rejected before writes', () => {
  for (const value of ['invalid', {}, [{ targetId: 'x', kind: 'invented', label: '好友' }], [{ targetId: 'x', kind: 'ally', label: '' }]]) assert.throws(() => characterRelationships(value), /人物关系/);
  assert.throws(() => characterAliases([42]), /别名/);
  assert.throws(() => characterAvatarValue('//tracking.example/a.png'), /头像/);
  assert.throws(() => characterAvatarValue('data:image/svg+xml,<svg/>'), /头像/);
});

test('character API persists avatars and explicit same-book relationships, rejecting cross-book links', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'novel-character-profile-'));
  const previousDatabase = process.env.DATABASE_URL;
  const previousSecret = process.env.JWT_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.DATABASE_URL = `file:${resolve(directory, 'profiles.db')}`;
  process.env.JWT_SECRET = 'character-profile-test-only';
  process.env.NODE_ENV = 'test';
  const project = fileURLToPath(new URL('../../../', import.meta.url));
  let prisma, server;
  try {
    await writeFile(resolve(directory, 'profiles.db'), '');
    execFileSync(process.execPath, [resolve(project, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', resolve(project, 'packages/backend/prisma/schema.prisma')], { env: process.env, stdio: 'pipe' });
    ({ prisma } = await import('../src/lib/prisma.ts'));
    const { default: router } = await import('../src/routes/characters.ts');
    const { signToken } = await import('../src/middlewares/auth.ts');
    await prisma.user.createMany({ data: [{ id: 'owner', email: 'profile-owner@example.invalid', passwordHash: '!test' }, { id: 'other-owner', email: 'profile-other@example.invalid', passwordHash: '!test' }] });
    await prisma.novel.createMany({ data: [{ id: 'book', userId: 'owner', title: '测试作品' }, { id: 'second-book', userId: 'owner', title: '另一部作品' }, { id: 'private-book', userId: 'other-owner', title: '他人作品' }] });
    await prisma.character.createMany({ data: [{ id: 'friend', novelId: 'book', name: '同桌' }, { id: 'outsider', novelId: 'second-book', name: '别书人物' }, { id: 'private', novelId: 'private-book', name: '他人人物' }] });
    const app = express(); app.use(express.json()); app.use('/api', router);
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const request = (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { authorization: `Bearer ${signToken({ userId: 'owner', email: 'profile-owner@example.invalid' })}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const response = await request('/novels/book/characters', 'POST', { name: '顾夏', aliases: ['小夏'], avatar: 'school/images/portraits.webp#cell=0,4,3', relationships: [{ targetId: 'friend', kind: 'ally', label: '同桌', notes: '共同核对值日表' }] });
    assert.equal(response.status, 201);
    const { character } = await response.json();
    assert.equal(character.avatar, 'school/images/portraits.webp#cell=0,4,3');
    assert.equal(JSON.parse(character.relationships)[0].notes, '共同核对值日表');
    for (const targetId of ['outsider', 'private', character.id]) assert.equal((await request(`/characters/${character.id}`, 'PUT', { relationships: [{ targetId, kind: 'ally', label: '关联' }] })).status, 400);
    assert.equal((await request('/characters/private', 'PUT', { avatar: 'book/images/portraits.webp' })).status, 404);
    const update = await request(`/characters/${character.id}`, 'PUT', { aliases: '["小夏"]', novelId: 'private-book', relationships: character.relationships });
    assert.equal(update.status, 200);
    const saved = (await update.json()).character;
    assert.equal(saved.novelId, 'book'); assert.deepEqual(JSON.parse(saved.aliases), ['小夏']);
    assert.equal(JSON.parse(saved.relationships)[0].targetId, 'friend');
    const listing = await (await request('/novels/book/characters')).json();
    assert.equal(listing.characters.find(item => item.id === character.id).avatar, character.avatar);
    assert.equal((await request('/characters/friend', 'DELETE')).status, 200);
    assert.deepEqual(JSON.parse((await prisma.character.findUnique({ where: { id: character.id } })).relationships), []);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await prisma?.$disconnect();
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    await rm(directory, { recursive: true, force: true });
  }
});
