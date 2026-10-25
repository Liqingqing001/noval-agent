import test from 'node:test';
import assert from 'node:assert/strict';

// Ephemeral storage; tests never read browser data or contact the backend.
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
const { autoSyncContent, hasSyncableContent } = await import('../src/lib/autoSync.ts');
const { useNovelStore } = await import('../src/stores/novelStore.ts');

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
