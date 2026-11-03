import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_DATABASE_URL } from './import-tide-demo.mjs';
import { dated, hanCount, sha256, bareChapterTitle, characterRecords, readNovelSnapshot, importNovelRecords, assertNovelSnapshot } from './demo-library.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bookRoot = resolve(projectRoot, 'packages/frontend/public/school');
export const SCHOOL_NOVEL_ID = 'case-school-night';
export const SCHOOL_SNAPSHOT = resolve(projectRoot, 'packages/frontend/src/demo/schoolNight.json');
const chapterId = number => `case-school-chapter-${String(number).padStart(2, '0')}`;
const volumeId = number => `case-school-volume-${number}`;
const plotId = number => `case-school-plot-${String(number).padStart(2, '0')}`;

export async function buildSchoolRecords() {
  const setting = JSON.parse(await readFile(resolve(bookRoot, 'setting.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(bookRoot, 'manifest.json'), 'utf8'));
  const chapters = [];
  for (const [index, item] of manifest.chapters.entries()) {
    const text = await readFile(resolve(bookRoot, 'chapters', `${item.id}.md`), 'utf8');
    if (sha256(text.trim() + '\n') !== item.sha256) throw Error(`章节 ${item.id} 与正文清单校验不一致。`);
    const content = text.replace(/^# .*\r?\n/, '').trim();
    if (hanCount(content) !== item.hanCount || item.title !== bareChapterTitle(item.title)) throw Error(`章节 ${item.id} 字数或纯标题与清单不一致。`);
    chapters.push({ id: chapterId(index + 1), novelId: SCHOOL_NOVEL_ID, title: item.title, content, wordCount: item.hanCount, sequence: index, ...dated() });
  }
  const bodyHan = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  if (chapters.length !== 40 || bodyHan !== manifest.hanCount || bodyHan < 60000 || bodyHan > 70000 || !chapters.at(-1).content.endsWith('——全文完——')) throw Error('校园案例必须是四十章、六万至七万汉字并已完本。');
  const novel = { id: SCHOOL_NOVEL_ID, title: setting.title, cover: 'school/images/cover.webp', wordCount: bodyHan, status: 'completed', genre: setting.genre, summary: setting.description, lastOpenedChapterId: chapters[0].id, ...dated() };
  const characters = characterRecords(setting, SCHOOL_NOVEL_ID, 'case-school', chapterId);
  const worldSettings = setting.world.map((item, index) => ({ id: `case-school-world-${String(index + 1).padStart(2, '0')}`, novelId: SCHOOL_NOVEL_ID, category: item.category || '校园规则', title: item.title, content: item.content || item.text }));
  worldSettings.push(
    { id: 'case-school-world-timeline', novelId: SCHOOL_NOVEL_ID, category: '历史时间线', title: '青川中学事件时间线', content: setting.timeline.map(item => `### ${item.time}\n\n${item.event}`).join('\n\n') },
    { id: 'case-school-world-visuals', novelId: SCHOOL_NOVEL_ID, category: '视觉设定', title: '十二位人物头像', content: `![《晚自习后，别回头》十二位人物头像](school/images/portraits.webp)\n\n每行从左到右、从上到下依次为：${setting.characters.map(item => item.name).join('、')}。\n\n书封七人群像与人物头像由 AI 生成，具体人物行动、伤势与年龄以正文为准。每位主要人物及重要配角的独立头像可在人物面板查看。` },
    { id: 'case-school-world-credit', novelId: SCHOOL_NOVEL_ID, category: '创作资料', title: '原创案例说明', content: `${setting.credit}\n\n${setting.subtitle}\n\n全书五夜四十章，已完本。正文汉字统计不计章节标题、标点、大纲、人物与世界观设定。` },
  );
  const plotCards = [];
  const covered = new Set();
  for (const [index, act] of setting.acts.entries()) {
    const id = volumeId(index + 1);
    plotCards.push({ id, novelId: SCHOOL_NOVEL_ID, type: 'volume', title: act.title, summary: act.description, sequence: index, volumeId: null, chapterId: null, status: 'completed', statusMode: 'auto', ...dated() });
    for (let number = act.range[0]; number <= act.range[1]; number++) {
      if (!chapters[number - 1] || covered.has(number)) throw Error('五夜大纲的章节范围重叠或越界。');
      covered.add(number);
      plotCards.push({ id: plotId(number), novelId: SCHOOL_NOVEL_ID, type: 'chapter', title: chapters[number - 1].title, summary: setting.chapterSummaries[number - 1], sequence: number - act.range[0], volumeId: id, chapterId: chapterId(number), status: 'completed', statusMode: 'auto', ...dated() });
    }
  }
  if (setting.acts.length !== 5 || covered.size !== 40 || setting.chapterSummaries.length !== 40) throw Error('校园案例须完整关联五夜四十章大纲。');
  const foreshadowings = (setting.foreshadowings || []).map((item, index) => ({ id: `case-school-thread-${index + 1}`, novelId: SCHOOL_NOVEL_ID, title: item.title, description: item.description, plantedChapterId: chapterId(item.start), resolvedChapterId: chapterId(item.end), plantedPlotCardId: plotId(item.start), resolvedPlotCardId: plotId(item.end), status: 'resolved', ...dated() }));
  return { novel, chapters, characters, worldSettings, plotCards, foreshadowings };
}

export async function readSchoolSnapshot(prisma) { return readNovelSnapshot(prisma, SCHOOL_NOVEL_ID); }
export async function importSchoolRecords(prisma, records, ownerId) { return importNovelRecords(prisma, records, ownerId); }
export async function runSchoolImport(options = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  if (!databaseUrl.startsWith('file:')) throw Error('此脚本仅用于项目 SQLite 数据库。');
  const snapshotPath = resolve(options.snapshot || SCHOOL_SNAPSHOT);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const records = await buildSchoolRecords();
    if (!options.check) await importSchoolRecords(prisma, records, options.ownerId);
    const snapshot = await readSchoolSnapshot(prisma);
    assertNovelSnapshot(snapshot, records);
    const serialized = JSON.stringify(snapshot, null, 2) + '\n';
    if (options.check) {
      if (await readFile(snapshotPath, 'utf8') !== serialized) throw Error('已提交的公开快照与当前数据库不一致，请重新导出。');
    } else { await mkdir(dirname(snapshotPath), { recursive: true }); await writeFile(snapshotPath, serialized); }
    return { mode: options.check ? 'read-only-check' : 'import-and-export', novel: records.novel.title, novels: 1, chapters: snapshot.chapters.length, characters: snapshot.characters.length, worldSettings: snapshot.worldSettings.length, plotCards: snapshot.plotCards.length, foreshadowings: snapshot.foreshadowings.length, bodyHan: records.novel.wordCount, snapshotSha256: sha256(serialized) };
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
  try { console.log(JSON.stringify(await runSchoolImport(options))); }
  catch (error) { console.error(`校园案例导入未完成：${error.message}\n请先对目标库运行 Prisma migrate deploy；脚本不会 reset 数据库。`); process.exitCode = 1; }
}
