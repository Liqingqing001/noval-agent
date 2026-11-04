import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHistoryOperation, chapterVersion, chapterHistoryDiff, chapterVersionFingerprint, readChapterHistory, CHAPTER_HISTORY_LIMIT } from '../src/lib/chapterHistory.ts';
const localMemory = new Map();
globalThis.localStorage = { getItem: key => localMemory.get(key) ?? null, setItem: (key, value) => localMemory.set(key, value), removeItem: key => localMemory.delete(key) };
const browserStub = { localStorage: globalThis.localStorage, addEventListener() {} };
globalThis.window = browserStub;
const { createChapterHistoryStore } = await import('../src/stores/chapterHistoryStore.ts');
delete globalThis.window;

const chapter = (content = '原文', extra = {}) => ({ id: 'c1', novelId: 'n1', title: '开端', content, wordCount: content.length, sequence: 1, createdAt: 1, updatedAt: 1, ...extra });
const capture = (value, kind = 'automatic', at = 1, id = `v-${at}`) => ({ type: 'capture', version: chapterVersion(value, kind, '', at, id) });
const empty = () => ({ version: 1, versions: [] });
const memoryAdapter = () => {
  let data;
  return { read: async () => data ? structuredClone(data) : undefined, write: async next => { data = structuredClone(next); }, peek: () => data };
};

test('continuous edits preserve the first baseline and latest pre-edit text while coalescing within a minute', () => {
  let data = applyHistoryOperation(empty(), capture(chapter('起始'), 'automatic', 1));
  data = applyHistoryOperation(data, capture(chapter('中间'), 'automatic', 2));
  data = applyHistoryOperation(data, capture(chapter('最新修改前'), 'automatic', 3));
  assert.equal(data.versions.length, 2);
  assert.deepEqual(data.versions.map(row => row.content), ['起始', '最新修改前']);
  assert.equal(data.versions[0].baseline, true);
  data = applyHistoryOperation(data, capture(chapter('一分钟之后'), 'automatic', 60_004));
  assert.equal(data.versions.length, 3);
  const repeated = applyHistoryOperation(data, capture(chapter('一分钟之后'), 'automatic', 60_005));
  assert.equal(repeated.versions.length, 3);
});

test('manual, restore and delete checkpoints bypass automatic coalescing and automatic duplicate captures', () => {
  let data = empty();
  for (const [index, kind] of ['automatic', 'manual', 'before-restore', 'before-delete'].entries()) data = applyHistoryOperation(data, capture(chapter(), kind, index + 1));
  assert.equal(data.versions.length, 4);
  assert.deepEqual(data.versions.map(row => row.kind), ['automatic', 'manual', 'before-restore', 'before-delete']);
  assert.equal(applyHistoryOperation(data, capture(chapter(), 'automatic', 6)).versions.length, 4);
});

test('retention remains per chapter, keeps the original baseline, and first prunes automatic snapshots', () => {
  let data = empty();
  for (let i = 0; i < 70; i++) data = applyHistoryOperation(data, capture(chapter(`内容-${i}`), i === 2 ? 'manual' : 'automatic', i * 60_001 + 1));
  assert.equal(data.versions.length, CHAPTER_HISTORY_LIMIT);
  assert.ok(data.versions.some(row => row.baseline && row.content === '内容-0'));
  assert.ok(data.versions.some(row => row.kind === 'manual' && row.content === '内容-2'));
  data = applyHistoryOperation(data, capture(chapter('其他章节', { id: 'c2' }), 'manual', 5000000));
  assert.equal(data.versions.length, CHAPTER_HISTORY_LIMIT + 1);
});

