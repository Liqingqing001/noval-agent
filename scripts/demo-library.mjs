import { createHash, randomBytes } from 'node:crypto';

export const timestamp = new Date('2026-11-03T00:00:00.000Z');
export const dated = () => ({ createdAt: timestamp, updatedAt: timestamp });
export const hanCount = text => (text.match(/\p{Script=Han}/gu) || []).length;
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const bareChapterTitle = title => title.replace(/^第[零〇一二三四五六七八九十百千两\d]+章\s*[·:：、.．—-]?\s*/, '').trim();
export const collections = ['novels', 'chapters', 'characters', 'worldSettings', 'plotCards', 'foreshadowings'];
export const publicId = value => typeof value === 'string' ? value.replace(/^case-school-/, 'demo-school-').replace(/^case-tide-/, 'demo-tide-') : value;
function cleanPublicValue(value) {
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(cleanPublicValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, key === 'aliases' || key === 'relationships' ? cleanPublicValue(JSON.parse(item)) : key === 'id' || key.endsWith('Id') ? publicId(item) : cleanPublicValue(item)]));
  return value;
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  return value;
}

/** Only explicit public business fields are selected. Account records and prompts never enter an export. */
export async function readNovelSnapshot(prisma, novelId) {
  const record = await prisma.novel.findUnique({ where: { id: novelId }, select: {
    id: true, title: true, cover: true, wordCount: true, status: true, genre: true, summary: true, lastOpenedChapterId: true, createdAt: true, updatedAt: true,
    chapters: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }], select: { id: true, novelId: true, title: true, content: true, wordCount: true, sequence: true, createdAt: true, updatedAt: true } },
    characters: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }], select: { id: true, novelId: true, name: true, aliases: true, avatar: true, relationships: true, description: true, appearance: true, personality: true, background: true, firstAppearanceChapterId: true, role: true, sequence: true } },
    worldSettings: { orderBy: { id: 'asc' }, select: { id: true, novelId: true, category: true, title: true, content: true } },
    plotCards: { orderBy: { id: 'asc' }, select: { id: true, novelId: true, type: true, title: true, summary: true, sequence: true, volumeId: true, chapterId: true, status: true, statusMode: true, createdAt: true, updatedAt: true } },
    foreshadowings: { orderBy: { id: 'asc' }, select: { id: true, novelId: true, title: true, description: true, plantedChapterId: true, resolvedChapterId: true, plantedPlotCardId: true, resolvedPlotCardId: true, status: true, createdAt: true, updatedAt: true } },
  } });
  if (!record) throw Error(`数据库中尚无示例 ${novelId}，请先执行导入。`);
  const { chapters, characters, worldSettings, plotCards, foreshadowings, ...novel } = record;
  return cleanPublicValue({ novels: [novel], chapters, characters, worldSettings, plotCards, foreshadowings });
}

/** Upsert only reserved case IDs. Existing owners and every unrelated record remain untouched. */
export async function importNovelRecords(prisma, records, ownerId) {
  const novelId = records.novel.id;
  return prisma.$transaction(async transaction => {
    const existing = await transaction.novel.findUnique({ where: { id: novelId }, select: { title: true, userId: true } });
    if (existing && existing.title !== records.novel.title) throw Error('示例 ID 已被其他作品使用，拒绝覆盖。');
    let owner = existing?.userId || ownerId;
    if (ownerId && !(await transaction.user.findUnique({ where: { id: ownerId }, select: { id: true } }))) throw Error('指定的 owner-id 不存在。');
    if (!owner) {
      const users = await transaction.user.findMany({ select: { id: true }, take: 2 });
      if (users.length > 1) throw Error('存在多个用户，请显式传入 --owner-id，避免写入错误账号。');
      if (users.length === 1) owner = users[0].id;
      else {
        owner = 'case-tide-example-owner';
        await transaction.user.create({ data: { id: owner, email: 'tide-example@novel-agent.invalid', nickname: '完整小说示例资料', passwordHash: `!disabled:${sha256(randomBytes(64))}`, ...dated() } });
      }
    }
    await transaction.novel.upsert({ where: { id: novelId }, create: { ...records.novel, userId: owner }, update: records.novel });
    const models = { chapters: 'chapter', characters: 'character', worldSettings: 'worldSetting', plotCards: 'plotCard', foreshadowings: 'foreshadowing' };
    for (const [key, model] of Object.entries(models)) for (const row of records[key]) {
      const occupied = await transaction[model].findUnique({ where: { id: row.id }, select: { novelId: true } });
      if (occupied && occupied.novelId !== novelId) throw Error(`示例子记录 ${row.id} 被其他作品占用，拒绝覆盖。`);
      await transaction[model].upsert({ where: { id: row.id }, create: row, update: row });
    }
    return owner;
  }, { timeout: 30000 });
}

