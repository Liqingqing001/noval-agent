import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, isAbsolute } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bookRoot = resolve(projectRoot, 'packages/frontend/public/book');
export const TIDE_NOVEL_ID = 'case-tide-remembers';
export const DEFAULT_DATABASE_URL = `file:${resolve(projectRoot, 'packages/backend/prisma/dev.db')}`;
export const DEFAULT_SNAPSHOT = resolve(projectRoot, 'packages/frontend/src/demo/tideMemory.json');
const timestamp = new Date('2026-11-03T00:00:00.000Z');
const dated = () => ({ createdAt: timestamp, updatedAt: timestamp });
const chapterId = number => `case-tide-chapter-${String(number).padStart(2, '0')}`;
const volumeId = number => `case-tide-volume-${number}`;
const plotId = number => `case-tide-plot-${String(number).padStart(2, '0')}`;
const publicId = value => value?.replace(/^case-tide-/, 'demo-tide-');
const hanCount = text => (text.match(/\p{Script=Han}/gu) || []).length;
const sha256 = value => createHash('sha256').update(value).digest('hex');

/** Authoritative authored files -> records. This function does not write a database or fixture. */
export async function buildTideRecords() {
  const setting = JSON.parse(await readFile(resolve(bookRoot, 'setting.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(resolve(bookRoot, 'manifest.json'), 'utf8'));
  const chapters = [];
  for (const [index, item] of manifest.chapters.entries()) {
    const text = await readFile(resolve(bookRoot, 'chapters', `${item.id}.md`), 'utf8');
    if (sha256(text.trim() + '\n') !== item.sha256) throw Error(`章节 ${item.id} 与正文清单校验不一致。`);
    const content = text.replace(/^# .*\r?\n/, '').trim();
    if (hanCount(content) !== item.hanCount) throw Error(`章节 ${item.id} 字数与清单不一致。`);
    chapters.push({ id: chapterId(index + 1), novelId: TIDE_NOVEL_ID, title: item.title, content, wordCount: item.hanCount, sequence: index, ...dated() });
  }
  if (chapters.length !== 40 || chapters.reduce((n, item) => n + item.wordCount, 0) !== 60720 || !chapters.at(-1).content.endsWith('——全文完——')) throw Error('案例正文必须是四十章、60,720 汉字并已完本。');
  const novel = { id: TIDE_NOVEL_ID, title: setting.title, cover: 'book/images/cover.webp', wordCount: manifest.hanCount, status: 'completed', genre: setting.genre, summary: setting.description, lastOpenedChapterId: chapters[0].id, ...dated() };
  const appearances = [1, 1, 3, 2, 1, 1, 4, 12];
  const aliases = [[], [], ['许姐'], [], ['小雾的母亲'], ['周叔'], [], []];
  const characters = setting.characters.map((item, index) => ({
    id: `case-tide-character-${index + 1}`, novelId: TIDE_NOVEL_ID, name: item.name, aliases: JSON.stringify(aliases[index] || []),
    description: `身份：${item.role}\n目标：${item.desire}\n人物局限：${item.flaw}\n成长弧线：${item.arc}`,
    appearance: item.detail, personality: item.flaw, background: item.arc, firstAppearanceChapterId: chapterId(appearances[index] || 1), role: index < 4 ? 'protagonist' : 'supporting', sequence: index,
  }));
  const categories = ['地理与社会', '核心机制', '制度与历史', '工程体系', '技术边界', '社会规则'];
  const worldSettings = setting.world.map((item, index) => ({ id: `case-tide-world-${index + 1}`, novelId: TIDE_NOVEL_ID, category: categories[index] || '世界设定', title: item.title, content: item.text }));
  worldSettings.push(
    { id: 'case-tide-world-timeline', novelId: TIDE_NOVEL_ID, category: '历史时间线', title: '海城事件时间线', content: setting.timeline.map(item => `### ${item.time}\n\n${item.event}`).join('\n\n') },
    { id: 'case-tide-world-visuals', novelId: TIDE_NOVEL_ID, category: '视觉设定', title: '人物视觉设定', content: '![《潮汐替人记得》主要人物群像](book/images/characters.webp)\n\n左起：林雾、沈砚、许照、陆苗。\n\n四位人物形象采用与书封一致的海港、铜制仪器和记忆灯视觉语言。图像是 AI 生成的文学插画，人物经历以正文为准。' },
    { id: 'case-tide-world-credit', novelId: TIDE_NOVEL_ID, category: '创作资料', title: '原创案例说明', content: `${setting.credit}\n\n${setting.subtitle}\n\n全书五卷四十章，已完本。正文汉字统计不计章节标题、标点、大纲、人物与世界观设定。` },
  );
  const plotCards = [];
  for (const [index, act] of setting.acts.entries()) {
    const id = volumeId(index + 1);
    plotCards.push({ id, novelId: TIDE_NOVEL_ID, type: 'volume', title: act.title, summary: act.description, sequence: index, volumeId: null, chapterId: null, status: 'completed', statusMode: 'auto', ...dated() });
    for (let number = act.range[0]; number <= act.range[1]; number++) {
      plotCards.push({ id: plotId(number), novelId: TIDE_NOVEL_ID, type: 'chapter', title: chapters[number - 1].title, summary: setting.chapterSummaries[number - 1], sequence: number - act.range[0], volumeId: id, chapterId: chapterId(number), status: 'completed', statusMode: 'auto', ...dated() });
    }
  }
  const threads = [
    ['炉子第二格的糖', '母亲声音触发辨认，揭示不完整取忆与关联记忆；最终母亲回到生活细节，而不是一段能使死者复生的神谕。', 1, 40],
    ['十七号闸与一张纸', '带纸赴约不是超自然钥匙，而是私人愿意相信的东西；家庭画像最后挂回普通饭桌。', 1, 40],
    ['七月十九日与停钟', '停钟、潮位账册和错误死亡日期互证。陈望的钟最终重新走动，不再停在灾难时间。', 2, 35],
    ['三短一长', '沈渡的敲击暗号带出被隐瞒的救治经历；语音灯最终留下买酱油与未成行的生活，不被修成遗言。', 2, 31],
    ['中央留空的水轮', '母亲的分闸图强调独立节点与退出容错；林雾最终也学会交接工作，不把自己变成不能离开的中心。', 3, 39],
    ['新鞋与买酱油', '未竟的普通生活不应被牺牲叙事吞没；陆苗入学垫鞋、沈砚买回酱油，成为新的生活。', 5, 31],
    ['山的照片', '博物馆留下看似无用的远方愿望。林雾后来真正离城，看山也允许只走半程。', 10, 36],
    ['两张船票', '退票作为可核实的时间证据，不能倒推林汐没有犹豫；林雾后来能买属于自己的新票。', 5, 36],
  ];
  const foreshadowings = threads.map(([title, description, start, end], index) => ({ id: `case-tide-thread-${index + 1}`, novelId: TIDE_NOVEL_ID, title, description, plantedChapterId: chapterId(start), resolvedChapterId: chapterId(end), plantedPlotCardId: plotId(start), resolvedPlotCardId: plotId(end), status: 'resolved', ...dated() }));
  return { novel, chapters, characters, worldSettings, plotCards, foreshadowings };
}

/** Select only publishable business fields. No User relation or account fields are read here. */
export async function readTideSnapshot(prisma) {
  const record = await prisma.novel.findUnique({ where: { id: TIDE_NOVEL_ID }, select: {
    id: true, title: true, cover: true, wordCount: true, status: true, genre: true, summary: true, lastOpenedChapterId: true, createdAt: true, updatedAt: true,
    chapters: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }], select: { id: true, novelId: true, title: true, content: true, wordCount: true, sequence: true, createdAt: true, updatedAt: true } },
    characters: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }], select: { id: true, novelId: true, name: true, aliases: true, description: true, appearance: true, personality: true, background: true, firstAppearanceChapterId: true, role: true, sequence: true } },
    worldSettings: { orderBy: { id: 'asc' }, select: { id: true, novelId: true, category: true, title: true, content: true } },
    plotCards: { orderBy: { id: 'asc' }, select: { id: true, novelId: true, type: true, title: true, summary: true, sequence: true, volumeId: true, chapterId: true, status: true, statusMode: true, createdAt: true, updatedAt: true } },
    foreshadowings: { orderBy: { id: 'asc' }, select: { id: true, novelId: true, title: true, description: true, plantedChapterId: true, resolvedChapterId: true, plantedPlotCardId: true, resolvedPlotCardId: true, status: true, createdAt: true, updatedAt: true } },
  } });
  if (!record) throw Error('数据库中尚无《潮汐替人记得》，请先执行导入。');
  const { chapters, characters, worldSettings, plotCards, foreshadowings, ...novel } = record;
  const clean = value => {
    if (value instanceof Date) return value.getTime();
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, key === 'aliases' ? JSON.parse(item) : key === 'id' || key.endsWith('Id') ? publicId(item) : clean(item)]));
    return value;
  };
  return clean({ novels: [novel], chapters, characters, worldSettings, plotCards, foreshadowings });
}

