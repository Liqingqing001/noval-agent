import { readFile, writeFile, readdir } from 'node:fs/promises';
import { hanCount, sha256, bareChapterTitle } from './demo-library.mjs';
const root = new URL('../packages/frontend/public/school/', import.meta.url);
const setting = JSON.parse(await readFile(new URL('setting.json', root), 'utf8'));
const files = (await readdir(new URL('chapters/', root))).filter(file => /^\d{2}\.md$/.test(file)).sort();
const chapters = [], bodies = [], seen = new Set();
for (const [index, file] of files.entries()) {
  const text = (await readFile(new URL(`chapters/${file}`, root), 'utf8')).trim();
  const [heading, ...lines] = text.split('\n');
  const title = heading.slice(2).trim(), body = lines.join('\n').trim();
  if (!heading.startsWith('# ') || !body || title !== bareChapterTitle(title)) throw Error(`章节标题必须只含标题，正文不可为空：${file}`);
  for (const paragraph of body.split(/\n\s*\n/)) {
    if (paragraph.length < 70) continue;
    if (seen.has(paragraph)) throw Error(`Repeated paragraph: ${file}`);
    seen.add(paragraph);
  }
  if (/TODO|待续|此处省略|正文待补/.test(body)) throw Error(`Unfinished text: ${file}`);
  chapters.push({ id: file.slice(0, 2), title, hanCount: hanCount(body), characterCount: body.replace(/\s/g, '').length, summary: setting.chapterSummaries[index], sha256: sha256(text + '\n') });
  bodies.push(text);
}
if (chapters.length !== 40 || setting.chapterSummaries.length !== 40 || files.some((file, index) => file !== `${String(index + 1).padStart(2, '0')}.md`)) throw Error('Expected chapters 01–40 and 40 summaries');
const bodyHan = chapters.reduce((sum, chapter) => sum + chapter.hanCount, 0);
if (bodyHan < 60000 || bodyHan > 70000) throw Error(`正文须为六万至七万汉字：${bodyHan}`);
if (!bodies.at(-1).endsWith('——全文完——')) throw Error('Missing ending');
const manifest = { title: setting.title, status: '完本', chapterCount: 40, hanCount: bodyHan, characterCount: chapters.reduce((sum, chapter) => sum + chapter.characterCount, 0), countingRule: '逐章去掉标题后统计 Unicode Han 汉字；不计标点、空白、阿拉伯数字、大纲、设定及图片文字。', chapters };
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
const full = `# ${setting.title}\n\n${setting.credit}\n\n正文 ${bodyHan.toLocaleString('zh-CN')} 汉字 · 40 章 · 完本\n\n` + bodies.join('\n\n---\n\n') + '\n';
await writeFile(new URL('novel.md', root), full);
await writeFile(new URL('novel.txt', root), '\ufeff' + full.replace(/^# /gm, '').replace(/^---$/gm, '').replace(/\n/g, '\r\n'));
const notes = `# 《${setting.title}》创作档案\n\n> 含完整剧透；设定、大纲、图片文字不计入正文。\n\n${setting.credit}\n\n## 创作意图\n\n${setting.intent || setting.description}\n\n## 人物\n\n${setting.characters.map(item => `### ${item.name}｜${item.role}\n\n欲望：${item.desire}\n\n局限：${item.flaw}\n\n弧线：${item.arc}\n\n形象：${item.appearance || item.detail}\n\n性格：${item.personality || item.flaw}\n\n背景：${item.background || item.arc}`).join('\n\n')}\n\n## 世界观\n\n${setting.world.map(item => `### ${item.title}\n\n${item.content || item.text}`).join('\n\n')}\n\n## 时间线\n\n${setting.timeline.map(item => `- ${item.time}：${item.event}`).join('\n')}\n\n## 五夜总纲\n\n${setting.acts.map(item => `### ${item.title}（${item.range.join('—')}章）\n\n${item.description}`).join('\n\n')}\n\n## 四十章细纲\n\n${chapters.map(item => `### ${item.title}\n\n${item.summary}`).join('\n\n')}\n\n## 伏笔与回收\n\n${(setting.foreshadowings || []).map(item => `- ${item.title}：${item.description}（${item.start}—${item.end}章）`).join('\n')}\n\n## 配图\n\n书封七人群像与十二位人物头像由 AI 生成，采用同一校园悬疑插画风格。人物年龄、伤势与具体行动以正文为准。头像图集用于人物与世界观面板，不计入小说正文。\n`;
await writeFile(new URL('creation-notes.md', root), notes);
console.log(JSON.stringify({ title: setting.title, chapters: 40, bodyHan, characters: manifest.characterCount, duplicateParagraphs: 0 }));
