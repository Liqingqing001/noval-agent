import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { bareChapterTitle } from './demo-library.mjs';
const root = new URL('../packages/frontend/public/book/', import.meta.url);
const setting = JSON.parse(await readFile(new URL('setting.json', root), 'utf8'));
const files = (await readdir(new URL('chapters/', root))).filter(x => /^\d{2}\.md$/.test(x)).sort();
const chapters = [];
const bodies = [];
const seen = new Set();
for (const [index, file] of files.entries()) {
  const text = (await readFile(new URL(`chapters/${file}`, root), 'utf8')).trim();
  const [heading, ...lines] = text.split('\n');
  if (!heading.startsWith('# ') || !lines.join('').trim()) throw Error(`Empty chapter: ${file}`);
  const body = lines.join('\n').trim();
  for (const paragraph of body.split(/\n\s*\n/)) {
    if (paragraph.length < 70) continue;
    if (seen.has(paragraph)) throw Error(`Repeated paragraph: ${file}`);
    seen.add(paragraph);
  }
  if (/TODO|待续|十五\?|六十五\?/.test(body)) throw Error(`Unfinished text: ${file}`);
  chapters.push({ id: file.slice(0,2), title: bareChapterTitle(heading.slice(2)), hanCount: (body.match(/\p{Script=Han}/gu) || []).length, characterCount: body.replace(/\s/g,'').length, summary: setting.chapterSummaries[index], sha256: createHash('sha256').update(text+'\n').digest('hex') });
  bodies.push(text);
}
if (chapters.length !== 40 || setting.chapterSummaries.length !== 40) throw Error('Expected 40 chapters and summaries');
const hanCount = chapters.reduce((n,x)=>n+x.hanCount,0);
if (hanCount < 60000) throw Error(`正文不足六万汉字: ${hanCount}`);
if (!bodies.at(-1).endsWith('——全文完——')) throw Error('Missing ending');
const manifest = { title: setting.title, status: '完本', chapterCount: chapters.length, hanCount, characterCount: chapters.reduce((n,x)=>n+x.characterCount,0), countingRule: '逐章去掉标题后统计 Unicode Han 汉字；不计标点、空白、阿拉伯数字、大纲、设定及图片文字。', chapters };
await writeFile(new URL('manifest.json',root), JSON.stringify(manifest,null,2)+'\n');
const full = `# ${setting.title}\n\n${setting.credit}\n\n正文 ${hanCount.toLocaleString('zh-CN')} 汉字 · ${chapters.length} 章 · 完本\n\n` + bodies.join('\n\n---\n\n')+'\n';
await writeFile(new URL('novel.md',root), full);
await writeFile(new URL('novel.txt',root), '\ufeff'+full.replace(/^# /gm,'').replace(/^---$/gm,'').replace(/\n/g,'\r\n'));
const notes = `# 《${setting.title}》创作档案\n\n> 含完整剧透；不计入正文六万字。\n\n## 创作意图\n\n以寻找母亲的私人悬疑进入公共工程伦理。技术能保存痕迹，却不能替人同意；高潮解决潮灾，后半卷将后果落实到调查、入学、住房、职业与亲密关系。拒绝用复活奖励主角，也不以一场胜利宣称制度从此无误。\n\n## 人物\n\n${setting.characters.map(x=>`### ${x.name}｜${x.role}\n\n欲望：${x.desire}\n\n局限：${x.flaw}\n\n弧线：${x.arc}\n\n形象：${x.appearance || x.detail}\n\n性格：${x.personality || x.flaw}\n\n背景：${x.background || x.arc}`).join('\n\n')}\n\n## 世界观\n\n${setting.world.map(x=>`### ${x.title}\n\n${x.text}`).join('\n\n')}\n\n## 时间线\n\n${setting.timeline.map(x=>`- ${x.time}：${x.event}`).join('\n')}\n\n## 五卷总纲\n\n${setting.acts.map(x=>`### ${x.title}（${x.range.join('—')}章）\n\n${x.description}`).join('\n\n')}\n\n## 四十章细纲\n\n${chapters.map(x=>`### ${x.title}\n\n${x.summary}`).join('\n\n')}\n\n## 伏笔与回收\n\n- 炉子第二格的糖：触发母亲识别，揭示不完整取忆与关联记忆；最终母亲回到生活细节而非神谕。\n- 十七号闸的纸：不是神秘钥匙，而是私人相信的东西；画像最终挂回普通饭桌。\n- 七月十九日：停钟、账册与死亡日期互证；后来时钟重新走动，不固定在灾难时间。\n- 三短一长：寻找弟弟的线索，最终连接一段没有遗言的普通生活。\n- 中央留空的水轮：从图纸到可退出的分布式设计，再到主角本人不必成为中心。\n- 新鞋与买酱油：未竟生活不被英雄叙事吞没；陆苗与沈砚在新的生活中回收。\n- 山的照片：公共物件中的无用愿望，最后落实为可只走半程的真实旅途。\n- 两张船票：用作时间证据，不把退票倒推为无迟疑牺牲；主角能买自己的新票。\n\n## 配图\n\n书封、四位主角群像及八位人物头像为 AI 生成的文学插画。群像从左至右：林雾、沈砚、许照、陆苗。画中年龄与衣着是视觉诠释，具体情节以正文为准。原始生成图保留在会话工作区，仓库使用 WebP 发布副本。\n`;
await writeFile(new URL('creation-notes.md',root),notes);
console.log(JSON.stringify({chapters:chapters.length,bodyHan:hanCount,characters:manifest.characterCount,duplicateParagraphs:0}));