export async function importTideRecords(prisma, records, ownerId) {
  return prisma.$transaction(async transaction => {
    const existing = await transaction.novel.findUnique({ where: { id: TIDE_NOVEL_ID }, select: { title: true, userId: true } });
    if (existing && existing.title !== records.novel.title) throw Error('示例 ID 已被其他作品使用，拒绝覆盖。');
    let owner = existing?.userId || ownerId;
    if (ownerId && !(await transaction.user.findUnique({ where: { id: ownerId }, select: { id: true } }))) throw Error('指定的 owner-id 不存在。');
    if (!owner) {
      const users = await transaction.user.findMany({ select: { id: true }, take: 2 });
      if (users.length > 1) throw Error('存在多个用户，请显式传入 --owner-id，避免写入错误账号。');
      if (users.length === 1) owner = users[0].id;
      else {
        // Intentionally not a bcrypt credential: this account cannot log in with any password.
        const passwordHash = `!disabled:${sha256(randomBytes(64))}`;
        owner = 'case-tide-example-owner';
        await transaction.user.create({ data: { id: owner, email: 'tide-example@novel-agent.invalid', nickname: '潮汐示例资料', passwordHash, ...dated() } });
      }
    }
    await transaction.novel.upsert({ where: { id: TIDE_NOVEL_ID }, create: { ...records.novel, userId: owner }, update: records.novel });
    const models = { chapters: 'chapter', characters: 'character', worldSettings: 'worldSetting', plotCards: 'plotCard', foreshadowings: 'foreshadowing' };
    for (const [key, model] of Object.entries(models)) {
      for (const row of records[key]) {
        const occupied = await transaction[model].findUnique({ where: { id: row.id }, select: { novelId: true } });
        if (occupied && occupied.novelId !== TIDE_NOVEL_ID) throw Error(`示例子记录 ${row.id} 被其他作品占用，拒绝覆盖。`);
        await transaction[model].upsert({ where: { id: row.id }, create: row, update: row });
      }
      await transaction[model].deleteMany({ where: { novelId: TIDE_NOVEL_ID, id: { notIn: records[key].map(row => row.id) } } });
    }
    return owner;
  }, { timeout: 30000 });
}

