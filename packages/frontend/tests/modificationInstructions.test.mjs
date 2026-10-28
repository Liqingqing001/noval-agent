import test from 'node:test';
import assert from 'node:assert/strict';
import { edits, inlineModification, modificationReply, chapterText } from './fixtures/modifications.mjs';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
const { useNovelStore } = await import('../src/stores/novelStore.ts');
const { autoSyncContent, hasSyncableContent } = await import('../src/lib/autoSync.ts');
const { parseModifyInstructions, parseModificationResponse, normalizeModificationTitle } = await import('../src/lib/modificationInstructions.ts');
const { applyTextModification, toEditorHtml } = await import('../src/lib/textModification.ts');
const { syncFeedback } = await import('../src/lib/syncFeedback.ts');

function setup(chapters = [['四个小时', chapterText('四个小时')], ['数', chapterText('数')]]) {
  useNovelStore.getState().clearAll();
  const store = useNovelStore.getState();
  const novel = store.addNovel({ title: '修改回归测试', status: 'draft', wordCount: 0 });
  chapters.forEach(([title, content], sequence) => store.addChapter({ novelId: novel.id, title, content, sequence, wordCount: content.length }));
  return novel.id;
}

test('the six user edits parse separately with inline fields and exclude explanations', () => {
  const parsed = parseModifyInstructions(modificationReply);
  assert.equal(parsed.length, 6);
  parsed.forEach((item, index) => {
    assert.equal(item.title, edits[index][0]);
    assert.equal(item.originalContent, edits[index][1]);
    assert.equal(item.newContent, edits[index][2]);
  });
});

test('all six edits reach the correct chapters and persisted data, retaining the rest of the manuscript', () => {
  const novelId = setup();
  const otherNovel = useNovelStore.getState().addNovel({ title: '另一本书', status: 'draft', wordCount: 0 });
  useNovelStore.getState().addChapter({ novelId: otherNovel.id, title: '四个小时', content: edits[0][1], wordCount: edits[0][1].length, sequence: 0 });
  const result = autoSyncContent(modificationReply, novelId);
  assert.equal(result.modifyCount, 6);
  assert.ok(result.modificationResults.every(item => item.state === 'applied'));
  const chapters = useNovelStore.getState().chapters;
  for (const [title, original, replacement] of edits) {
    const chapter = chapters.find(item => item.novelId === novelId && item.title === title);
    assert.ok(chapter.content.includes(replacement));
    assert.ok(!chapter.content.includes(original));
    assert.ok(!chapter.content.includes('条的说明'));
    assert.equal(chapter.wordCount, chapter.content.length);
  }
  assert.equal(chapters.find(chapter => chapter.novelId === otherNovel.id).content, edits[0][1]);
  const persisted = JSON.parse(memory.get('novel-agent-storage')).state;
  assert.ok(persisted.chapters.find(chapter => chapter.title === '数').content.includes('快二十分钟'));
  assert.equal(syncFeedback(result).state, 'success');
  assert.equal(syncFeedback(result).details.length, 6);
});

test('multiple edits to one chapter produce one combined save per chapter', () => {
  const novelId = setup();
  const updateChapter = useNovelStore.getState().updateChapter;
  const saved = [];
  useNovelStore.setState({ updateChapter: (id, updates) => { saved.push({ id, updates }); updateChapter(id, updates); } });
  try {
    assert.equal(autoSyncContent(modificationReply, novelId).modifyCount, 6);
    assert.equal(saved.length, 2);
    assert.ok(edits.slice(0, 5).every(edit => saved[0].updates.content.includes(edit[2])));
  } finally { useNovelStore.setState({ updateChapter }); }
});

test('creation-like tags quoted in a replacement cannot create or replace a separate chapter', () => {
  const novelId = setup([['四个小时', '待改原文']]);
  const replacement = '【章节】\n标题：误建章节\n内容：这是正文里引用的格式，不能自动新增。\n【/章节】';
  const result = autoSyncContent(inlineModification(['四个小时', '待改原文', replacement]), novelId);
  assert.equal(result.modifyCount, 1);
  assert.equal(result.chapterCount, 0);
  assert.equal(useNovelStore.getState().chapters.length, 1);
  assert.equal(useNovelStore.getState().chapters[0].content, replacement);
});

test('mixed chapter creation and modification cannot overwrite the already applied edit', () => {
  const novelId = setup([['四个小时', '旧稿']]);
  const reply = '【章节】\n标题：四个小时\n内容：新版正文\n【/章节】\n' + inlineModification(['四个小时', '新版正文', '修改后正文']);
  const result = autoSyncContent(reply, novelId);
  assert.equal(result.chapterCount, 1);
  assert.equal(result.modifyCount, 1);
  assert.equal(useNovelStore.getState().chapters[0].content, '修改后正文');
});

