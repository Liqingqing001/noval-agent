import test from 'node:test';
import assert from 'node:assert/strict';
import { hasChapterBody, outlineProgressUpdates } from '../src/lib/outlineProgress.ts';

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
const { useNovelStore } = await import('../src/stores/novelStore.ts');
const chapter = (id, title, content = '已有正文', novelId = 'book') => ({ id, title, content, novelId });
const card = (id, title, extra = {}) => ({ id, title, type: 'chapter', novelId: 'book', status: 'pending', ...extra });

test('empty rich text is not a manuscript and stale word counts do not determine completion', () => {
  for (const content of ['', ' \n\u200b', '<p><br></p>', '<p>&nbsp;&#160;&#xa0;</p>', '<!--注释--><script>1</script>']) assert.equal(hasChapterBody(content), false);
  assert.equal(hasChapterBody('<p>真正的正文</p>'), true);
});

test('legacy outlines recover links by unique normalized titles in the same novel', () => {
  assert.deepEqual(outlineProgressUpdates([card('outline', '第1章：开端')], [chapter('chapter', '开端')]), [{ id: 'outline', updates: { chapterId: 'chapter', status: 'completed' } }]);
  assert.deepEqual(outlineProgressUpdates([card('outline', '开端')], [chapter('other', '开端', '正文', 'other-book')]), []);
  assert.deepEqual(outlineProgressUpdates([card('one', '开端'), card('two', '开端')], [chapter('chapter', '开端')]), []);
  assert.deepEqual(outlineProgressUpdates([card('one', '开端')], [chapter('a', '开端'), chapter('b', '开端')]), []);
});

test('explicit links survive renaming; clear/delete resets only automatic status', () => {
  const outline = card('outline', '旧标题', { chapterId: 'chapter', status: 'completed' });
  assert.deepEqual(outlineProgressUpdates([outline], [chapter('chapter', '新标题')]), []);
  assert.deepEqual(outlineProgressUpdates([outline], [chapter('chapter', '新标题', '<p></p>')]), [{ id: 'outline', updates: { status: 'pending' } }]);
  assert.deepEqual(outlineProgressUpdates([outline], []), [], 'An incomplete cloud load must not demote records');
  assert.deepEqual(outlineProgressUpdates([outline], [], ['chapter']), [{ id: 'outline', updates: { chapterId: undefined, status: 'pending' } }]);
  assert.deepEqual(outlineProgressUpdates([{ ...outline, statusMode: 'manual' }], [chapter('chapter', '新标题', '')]), []);
});

test('manual chapter saves, outline creation order and manual override all use the same store rule', () => {
  const store = useNovelStore.getState(); store.clearAll();
  const novel = store.addNovel({ title: '自动状态测试', wordCount: 0, status: 'draft' });
  const written = store.addChapter({ novelId: novel.id, title: '第1章 开端', content: '<p>正文</p>', wordCount: 2, sequence: 0 });
  const outline = store.addPlotCard({ novelId: novel.id, type: 'chapter', title: '开端', summary: '概要', sequence: 0, status: 'pending' });
  const current = () => useNovelStore.getState().plotCards.find(item => item.id === outline.id);
  assert.equal(current().status, 'completed'); assert.equal(current().chapterId, written.id);
  store.updateChapter(written.id, { content: '' }); assert.equal(current().status, 'pending');
  store.updateChapter(written.id, { content: '新正文' }); assert.equal(current().status, 'completed');
  store.updatePlotCard(outline.id, { status: 'pending', statusMode: 'manual' });
  store.updateChapter(written.id, { content: '修改正文' }); assert.equal(current().status, 'pending');
  store.reconcileOutlineProgress(novel.id); assert.equal(current().status, 'pending');
  store.updatePlotCard(outline.id, { statusMode: 'auto' }); assert.equal(current().status, 'completed');
  store.deleteChapter(written.id); assert.equal(current().status, 'pending'); assert.equal(current().chapterId, undefined);
});

test('cloud ID replacement and out-of-order create responses preserve completion and manual mode', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const chapterFirst of [true, false]) {
      memory.delete('novel-agent-auth-token');
      const store = useNovelStore.getState(); store.clearAll();
      const novel = store.addNovel({ title: '异步测试', wordCount: 0, status: 'draft' });
      memory.set('novel-agent-auth-token', 'TEST_PLACEHOLDER');
      const writes = [];
      let releaseChapter, releaseOutline;
      globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body || '{}');
        if (options.method === 'POST' && url.endsWith('/chapters')) return new Promise(resolve => { releaseChapter = () => resolve(Response.json({ chapter: { ...body, id: 'server-chapter', createdAt: Date.now(), updatedAt: Date.now() } })); });
        if (options.method === 'POST' && url.endsWith('/plot-cards')) return new Promise(resolve => { releaseOutline = () => resolve(Response.json({ plotCard: { ...body, id: 'server-outline', createdAt: Date.now(), updatedAt: Date.now() } })); });
        if (options.method === 'PUT') { writes.push({ url, body }); return Response.json({}); }
        throw new Error(`Unexpected test request ${url}`);
      };
      const outline = store.addPlotCard({ novelId: novel.id, type: 'chapter', title: '开端', summary: '概要', sequence: 0, status: 'pending' });
      const created = store.addChapter({ novelId: novel.id, title: '开端', content: '', sequence: 0, wordCount: 0 });
      store.updateChapter(created.id, { content: '完整正文', wordCount: 4 });
      store.updatePlotCard(outline.id, { statusMode: 'manual', status: 'completed' });
      const flush = () => new Promise(resolve => setImmediate(resolve));
      if (chapterFirst) { releaseChapter(); await flush(); releaseOutline(); } else { releaseOutline(); await flush(); releaseChapter(); }
      await flush(); await flush();
      const saved = useNovelStore.getState().plotCards[0];
      assert.equal(saved.id, 'server-outline'); assert.equal(saved.chapterId, 'server-chapter');
      assert.equal(saved.status, 'completed'); assert.equal(saved.statusMode, 'manual');
      assert.equal(useNovelStore.getState().chapters[0].content, '完整正文', 'A delayed create response must not replace newly saved text with its empty original');
      assert.ok(writes.some(write => write.body.chapterId === 'server-chapter'));
      assert.ok(writes.every(write => /\/(server-outline|server-chapter)$/.test(write.url)));
      assert.ok(writes.every(write => !write.body.chapterId || write.body.chapterId === 'server-chapter'));
    }
  } finally { globalThis.fetch = originalFetch; memory.delete('novel-agent-auth-token'); }
});