function assertSnapshot(snapshot, records) {
  if (snapshot.novels.length !== 1 || snapshot.chapters.length !== 40 || snapshot.characters.length !== 8 || snapshot.worldSettings.length !== 9 || snapshot.plotCards.length !== 45 || snapshot.foreshadowings.length !== 8) throw Error('数据库业务表记录数量与案例不一致。');
  if (snapshot.novels[0].wordCount !== 60720 || snapshot.chapters.reduce((n, item) => n + item.wordCount, 0) !== 60720) throw Error('数据库正文字数不一致。');
  for (const [index, chapter] of snapshot.chapters.entries()) if (chapter.content !== records.chapters[index].content || chapter.title !== records.chapters[index].title || chapter.wordCount !== hanCount(chapter.content)) throw Error(`数据库章节 ${index + 1} 内容或字数不一致。`);
  const ids = new Set(Object.values(snapshot).flat().map(item => item.id));
  for (const rows of Object.values(snapshot)) for (const row of rows) for (const [key, value] of Object.entries(row)) if (key === 'id' && !value.startsWith('demo-tide-') || key.endsWith('Id') && !ids.has(value)) throw Error(`公开快照关系异常：${key}`);
  if (snapshot.plotCards.filter(row => row.type === 'chapter' && row.chapterId && row.status === 'completed').length !== 40) throw Error('章节大纲未完整关联已完成章节。');
  if (/"(?:userId|email|passwordHash|apiKey|token|agentPrompt|sessions)"\s*:/.test(JSON.stringify(snapshot))) throw Error('公开快照包含非公开字段。');
}

export async function runTideImport(options = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  if (!databaseUrl.startsWith('file:')) throw Error('此脚本仅用于项目 SQLite 数据库。');
  const snapshotPath = resolve(options.snapshot || DEFAULT_SNAPSHOT);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const records = await buildTideRecords();
    if (!options.check) await importTideRecords(prisma, records, options.ownerId);
    const snapshot = await readTideSnapshot(prisma);
    assertSnapshot(snapshot, records);
    const serialized = JSON.stringify(snapshot, null, 2) + '\n';
    if (options.check) {
      if (await readFile(snapshotPath, 'utf8') !== serialized) throw Error('已提交的公开快照与当前数据库不一致，请重新导出。');
    } else { await mkdir(dirname(snapshotPath), { recursive: true }); await writeFile(snapshotPath, serialized); }
    const summary = { database: isAbsolute(databaseUrl.slice(5).split('?')[0]) ? databaseUrl.slice(5).split('?')[0] : resolve(projectRoot, 'packages/backend/prisma', databaseUrl.slice(5).split('?')[0]), mode: options.check ? 'read-only-check' : 'import-and-export', novel: snapshot.novels[0].title, novels: 1, chapters: snapshot.chapters.length, characters: snapshot.characters.length, worldSettings: snapshot.worldSettings.length, plotCards: snapshot.plotCards.length, foreshadowings: snapshot.foreshadowings.length, bodyHan: snapshot.novels[0].wordCount, snapshotSha256: sha256(serialized) };
    return summary;
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2); const options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--check') options.check = true;
    else if (['--database-url', '--snapshot', '--owner-id'].includes(arg) && args[index + 1]) options[{ '--database-url': 'databaseUrl', '--snapshot': 'snapshot', '--owner-id': 'ownerId' }[arg]] = args[++index];
    else throw Error(`未知或不完整参数：${arg}`);
  }
  try { console.log(JSON.stringify(await runTideImport(options))); }
  catch (error) { console.error(`潮汐案例导入未完成：${error.message}\n请先对目标库运行 Prisma migrate deploy；脚本不会 reset 数据库。`); process.exitCode = 1; }
}