test('retries are idempotent, including replacements that contain the original', () => {
  const novelId = setup([['范围', '全校的人']]);
  const command = inlineModification(['范围', '全校', '全校师生']);
  assert.equal(autoSyncContent(command, novelId).modifyCount, 1);
  const repeated = autoSyncContent(command, novelId, { contentOnly: true, retryModifications: true });
  assert.equal(repeated.modifyCount, 0);
  assert.equal(repeated.modificationResults[0].state, 'already-applied');
  assert.equal(useNovelStore.getState().chapters[0].content, '全校师生的人');
  assert.equal(syncFeedback(repeated).state, 'success');
});

test('retry can apply safe modifications without replaying deletion or replacement commands', () => {
  const novelId = setup();
  const reply = inlineModification(edits[5]) + '\n【删除】\n目标：章节\n标题：四个小时\n【/删除】\n【替换】\n目标：章节\n标题：数\n新内容：不应覆盖全章\n【/替换】';
  assert.equal(autoSyncContent(reply, novelId, { contentOnly: true }).modifyCount, 0);
  const result = autoSyncContent(reply, novelId, { contentOnly: true, retryModifications: true });
  assert.equal(result.modifyCount, 1);
  assert.equal(result.deleteCount, 0);
  assert.equal(result.replaceCount, 0);
  assert.equal(useNovelStore.getState().chapters.length, 2);
  assert.equal(useNovelStore.getState().chapters[1].content, edits[5][2]);
});

test('an orphan first block is reported while later valid blocks still apply', () => {
  const novelId = setup();
  const reply = `${edits[0][1]} 新内容：${edits[0][2]} 【/修改】\n${edits.slice(1).map(inlineModification).join('\n')}`;
  const result = autoSyncContent(reply, novelId);
  assert.equal(result.modifyCount, 5);
  assert.equal(result.modificationResults.length, 6);
  assert.match(result.modificationResults[0].message, /缺少/);
  assert.ok(useNovelStore.getState().chapters[0].content.includes(edits[0][1]));
  const feedback = syncFeedback(result);
  assert.equal(feedback.state, 'warning');
  assert.match(feedback.message, /5 项修改.*1 项未执行/);
});

test('missing closure and missing fields never swallow later edits or crash the batch', () => {
  const novelId = setup();
  const invalid = '【修改】\n目标：章节\n原内容：旧\n新内容：新\n【/修改】';
  const unclosed = '【修改】\n目标：章节\n标题：四个小时\n原内容：旧\n新内容：新\n';
  const result = autoSyncContent(invalid + '\n' + unclosed + inlineModification(edits[5]), novelId);
  assert.equal(result.modificationResults.length, 3);
  assert.equal(result.modifyCount, 1);
  assert.ok(result.modificationResults.slice(0, 2).every(item => item.state === 'failed'));
  assert.equal(hasSyncableContent(unclosed), true);
});

test('code examples and quoted instruction tags cannot modify content', () => {
  const command = inlineModification(edits[0]);
  for (const reply of [`\`\`\`text\n${command}\n\`\`\``, `~~~~text\n${command}\n~~~~`, `例如 ${command}`, `> ${command}`, `请使用【修改】标签。`]) {
    assert.deepEqual(parseModifyInstructions(reply), []);
    assert.equal(hasSyncableContent(reply), false);
  }
});

test('a deletion block quoted in the new content is text rather than an executable command', () => {
  const novelId = setup([['四个小时', '待改原文'], ['数', '保留正文']]);
  const replacement = '引用的格式：\n【删除】\n目标：章节\n标题：数\n【/删除】';
  const result = autoSyncContent(inlineModification(['四个小时', '待改原文', replacement]), novelId);
  assert.equal(result.modifyCount, 1);
  assert.equal(result.deleteCount, 0);
  assert.equal(useNovelStore.getState().chapters.length, 2);
});

test('Markdown fields, Windows newlines and literal brackets inside the replacement are supported', () => {
  const reply = '【 修改 】\r\n**目标**：章节\r\n**标题：**四个小时\r\n原内容：第一行\r\n第二行\r\n**新内容**：正文包含【广播】和“新内容：测试”。\r\n下一行\r\n【／修改】';
  const [parsed] = parseModifyInstructions(reply);
  assert.equal(parsed.title, '四个小时');
  assert.equal(parsed.originalContent, '第一行\n第二行');
  assert.equal(parsed.newContent, '正文包含【广播】和“新内容：测试”。\n下一行');
});

test('empty or repeated fields are invalid instead of becoming whole-document writes', () => {
  for (const reply of [
    '【修改】目标：章节 标题：数 原内容： 新内容：新【/修改】',
    '【修改】目标：章节 标题：数 原内容：旧 新内容：【/修改】',
    '【修改】目标：章节 标题：数 标题：四个小时 原内容：旧 新内容：新【/修改】',
  ]) {
    assert.deepEqual(parseModifyInstructions(reply), []);
    assert.ok(parseModificationResponse(reply)[0].error);
  }
});