test('chapter and novel remapping preserves snapshots without touching a different book or character', () => {
  let data = applyHistoryOperation(empty(), capture(chapter(), 'manual', 1));
  data = applyHistoryOperation(data, capture(chapter('另一本', { novelId: 'n2' }), 'manual', 2));
  data = applyHistoryOperation(data, { type: 'remap', novelId: 'n1', chapterId: 'c1', nextId: 'server-c1' });
  assert.equal(data.versions.find(row => row.novelId === 'n1').chapterId, 'server-c1');
  assert.equal(data.versions.find(row => row.novelId === 'n2').chapterId, 'c1');
  data = applyHistoryOperation(data, { type: 'remap-novel', novelId: 'n1', nextId: 'server-n1' });
  assert.ok(data.versions.some(row => row.novelId === 'server-n1' && row.chapterId === 'server-c1'));
  assert.ok(data.versions.some(row => row.novelId === 'n2'));
});

test('ordered diff detects a paragraph move, repeated lines, and bounded large rewrites', () => {
  const moved = chapterHistoryDiff('甲\n乙', '乙\n甲');
  assert.equal(moved.added.length, 1); assert.equal(moved.removed.length, 1);
  assert.deepEqual(chapterHistoryDiff('甲\n甲\n乙', '甲\n乙\n新增').added, ['新增']);
  assert.equal(chapterHistoryDiff(Array(1000).fill('旧').join('\n'), Array(1000).fill('新').join('\n')).removed.length, 1000);
  assert.equal(chapterVersionFingerprint(chapter('正文')), chapterVersionFingerprint({ title: '开端', content: '正文' }));
  assert.notEqual(chapterVersionFingerprint(chapter('正文')), chapterVersionFingerprint(chapter('另一段')));
});

test('history load only accepts allowlisted snapshot data and never invents a version', () => {
  const raw = { version: 1, versions: [{ ...chapterVersion(chapter(), 'manual', '检查点', 1, 'v1'), apiKey: 'never-export', request: { body: 'private' } }] };
  const parsed = readChapterHistory(raw);
  assert.equal(JSON.stringify(parsed).includes('never-export'), false);
  assert.equal(parsed.versions[0].label, '检查点');
  assert.deepEqual(readChapterHistory(empty()), empty());
  assert.throws(() => readChapterHistory({ version: 2, versions: [] }));
  assert.throws(() => readChapterHistory({ version: 1, versions: [{ id: 'invalid' }] }));
});

test('edits during asynchronous initial load merge into existing history and snapshots are immutable', async () => {
  let release;
  const saved = applyHistoryOperation(empty(), capture(chapter('旧历史'), 'manual', 1));
  const adapter = memoryAdapter();
  await adapter.write(saved);
  let first = true;
  const store = createChapterHistoryStore('load-test', { read: () => first ? (first = false, new Promise(resolve => { release = () => resolve(adapter.peek()); })) : adapter.read(), write: adapter.write }, () => 5);
  const original = chapter('修改前');
  const pending = store.getState().capture(original);
  original.content = '外部对象已被改写';
  release(); await pending;
  assert.deepEqual(store.getState().versions.map(row => row.content), ['旧历史', '修改前']);
  assert.equal(store.getState().saving, false);
});

test('a failed write retains unsaved snapshots visibly and retry persists them without duplicating', async () => {
  const adapter = memoryAdapter(); let fail = true;
  const store = createChapterHistoryStore('quota-test', { read: adapter.read, write: async data => { if (fail) throw new Error('测试：空间不足'); await adapter.write(data); } });
  await assert.rejects(store.getState().capture(chapter(), 'manual', '待保存'), /空间不足/);
  assert.equal(store.getState().versions.length, 1); assert.match(store.getState().error, /空间不足/); assert.equal(store.getState().saving, false);
  fail = false; await store.getState().retry();
  assert.equal(adapter.peek().versions.length, 1); assert.equal(store.getState().error, '');
  await store.getState().flush(); assert.equal(adapter.peek().versions.length, 1);
});