export function assertNovelSnapshot(snapshot, records) {
  for (const key of collections) {
    const expected = key === 'novels' ? [records.novel] : records[key];
    if (snapshot[key].length !== expected.length) throw Error(`数据库业务表 ${key} 记录数量与案例不一致。`);
  }
  if (snapshot.novels[0].wordCount !== records.novel.wordCount || snapshot.chapters.reduce((n, row) => n + row.wordCount, 0) !== records.novel.wordCount) throw Error('数据库正文字数不一致。');
  for (const [index, chapter] of snapshot.chapters.entries()) if (chapter.content !== records.chapters[index].content || chapter.title !== records.chapters[index].title || chapter.wordCount !== hanCount(chapter.content)) throw Error(`数据库章节 ${index + 1} 内容或字数不一致。`);
  const expected = cleanPublicValue({ novels: [records.novel], ...Object.fromEntries(collections.filter(key => key !== 'novels').map(key => [key, [...records[key]].sort((a, b) => key === 'chapters' || key === 'characters' ? a.sequence - b.sequence || (a.id < b.id ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)])) });
  for (const key of collections) if (JSON.stringify(stableValue(snapshot[key])) !== JSON.stringify(stableValue(expected[key]))) throw Error(`数据库 ${key} 业务内容与创作源文件不一致，请重新导入。`);
  assertPublicSnapshot(snapshot);
  if (snapshot.plotCards.filter(row => row.type === 'chapter' && row.chapterId && row.status === 'completed').length !== 40) throw Error('章节大纲未完整关联已完成章节。');
}

export function assertPublicSnapshot(snapshot) {
  const ids = new Set(Object.values(snapshot).flat().map(item => item.id));
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'id' && !/^demo-(?:school|tide)-/.test(item) || key.endsWith('Id') && item && !ids.has(item)) throw Error(`公开快照关系异常：${key}`);
      visit(item);
    }
  };
  visit(snapshot);
  if (/"(?:userId|email|passwordHash|apiKey|token|agentPrompt|sessions)"\s*:/.test(JSON.stringify(snapshot))) throw Error('公开快照包含非公开字段。');
}

export function characterRecords(setting, novelId, prefix, chapterId, defaults = {}) {
  const ids = new Map(setting.characters.map((item, index) => [item.name, `${prefix}-character-${index + 1}`]));
  return setting.characters.map((item, index) => {
    const relationships = (item.relationships || []).map(relationship => {
      const { targetName, kind, label, notes, directed } = relationship;
      const targetId = ids.get(targetName);
      if (!targetId || targetId === ids.get(item.name)) throw Error(`人物 ${item.name} 的关系对象无效：${targetName}`);
      if (!['family', 'ally', 'rival', 'other'].includes(kind) || typeof label !== 'string' || !label.trim() || label.length > 40 || notes !== undefined && (typeof notes !== 'string' || notes.length > 500) || directed !== undefined && typeof directed !== 'boolean') throw Error(`人物 ${item.name} 的关系字段无效：${targetName}`);
      return { targetId, kind, label, ...(notes === undefined ? {} : { notes }), ...(directed === undefined ? {} : { directed }) };
    });
    return {
      id: ids.get(item.name), novelId, name: item.name, aliases: JSON.stringify(item.aliases || defaults.aliases?.[index] || []),
      avatar: item.avatar || null, relationships: JSON.stringify(relationships),
      description: item.description || `身份：${item.role}\n目标：${item.desire}\n人物局限：${item.flaw}\n成长弧线：${item.arc}`,
      appearance: item.appearance || item.detail, personality: item.personality || item.flaw, background: item.background || item.arc,
      firstAppearanceChapterId: chapterId(item.firstAppearance || defaults.appearances?.[index] || 1),
      role: item.characterRole || (index < (defaults.protagonists || 7) ? 'protagonist' : 'supporting'), sequence: index,
    };
  });
}