test('numbered titles normalize only the prefix and never remove numbers within the title', () => {
  assert.equal(normalizeModificationTitle('第十二章：四个小时'), '四个小时');
  assert.equal(normalizeModificationTitle('四个小时'), '四个小时');
  const novelId = setup([['第十二章：四个小时', edits[1][1]]]);
  assert.equal(autoSyncContent(inlineModification(edits[1]), novelId).modifyCount, 1);
});

test('ambiguous chapter titles and repeated original passages are rejected without changes', () => {
  const novelId = setup([['四个小时', edits[1][1]], ['四个小时', edits[1][1]]]);
  const result = autoSyncContent(inlineModification(edits[1]), novelId);
  assert.equal(result.modifyCount, 0);
  assert.match(result.modificationResults[0].message, /同名/);
  const duplicate = applyTextModification('甲，甲。', '甲', '乙');
  assert.equal(duplicate.state, 'failed');
  assert.equal(duplicate.content, '甲，甲。');
  assert.match(duplicate.message, /2 处/);
});

test('missing targets and mismatched numbers do not fall back to other chapters', () => {
  const novelId = setup([['四个小时之后', edits[1][1]], ['数', '灯灭到现在快三十分钟了。']]);
  const result = autoSyncContent([inlineModification(edits[1]), inlineModification(edits[5])].join('\n'), novelId);
  assert.equal(result.modifyCount, 0);
  assert.equal(syncFeedback(result).state, 'warning');
  assert.equal(useNovelStore.getState().chapters[1].content, '灯灭到现在快三十分钟了。');
});

test('sequential edits use the latest version rather than restoring earlier changes', () => {
  const novelId = setup([['四个小时', '甲先到，乙后到。']]);
  const reply = [['四个小时', '甲先到', '甲后到'], ['四个小时', '甲后到，乙后到', '甲后到，乙先到']].map(inlineModification).join('\n');
  assert.equal(autoSyncContent(reply, novelId).modifyCount, 2);
  assert.equal(useNovelStore.getState().chapters[0].content, '甲后到，乙先到。');
});

test('quote and whitespace differences are tolerated; replacement dollar signs stay literal', () => {
  assert.equal(applyTextModification('正面写着“金杯 京A·7K3”', edits[2][1], edits[2][2]).content, edits[2][2]);
  assert.equal(applyTextModification('第一行\r\n  第二行', '第一行 第二行', '$& $1').content, '$& $1');
  assert.equal(applyTextModification('11:43 睁眼', '11:44 睁眼', '改写').state, 'failed');
  assert.equal(toEditorHtml('甲 < 乙 & 丙\n下一行'), '<p>甲 &lt; 乙 &amp; 丙</p><p>下一行</p>');
});

test('character, world and outline edits require matching originals and preserve unrelated text', () => {
  const novelId = setup([]);
  const store = useNovelStore.getState();
  const character = store.addCharacter({ novelId, name: '周聿', aliases: [], description: '学生', personality: '性格谨慎，观察细致。' });
  const world = store.addWorldSetting({ novelId, title: '校园', category: '环境', content: '西区停电，北区封锁。' });
  const outline = store.addPlotCard({ novelId, type: 'chapter', title: '四个小时', summary: '五点发稿。后续保留。', sequence: 0, status: 'pending' });
  store.addPlotCard({ novelId, type: 'volume', title: '四个小时', summary: '卷简介不变。', sequence: 0, status: 'pending' });
  const reply = '【修改】目标：角色 姓名：周聿 字段：性格 原内容：谨慎 新内容：果断【/修改】\n【修改】目标：世界观 标题：校园 原内容：西区停电 新内容：西区复电【/修改】\n【修改】目标：大纲 标题：四个小时 原内容：五点 新内容：三点【/修改】';
  assert.equal(autoSyncContent(reply, novelId).modifyCount, 3);
  assert.equal(useNovelStore.getState().characters.find(item => item.id === character.id).personality, '性格果断，观察细致。');
  assert.equal(useNovelStore.getState().worldSettings.find(item => item.id === world.id).content, '西区复电，北区封锁。');
  assert.equal(useNovelStore.getState().plotCards.find(item => item.id === outline.id).summary, '三点发稿。后续保留。');
  const bad = '【修改】目标：角色 姓名：周聿 字段：id 原内容：学生 新内容：越权字段【/修改】\n【修改】目标：世界观 标题：校园 原内容：不存在 新内容：覆盖【/修改】';
  const result = autoSyncContent(bad, novelId);
  assert.equal(result.modifyCount, 0);
  assert.equal(useNovelStore.getState().characters[0].id, character.id);
  assert.equal(useNovelStore.getState().worldSettings[0].content, '西区复电，北区封锁。');
});