test('unreadable history is not overwritten by a new automatic edit and the UI exits saving state', async () => {
  let writes = 0;
  const store = createChapterHistoryStore('corrupt-test', { read: async () => ({ version: 9, versions: [] }), write: async () => { writes++; } });
  await assert.rejects(store.getState().capture(chapter()), /无法读取/);
  assert.equal(writes, 0); assert.equal(store.getState().versions.length, 1); assert.equal(store.getState().saving, false);
});

test('retry of an unreadable empty history rechecks storage instead of falsely reporting a save', async () => {
  let corrupt = true;
  const store = createChapterHistoryStore('empty-corrupt-test', { read: async () => corrupt ? { version: 9, versions: [] } : empty(), write: async () => { throw new Error('should not write'); } });
  await assert.rejects(store.getState().retry(), /无法读取/);
  assert.match(store.getState().error, /无法读取/);
  corrupt = false; await store.getState().retry();
  assert.equal(store.getState().error, ''); assert.deepEqual(store.getState().versions, []);
});

test('queued remapping after an edit reaches durable data and another namespace remains isolated', async () => {
  const one = memoryAdapter(), two = memoryAdapter();
  const a = createChapterHistoryStore('a', one), b = createChapterHistoryStore('b', two);
  const saving = a.getState().capture(chapter(), 'manual');
  const mapping = a.getState().remapChapter('n1', 'c1', 'server-c1');
  await Promise.all([saving, mapping]); await b.getState().flush();
  assert.equal(one.peek().versions[0].chapterId, 'server-c1');
  assert.deepEqual(b.getState().versions, []); assert.equal(two.peek(), undefined);
});

test('over-cap deletion checkpoints remain exportable even when persistence refuses the soft limit', async () => {
  const adapter = memoryAdapter();
  const store = createChapterHistoryStore('capacity-test', adapter);
  const body = '字'.repeat(30_000_001);
  await assert.rejects(store.getState().capture(chapter(body), 'before-delete', '删除前'), /上限/);
  assert.equal(store.getState().versions[0].content.length, body.length);
  assert.equal(store.getState().versions[0].kind, 'before-delete');
  assert.match(store.getState().error, /上限/); assert.equal(store.getState().saving, false);
  assert.equal(adapter.peek(), undefined);
});

test('central chapter changes and deletion retain pre-edit snapshots, while hydration and metadata-only changes do not', async () => {
  globalThis.window = browserStub;
  const { useNovelStore } = await import('../src/stores/novelStore.ts');
  delete globalThis.window;
  const { getChapterHistoryStore } = await import('../src/stores/chapterHistoryStore.ts');
  const now = Date.now();
  useNovelStore.getState().clearAll();
  useNovelStore.getState().setNovels([{ id: 'central-novel', title: '测试作品', wordCount: 2, status: 'draft', createdAt: now, updatedAt: now }]);
  const before = chapter('最早的正文', { id: 'central-chapter', novelId: 'central-novel' });
  useNovelStore.getState().setChapters([before]);
  const history = getChapterHistoryStore();
  await history.getState().flush();
  assert.equal(history.getState().versions.filter(row => row.novelId === 'central-novel').length, 0);
  useNovelStore.getState().updateChapter(before.id, { sequence: 2 });
  await history.getState().flush();
  assert.equal(history.getState().versions.filter(row => row.novelId === 'central-novel').length, 0);
  useNovelStore.getState().updateChapter(before.id, { content: '新的正文', wordCount: 4 });
  useNovelStore.getState().updateChapter(before.id, { title: '新标题' });
  useNovelStore.getState().deleteChapter(before.id);
  await history.getState().flush();
  const rows = history.getState().versions.filter(row => row.novelId === 'central-novel');
  assert.ok(rows.some(row => row.baseline && row.content === before.content));
  assert.ok(rows.some(row => row.kind === 'before-delete' && row.content === '新的正文' && row.title === '新标题'));
  assert.equal(useNovelStore.getState().chapters.length, 0);
});
