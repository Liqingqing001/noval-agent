import test from 'node:test';
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {} };
const { useNovelStore: store } = await import('../src/stores/novelStore.ts');
const chapter = (id, novelId, sequence) => ({ id, novelId, sequence, title: id, content: '', wordCount: 0 });
const chapters = [chapter('a2', 'a', 2), chapter('b1', 'b', 1), chapter('a1', 'a', 1)];
function reset() { store.getState().clearAll(); store.getState().setNovels([{ id: 'a' }, { id: 'b' }, { id: 'empty' }]); store.getState().setChapters(chapters); }
test('switching books restores each selection, defaults by sequence and rejects foreign chapters', () => {
  reset(); const s = store.getState(); s.setCurrentNovel('a'); assert.equal(store.getState().currentChapterId, 'a1');
  s.setCurrentChapter('a2'); s.setCurrentNovel('b'); assert.equal(store.getState().currentChapterId, 'b1');
  s.setCurrentChapter('a1'); assert.equal(store.getState().currentChapterId, 'b1');
  s.setCurrentNovel('a'); assert.equal(store.getState().currentChapterId, 'a2'); s.setCurrentNovel('a'); assert.equal(store.getState().currentChapterId, 'a2');
});
test('reload and legacy current chapter recover without overwriting remembered books', async () => {
  reset(); store.getState().setCurrentNovel('a'); store.getState().setCurrentChapter('a2'); store.getState().setCurrentNovel('b');
  const saved = memory.get('novel-agent-storage'); store.getState().clearAll(); memory.set('novel-agent-storage', saved); await store.persist.rehydrate();
  store.getState().setCurrentNovel('a'); assert.equal(store.getState().currentChapterId, 'a2');
  const legacy = JSON.parse(saved); delete legacy.state.lastReadChapterIds; legacy.state.currentNovelId = 'a'; legacy.state.currentChapterId = 'a2';
  memory.set('novel-agent-storage', JSON.stringify(legacy)); await store.persist.rehydrate(); store.getState().setCurrentNovel('b'); store.getState().setCurrentNovel('a'); assert.equal(store.getState().currentChapterId, 'a2');
});
test('deleted and remotely missing chapters fall back, empty books select their first new chapter', () => {
  reset(); const s = store.getState(); s.setCurrentNovel('a'); s.setCurrentChapter('a2'); s.deleteChapter('a2'); assert.equal(store.getState().currentChapterId, 'a1');
  s.setCurrentNovel('b'); s.setCurrentNovel('a'); assert.equal(store.getState().currentChapterId, 'a1');
  s.setChapters([]); assert.equal(store.getState().currentChapterId, null); s.setChapters(chapters); assert.equal(store.getState().currentChapterId, 'a1');
  s.setCurrentNovel('empty'); assert.equal(store.getState().currentChapterId, null); const added = s.addChapter({ novelId: 'empty', title: '第一章', sequence: 0, content: '', wordCount: 0 }); assert.equal(store.getState().currentChapterId, added.id);
});
test('delayed cloud load preserves remembered selection and book deletion/logout remove it', () => {
  reset(); const s = store.getState(); s.setCurrentNovel('a'); s.setCurrentChapter('a2'); s.setChapters([]); s.setCurrentNovel('b'); s.setCurrentNovel('a'); s.setChapters(chapters); assert.equal(store.getState().currentChapterId, 'a2');
  s.deleteNovel('a'); assert.equal(store.getState().lastReadChapterIds.a, undefined); s.clearAll(); assert.deepEqual(store.getState().lastReadChapterIds, {});
});

test('server chapter IDs replace remembered temporary IDs even while another book is open', async () => {
  reset(); const originalFetch = globalThis.fetch; let release;
  memory.set('novel-agent-auth-token', 'TEST_PLACEHOLDER');
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST' && url.endsWith('/chapters')) { const body = JSON.parse(options.body); return new Promise(resolve => { release = () => resolve(Response.json({ chapter: { ...body, id: 'server-chapter' } })); }); }
    if (options.method === 'PUT') return Response.json({});
    throw Error('Unexpected test request');
  };
  try {
    const s = store.getState(); s.setCurrentNovel('a'); const added = s.addChapter({ novelId: 'a', title: '新章节', sequence: 3, content: '', wordCount: 0 });
    s.setCurrentChapter(added.id); s.setCurrentNovel('b'); release(); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.getState().lastReadChapterIds.a, 'server-chapter'); s.setCurrentNovel('a'); assert.equal(store.getState().currentChapterId, 'server-chapter');
  } finally { globalThis.fetch = originalFetch; memory.delete('novel-agent-auth-token'); }
});
