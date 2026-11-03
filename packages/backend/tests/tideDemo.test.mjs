import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { buildTideRecords, importTideRecords, readTideSnapshot, runTideImport, TIDE_NOVEL_ID } from '../../../scripts/import-tide-demo.mjs';

const project = fileURLToPath(new URL('../../../', import.meta.url));

test('database import preserves unrelated records, is idempotent, and exports only verified novel data', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'novel-tide-db-'));
  const databaseUrl = `file:${resolve(directory, 'example.db')}`;
  const snapshot = resolve(directory, 'snapshot.json');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await writeFile(resolve(directory, 'example.db'), '');
    execFileSync(process.execPath, [resolve(project, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', resolve(project, 'packages/backend/prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
    await prisma.user.create({ data: { id: 'existing-user', email: 'db-test@novel-agent.invalid', nickname: '原用户', passwordHash: '!disabled:test' } });
    await prisma.novel.create({ data: { id: 'existing-novel', userId: 'existing-user', title: '原有作品', summary: '必须保留原文' } });
    const records = await buildTideRecords();
    await importTideRecords(prisma, records);
    const first = await readTideSnapshot(prisma);
    await importTideRecords(prisma, records);
    assert.deepEqual(await readTideSnapshot(prisma), first);
    assert.equal(await prisma.user.count(), 1);
    assert.equal(await prisma.novel.count(), 2);
    assert.equal((await prisma.novel.findUnique({ where: { id: 'existing-novel' } })).summary, '必须保留原文');
    assert.equal(first.novels[0].title, '潮汐替人记得');
    assert.equal(first.novels[0].wordCount, 60720);
    assert.equal(first.chapters.length, 40);
    assert.equal(first.characters.length, 8);
    assert.equal(first.worldSettings.length, 9);
    assert.equal(first.plotCards.length, 45);
    assert.equal(first.foreshadowings.length, 8);
    assert.equal(first.chapters.at(-1).sequence, 39);
    assert.equal(first.plotCards.filter(item => item.type === 'chapter' && item.status === 'completed' && item.chapterId).length, 40);
    assert.ok(first.worldSettings.some(item => item.content.includes('![《潮汐替人记得》主要人物群像](book/images/characters.webp)')));
    const json = JSON.stringify(first);
    assert.ok(!/"(?:userId|email|passwordHash|agentPrompt|apiKey|token)":/.test(json));
    await runTideImport({ databaseUrl, snapshot });
    await runTideImport({ databaseUrl, snapshot, check: true });
    assert.deepEqual(JSON.parse(await readFile(snapshot, 'utf8')), first);
    await prisma.chapter.update({ where: { id: records.chapters[0].id }, data: { content: '误写的正文' } });
    await assert.rejects(runTideImport({ databaseUrl, snapshot, check: true }), /内容或字数不一致/);
    await importTideRecords(prisma, records);
    await prisma.chapter.update({ where: { id: records.chapters[0].id }, data: { novelId: 'existing-novel' } });
    await assert.rejects(importTideRecords(prisma, records), /被其他作品占用/);
    assert.equal((await prisma.chapter.findUnique({ where: { id: records.chapters[0].id } })).novelId, 'existing-novel');
    assert.equal(await prisma.novel.count({ where: { id: TIDE_NOVEL_ID } }), 1);
  } finally { await prisma.$disconnect(); await rm(directory, { recursive: true, force: true }); }
});

test('multiple unrelated owners require an explicit choice and do not receive an accidental import', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'novel-tide-owners-'));
  const databaseUrl = `file:${resolve(directory, 'example.db')}`;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await writeFile(resolve(directory, 'example.db'), '');
    execFileSync(process.execPath, [resolve(project, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', resolve(project, 'packages/backend/prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
    for (const id of ['one', 'two']) await prisma.user.create({ data: { id, email: `${id}@novel-agent.invalid`, passwordHash: '!disabled:test' } });
    await assert.rejects(importTideRecords(prisma, await buildTideRecords()), /显式传入 --owner-id/);
    assert.equal(await prisma.novel.count(), 0);
  } finally { await prisma.$disconnect(); await rm(directory, { recursive: true, force: true }); }
});
