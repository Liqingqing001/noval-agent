import test from 'node:test';
import assert from 'node:assert/strict';
import { extractContentBlocks, parseBasicInfo, parseCharacterContent, parseWorldContent, parseChapterContent, normalizeCreationSections } from '../src/lib/structuredContent.ts';
import { syncFeedback } from '../src/lib/syncFeedback.ts';

test('missing closures stop at the next section and recover final EOF', () => {
  const text = '【基本信息】\n题材：末世 / 校园 简介：知识流生存故事\n【人物】\n姓名：程砚\n定位：主角\n【世界观】\n名称：感染规则\n内容：接触传播';
  assert.deepEqual(parseBasicInfo(text), { genre: '末世 / 校园', summary: '知识流生存故事' });
  assert.equal(parseCharacterContent(text)[0].name, '程砚');
  assert.equal(parseCharacterContent(text)[0].role, 'protagonist');
  assert.deepEqual(parseWorldContent(text), [{ title: '感染规则', content: '接触传播' }]);
});

test('a missing closure before another same-kind block does not consume either item', () => {
  assert.deepEqual(parseWorldContent('【世界观】\n名称：校园\n内容：封锁中\n【世界观】\n名称：医院\n内容：已失联\n【/世界观】').map(w => w.title), ['校园', '医院']);
});

test('several worlds in one block retain category and multiline contents per item', () => {
  assert.deepEqual(parseWorldContent('【世界观】\n分类：环境\n名称：校园\n内容：第一行\n\n第二段\n分类：规则\n名称：病毒\n内容：传播机制\n【/世界观】'), [
    { category: '环境', title: '校园', content: '第一行\n\n第二段' },
    { category: '规则', title: '病毒', content: '传播机制' },
  ]);
});

test('several characters retain their roles and Markdown field labels', () => {
  assert.deepEqual(parseCharacterContent('【角色】\n**定位**：主角\n- **姓名**：程砚\n性格：谨慎\n背景：学生\n经历了封校\n定位：配角\n姓名：林逸\n性格：果断\n【/角色】'), [
    { role: 'protagonist', name: '程砚', personality: '谨慎', background: '学生\n经历了封校' },
    { role: 'supporting', name: '林逸', personality: '果断' },
  ]);
});

test('rendered headings from the user example work without fake success annotations', () => {
  const text = '**📝 基本信息**\r\n题材：末世丧尸 / 校园群像生存（知识流） 简介：\r\n校园中爆发危机。\r\n**🌍 世界观**\r\n名称：传播规则\r\n内容：体液传播\r\n✅ *已同步到左侧"世界观"面板*\r\n后续解释不会存入世界观\r\n## 人物\r\n姓名：程砚\r\n简介：学生';
  assert.equal(parseBasicInfo(text).summary, '校园中爆发危机。');
  assert.equal(parseWorldContent(text)[0].content, '体液传播');
  assert.equal(parseCharacterContent(text)[0].description, '学生');
});

test('empty fields, ordinary prose, quoted tags, fenced examples and destructive headings are not creation data', () => {
  for (const text of ['请使用【角色】标签，写姓名：甲。', '题材：校园\n简介：聊天讨论', '【世界观】\n内容：没有名称\n【/世界观】', '```text\n【世界观】\n名称：示例\n内容：只是示例\n【/世界观】\n```', '## 删除\n目标：世界观\n标题：校园']) {
    assert.equal(parseBasicInfo(text), null);
    assert.deepEqual(parseCharacterContent(text), []);
    assert.deepEqual(parseWorldContent(text), []);
  }
});

test('unclosed chapter is bounded by another section; very short fragments stay unsynced', () => {
  const body = '校园的广播一遍遍重复着封锁通知。'.repeat(10);
  assert.deepEqual(parseChapterContent(`【章节】\n标题：封校\n内容：${body}\n【世界观】\n名称：规则\n内容：广播通知`), [{ title: '封校', content: body }]);
  assert.deepEqual(parseChapterContent('【章节】\n标题：封校\n内容：未完成'), []);
  assert.deepEqual(parseChapterContent('【章节】\n标题：空章节\n【/章节】'), []);
});

test('normalization recovers volume boundaries without manufacturing commands', () => {
  const normalized = normalizeCreationSections('【卷】\n标题：第一卷\n概要：封校\n【章节大纲】\n卷：第一卷\n第1章 封校 - 危机到来\n【删除】\n目标：卷\n标题：第一卷');
  assert.equal(extractContentBlocks(normalized).length, 2);
  assert.ok(normalized.includes('【/卷】'));
  assert.ok(!normalized.includes('删除'));
});

test('trailing role/category belongs to the current item; empty worlds are rejected', () => {
  assert.equal(parseCharacterContent('【角色】\n姓名：程砚\n性格：谨慎\n定位：主角\n【/角色】')[0].role, 'protagonist');
  assert.deepEqual(parseWorldContent('【世界观】\n名称：校园\n内容：封锁中\n分类：环境\n【/世界观】'), [{ title: '校园', content: '封锁中', category: '环境' }]);
  assert.deepEqual(parseWorldContent('【世界观】\n名称：空条目\n内容：\n【/世界观】'), []);
});

test('sync feedback reflects actual counts and distinguishes no write', () => {
  assert.deepEqual(syncFeedback({ basicInfo: false, worldCount: 0 }), { state: 'warning', message: '未识别到有效字段，尚未同步。请检查名称、标题和内容是否齐全。' });
  assert.match(syncFeedback({ basicInfo: true, characterCount: 2, worldCount: 3 }).message, /基本信息、2 个人物、3 条世界观/);
});
