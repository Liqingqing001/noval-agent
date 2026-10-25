// Only creation sections are recovered. Editing/deleting commands keep their strict parser.
const aliases: Record<string, string> = { 人物: '角色', 人物设定: '角色', 角色设定: '角色', 世界观设定: '世界观' };
const creationTypes = new Set(['基本信息', '角色', '世界观', '卷', '大纲', '章节大纲', '章节']);
export interface ContentBlock { type: string; body: string; closed: boolean }

function headingType(line: string): string | null {
  if (!/^\s*#{1,6}\s/u.test(line) && !/^\s*(?:\*\*[^：:]+\*\*|__[^：:]+__)\s*$/u.test(line)) return null;
  const title = line.replace(/[#*_]/g, '').replace(/^[\s\p{Extended_Pictographic}\uFE0F\d.、)）]+/u, '').trim();
  const type = aliases[title] || title;
  return creationTypes.has(type) ? type : '';
}

/** Missing closures end at the next section, status footer, Markdown heading, or EOF. */
export function extractContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let current: ContentBlock | null = null;
  let fenced = false;
  const finish = (closed = false) => {
    if (current) blocks.push({ ...current, body: current.body.trim(), closed });
    current = null;
  };
  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { finish(); fenced = !fenced; continue; }
    if (fenced) continue; // Examples in code fences must not mutate the novel.
    if (/^\s*✅\s*[*_]*已同步/u.test(line)) { finish(); continue; }
    const heading = headingType(line);
    if (heading !== null) {
      finish();
      if (heading) current = { type: heading, body: '', closed: false };
      continue;
    }
    const tags = [...line.matchAll(/【\s*([/／]?)\s*([^【】]+?)\s*】/g)];
    let offset = 0;
    for (const tag of tags) {
      const before = line.slice(offset, tag.index);
      // Ignore quoted/instructional inline opening tags, e.g. 请使用【角色】标签。
      if (!tag[1] && before.replace(/^[\s>*_\-\d.、]+/u, '').trim()) continue;
      if (current) current.body += before;
      const type = aliases[tag[2]] || tag[2];
      if (tag[1]) {
        if (current?.type === type) finish(true);
        else finish();
      } else {
        finish();
        if (creationTypes.has(type)) current = { type, body: '', closed: false };
      }
      offset = tag.index! + tag[0].length;
    }
    if (current) current.body += line.slice(offset) + '\n';
  }
  finish();
  return blocks;
}

export function normalizeCreationSections(content: string): string {
  return extractContentBlocks(content).map(block => `【${block.type}】\n${block.body}\n【/${block.type}】`).join('\n');
}

const characterFields: Record<string, string> = {
  姓名: 'name', 名字: 'name', 名称: 'name', 定位: 'role', 角色定位: 'role', 角色类型: 'role',
  性格: 'personality', 背景: 'background', 外貌: 'appearance', 内心: 'innerConflict', 内心冲突: 'innerConflict',
  成长: 'growthArc', 成长弧线: 'growthArc', 描述: 'description', 简介: 'description', 弱点: 'weakness',
};
const worldFields: Record<string, string> = { 分类: 'category', 类别: 'category', 名称: 'title', 标题: 'title', 内容: 'content', 描述: 'content' };

function parseRecords(body: string, fields: Record<string, string>, identity: string, lead: string): Array<Record<string, string>> {
  const records: Array<Record<string, string>> = [];
  let record: Record<string, string> = {};
  let active = '';
  const flush = () => {
    for (const key of Object.keys(record)) record[key] = record[key].trim();
    if (record[identity]) records.push(record);
    record = {}; active = '';
  };
  const lines = body.split('\n');
  const cleanLine = (line: string) => line.replace(/^\s*(?:[-*+]\s+|\d+[.、)]\s*)?/, '').replace(/\*\*|__/g, '');
  for (const [index, line] of lines.entries()) {
    const clean = cleanLine(line);
    const match = clean.match(/^([^：:\n]{1,12})[：:][ \t]*(.*)$/);
    const key = match ? fields[match[1].trim()] : undefined;
    if (key) {
      // A new name/title or a new item's leading category/role starts another record.
      const nextField = key === lead ? lines.slice(index + 1).map(cleanLine).map(l => l.match(/^([^：:\n]{1,12})[：:]/)).find(m => m && fields[m[1].trim()]) : undefined;
      if ((key === identity && record[identity]) || (key === lead && record[identity] && nextField && fields[nextField[1].trim()] === identity)) flush();
      active = key;
      record[key] = match![2].trim();
    } else if (active && !/^\s*[-*_]{3,}\s*$/.test(line)) {
      record[active] += `${record[active] ? '\n' : ''}${line.trim()}`;
    }
  }
  flush();
  return records;
}

function uniqueRecords(records: Array<Record<string, string>>, identity: string): Array<Record<string, string>> {
  const unique = new Map<string, Record<string, string>>();
  for (const record of records) unique.set(record[identity], { ...unique.get(record[identity]), ...Object.fromEntries(Object.entries(record).filter(([, value]) => value.trim())) });
  return [...unique.values()];
}

export function parseBasicInfo(content: string): { genre?: string; summary?: string } | null {
  const result: { genre?: string; summary?: string } = {};
  for (const block of extractContentBlocks(content).filter(b => b.type === '基本信息')) {
    const body = block.body.replace(/\*\*|__/g, '');
    const genre = body.match(/(?:^|\n)\s*(?:[-*+]\s+)?题材[：:][ \t]*([^\n]*?)(?=\s*简介[：:]|\n|$)/);
    const summary = body.match(/(?:^|\s)简介[：:][ \t]*([\s\S]*)$/);
    if (genre?.[1].trim()) result.genre = genre[1].trim();
    if (summary?.[1].trim()) result.summary = summary[1].trim();
  }
  return Object.keys(result).length ? result : null;
}

export function parseCharacterContent(content: string): Array<Record<string, string>> {
  return uniqueRecords(extractContentBlocks(content).filter(b => b.type === '角色').flatMap(b => parseRecords(b.body, characterFields, 'name', 'role')), 'name').map(record => {
    if (record.role) record.role = /主角|protagonist/i.test(record.role) ? 'protagonist' : /龙套|路人|minor/i.test(record.role) ? 'minor' : 'supporting';
    return record;
  });
}

export function parseWorldContent(content: string): Array<Record<string, string>> {
  return uniqueRecords(extractContentBlocks(content).filter(b => b.type === '世界观').flatMap(b => parseRecords(b.body, worldFields, 'title', 'category')), 'title').filter(record => record.content);
}

export function parseChapterContent(content: string): Array<{ title: string; content: string }> {
  return extractContentBlocks(content).filter(b => b.type === '章节').flatMap(block => {
    const records = parseRecords(block.body, { 标题: 'title', 内容: 'content' }, 'title', 'title');
    return records.filter(r => r.content?.trim() && (block.closed || r.content.length > 50)).map(r => ({ title: r.title, content: r.content }));
  });
}
