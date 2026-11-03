import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { runLibraryImport } from '../../../scripts/import-demo-library.mjs';
import { buildSchoolRecords, importSchoolRecords } from '../../../scripts/import-school-demo.mjs';
const project = fileURLToPath(new URL('../../../', import.meta.url));

test('two-book database export is deterministic, linked, sanitized, and preserves unrelated existing records', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'novel-library-db-'));
  const databaseUrl = `file:${resolve(directory, 'library.db')}`;
  const snapshot = resolve(directory, 'library.json');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await writeFile(resolve(directory, 'library.db'), '');
    execFileSync(process.execPath, [resolve(project, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', resolve(project, 'packages/backend/prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
    await prisma.user.create({ data: { id: 'original-owner', email: 'original@novel-agent.invalid', passwordHash: '!disabled:test' } });
    await prisma.novel.create({ data: { id: 'visitor-book', userId: 'original-owner', title: '原有自写小说', summary: '保留用户修改' } });
    await prisma.chapter.create({ data: { id: 'visitor-chapter', novelId: 'visitor-book', title: '自己的章节', content: '用户手写的完整正文。', wordCount: 10, sequence: 0 } });
    const first = await runLibraryImport({ databaseUrl, snapshot });
    const serialized = await readFile(snapshot, 'utf8');
    assert.equal(first.novels.length, 2); assert.equal(first.chapters, 80); assert.equal(first.characters, 20); assert.equal(first.plotCards, 90);
    assert.equal(await prisma.novel.count(), 3); assert.equal(await prisma.user.count(), 1);
    assert.equal((await prisma.chapter.findUnique({ where: { id: 'visitor-chapter' } })).content, '用户手写的完整正文。');
    assert.equal((await prisma.novel.findUnique({ where: { id: 'visitor-book' } })).summary, '保留用户修改');
    const second = await runLibraryImport({ databaseUrl, snapshot });
    assert.equal(second.snapshotSha256, first.snapshotSha256); assert.equal(await readFile(snapshot, 'utf8'), serialized);
    await runLibraryImport({ databaseUrl, snapshot, check: true });
    const data = JSON.parse(serialized);
    assert.equal(data.novels[0].id, 'demo-school-night');
    assert.ok(data.chapters.every(row => !/^第[零〇一二三四五六七八九十百千两\d]+章/.test(row.title)));
    assert.ok(data.characters.every(row => Array.isArray(row.relationships) && row.avatar));
    assert.ok(!/"(?:userId|email|passwordHash|agentPrompt|apiKey|token)":/.test(serialized));
    const school = await buildSchoolRecords();
    await prisma.character.update({ where: { id: school.characters[0].id }, data: { description: '与创作源文件不一致的资料' } });
    await assert.rejects(runLibraryImport({ databaseUrl, snapshot, check: true }), /业务内容与创作源文件不一致/);
    assert.equal(await readFile(snapshot, 'utf8'), serialized, 'Read-only verification never rewrites the public snapshot');
    await importSchoolRecords(prisma, school);
    await prisma.character.update({ where: { id: school.characters[0].id }, data: { novelId: 'visitor-book' } });
    await assert.rejects(importSchoolRecords(prisma, school), /被其他作品占用/);
    assert.equal((await prisma.character.findUnique({ where: { id: school.characters[0].id } })).novelId, 'visitor-book');
  } finally { await prisma.$disconnect(); await rm(directory, { recursive: true, force: true }); }
});
