import test from 'node:test';
import assert from 'node:assert/strict';

// Ephemeral storage; tests never read browser data or contact the backend.
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
const { autoSyncContent, hasSyncableContent, parseChapterOutlineContent } = await import('../src/lib/autoSync.ts');
const { useNovelStore } = await import('../src/stores/novelStore.ts');

test('new volumes immediately own their outlines and retries never duplicate them', () => {
  useNovelStore.getState().clearAll();
  const novel = useNovelStore.getState().addNovel({ title: '分卷测试', wordCount: 0, status: 'draft' });
  const reply = '【卷】\n标题：第一卷 觉醒\n概要：开端\n【/卷】\n【章节大纲】\n卷：第一卷 觉醒\n第1章：开端 - 遇到危险\n第2章再次出发 — 离开校园\n【/章节大纲】\n【章节大纲】\n卷：第二卷 重逢\n第3章：重逢 - 重新见面\n【/章节大纲】';
  assert.equal(parseChapterOutlineContent(reply)[0].chapters[0].title, '开端');
  autoSyncContent(reply, novel.id);
  autoSyncContent(reply, novel.id, { contentOnly: true });
  const cards = useNovelStore.getState().plotCards;
  assert.equal(cards.filter(card => card.type === 'volume').length, 2);
  assert.equal(cards.filter(card => card.type === 'chapter').length, 3);
  const first = cards.find(card => card.title === '第一卷 觉醒');
  assert.deepEqual(cards.filter(card => card.volumeId === first.id).map(card => card.title), ['开端', '再次出发']);
  assert.ok(cards.filter(card => card.type === 'chapter').every(card => cards.some(volume => volume.type === 'volume' && volume.id === card.volumeId)));
});

test('status updates require a complete real block, are scoped and report actual writes', () => {
  useNovelStore.getState().clearAll();
  const state = useNovelStore.getState();
  const novel = state.addNovel({ title: '状态测试', wordCount: 0, status: 'draft' });
  const second = state.addNovel({ title: '另一本', wordCount: 0, status: 'draft' });
  const add = (title, novelId = novel.id, volumeId) => state.addPlotCard({ novelId, type: 'chapter', title, summary: '概要', status: 'pending', sequence: 0, volumeId });
  const card = add('开端');
  const other = add('开端', second.id);
  add('同名', novel.id, 'v1'); add('同名', novel.id, 'v2');
  const block = '【章节列表】\n第1章：开端 (3000字) ✅ 已完成\n第2章：同名 (1000字) ✅ 已完成\n【/章节列表】';
  assert.equal(autoSyncContent(`\`\`\`\n${block}\n\`\`\``, novel.id).statusCount, 0);
  assert.equal(autoSyncContent(block.replace('【/章节列表】', ''), novel.id).statusCount, 0);
  assert.equal(autoSyncContent(block, novel.id).statusCount, 1);
  assert.equal(useNovelStore.getState().plotCards.find(item => item.id === card.id).status, 'completed');
  assert.equal(useNovelStore.getState().plotCards.find(item => item.id === other.id).status, 'pending');
  assert.equal(autoSyncContent(block, novel.id).statusCount, 0);
});

test('recovered data reaches the actual store and repeated sync updates existing records', () => {
  useNovelStore.getState().clearAll();
  const novel = useNovelStore.getState().addNovel({ title: '回归测试', wordCount: 0, status: 'draft' });
  const reply = '**📝 基本信息**\n题材：末世校园 简介：知识流生存\n【人物】\n姓名：程砚\n定位：主角\n性格：谨慎\n【世界观】\n分类：环境\n名称：校园\n内容：封锁\n分类：规则\n名称：病毒\n内容：体液传播\n名称：病毒\n内容：更新后的规则';
  assert.equal(hasSyncableContent(reply), true);
  const result = autoSyncContent(reply, novel.id);
  assert.equal(result.basicInfo, true);
  assert.equal(result.characterCount, 1);
  assert.equal(result.worldCount, 2);
  let state = useNovelStore.getState();
  assert.equal(state.novels[0].genre, '末世校园');
  assert.equal(state.characters[0].name, '程砚');
  assert.equal(state.worldSettings.length, 2);
  assert.equal(state.worldSettings.find(w => w.title === '病毒').content, '更新后的规则');
  assert.equal(JSON.parse(memory.get('novel-agent-storage')).state.worldSettings.length, 2);
  autoSyncContent(reply, novel.id, { contentOnly: true });
  state = useNovelStore.getState();
  assert.equal(state.characters.length, 1);
  assert.equal(state.worldSettings.length, 2);
});

test('retry never replays destructive commands and incomplete commands do nothing', () => {
  useNovelStore.getState().clearAll();
  const novel = useNovelStore.getState().addNovel({ title: '命令测试', wordCount: 0, status: 'draft' });
  const state = useNovelStore.getState();
  state.addWorldSetting({ novelId: novel.id, title: '校园', content: '封锁', category: '环境' });
  const command = '【删除】\n目标：世界观\n标题：校园\n【/删除】';
  assert.equal(autoSyncContent(command, novel.id, { contentOnly: true }).deleteCount, 0);
  assert.equal(useNovelStore.getState().worldSettings.length, 1);
  assert.equal(autoSyncContent(command.replace('【/删除】', ''), novel.id).deleteCount, 0);
  assert.equal(hasSyncableContent('**📝 基本信息**\n题材：校园'), true);
  assert.equal(hasSyncableContent('【删除】\n目标：世界观\n标题：校园'), false);
});
