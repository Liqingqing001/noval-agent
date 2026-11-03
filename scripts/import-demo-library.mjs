import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { buildTideRecords, importTideRecords, readTideSnapshot, DEFAULT_DATABASE_URL, DEFAULT_SNAPSHOT } from './import-tide-demo.mjs';
import { buildSchoolRecords, importSchoolRecords, readSchoolSnapshot, SCHOOL_SNAPSHOT } from './import-school-demo.mjs';
import { collections, assertNovelSnapshot, assertPublicSnapshot, sha256 } from './demo-library.mjs';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LIBRARY_SNAPSHOT = resolve(projectRoot, 'packages/frontend/src/demo/library.json');

/** Both standalone fixtures and the runtime library are read back from the same SQLite database. */
export async function runLibraryImport(options = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  if (!databaseUrl.startsWith('file:')) throw Error('此脚本仅用于项目 SQLite 数据库。');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const [schoolRecords, tideRecords] = await Promise.all([buildSchoolRecords(), buildTideRecords()]);
    if (!options.check) {
      await importTideRecords(prisma, tideRecords, options.ownerId);
      await importSchoolRecords(prisma, schoolRecords, options.ownerId);
    }
    const [school, tide] = await Promise.all([readSchoolSnapshot(prisma), readTideSnapshot(prisma)]);
    assertNovelSnapshot(school, schoolRecords); assertNovelSnapshot(tide, tideRecords);
    const library = Object.fromEntries(collections.map(key => [key, [...school[key], ...tide[key]]]));
    assertPublicSnapshot(library);
    const outputs = options.snapshot ? [[resolve(options.snapshot), library]] : [[SCHOOL_SNAPSHOT, school], [DEFAULT_SNAPSHOT, tide], [LIBRARY_SNAPSHOT, library]];
    for (const [path, snapshot] of outputs) {
      const serialized = JSON.stringify(snapshot, null, 2) + '\n';
      if (options.check) { if (await readFile(path, 'utf8') !== serialized) throw Error(`公开快照与当前数据库不一致：${path}`); }
      else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, serialized); }
    }
    return { mode: options.check ? 'read-only-check' : 'import-and-export', novels: library.novels.map(novel => ({ id: novel.id, title: novel.title, bodyHan: novel.wordCount })), ...Object.fromEntries(collections.filter(key => key !== 'novels').map(key => [key, library[key].length])), snapshotSha256: sha256(JSON.stringify(library, null, 2) + '\n') };
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--check') options.check = true;
    else if (['--database-url', '--snapshot', '--owner-id'].includes(arg) && args[index + 1]) options[{ '--database-url': 'databaseUrl', '--snapshot': 'snapshot', '--owner-id': 'ownerId' }[arg]] = args[++index];
    else throw Error(`未知或不完整参数：${arg}`);
  }
  try { console.log(JSON.stringify(await runLibraryImport(options))); }
  catch (error) { console.error(`完整示例库导入未完成：${error.message}\n请先对目标库运行 Prisma migrate deploy；脚本不会 reset 数据库。`); process.exitCode = 1; }
}
