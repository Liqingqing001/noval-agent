import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsistencyWorkspace } from '../src/stores/consistencyStore.ts';

const clone = value => value === undefined ? undefined : structuredClone(value);
const issue = (id = 'i1', origin = 'local') => ({ id, origin, category: 'structure', severity: 'warning', title: '核对关联', detail: '有一处需要复核', suggestion: '手工核对', chapterIds: [], characterIds: [], evidence: [], verified: true });
const run = (novelId = 'n1', overrides = {}) => ({ version: 1, novelId, fingerprint: 'source-1', modelKey: 'model-1', status: 'running', batches: {}, comparisonBatches: {}, issues: [], completedBatches: 0, totalBatches: 1, updatedAt: 1, limitations: ['需人工复核'], ...overrides });
const report = (novelId, overrides = {}) => ({ novelId, fingerprint: 'source-1', checkedAt: 1, localIssues: [], dispositions: {}, ...overrides });
function memory(initial) {
  const data = new Map(), writes = [];
  if (initial !== undefined) data.set('test', clone(initial));
  let failure = false, queue = Promise.resolve();
  const adapter = {
    read: async key => clone(data.get(key)),
    write: async (key, value) => { if (failure) throw new Error('模拟：空间不足'); data.set(key, clone(value)); writes.push(key); },
    update: (key, apply) => {
      const next = queue.catch(() => {}).then(async () => { const value = apply(clone(data.get(key))); await adapter.write(key, value); return clone(value); });
      queue = next; return next;
    },
    peek: (key = 'test') => clone(data.get(key)),
    seed: (value, key = 'test') => data.set(key, clone(value)),
    fail: value => { failure = value; }, writes,
  };
  return adapter;
}
const open = (persistence, extra = {}) => createConsistencyWorkspace('test', { persistence, key: 'test', cache: false, ...extra });

test('reports preserve local issues, review dispositions and AI progress without crossing books', async () => {
  const adapter = memory(), store = open(adapter);
  await store.getState().flush();
  await store.getState().saveLocal('n1', 'source-1', [issue()]);
  await store.getState().setDisposition('n1', 'i1', 'ignored');
  await store.getState().saveRun('n1', run());
  assert.equal(store.getState().reports.n1.dispositions.i1, 'ignored');
  assert.equal(store.getState().reports.n1.run.status, 'running');
  await store.getState().saveLocal('n2', 'source-2', []);
  await store.getState().clearReport('n2');
  assert.deepEqual(Object.keys(adapter.peek().reports), ['n1']);
  await assert.rejects(store.getState().saveRun('n2', run('n1')), /不属于/);
  await store.getState().saveLocal('n1', 'new-source', [issue()]);
  assert.deepEqual(store.getState().reports.n1.dispositions, {});
});

test('two independently opened stores atomically retain separate books and same-book dispositions', async () => {
  const adapter = memory(), first = open(adapter), second = open(adapter);
  await Promise.all([first.getState().flush(), second.getState().flush()]);
  await Promise.all([first.getState().saveLocal('n1', 's1', [issue('a')]), second.getState().saveLocal('n2', 's2', [issue('b')])]);
  assert.deepEqual(Object.keys(adapter.peek().reports).sort(), ['n1', 'n2']);
  await first.getState().setDisposition('n1', 'a', 'resolved');
  await second.getState().saveRun('n1', run('n1'));
  assert.equal(adapter.peek().reports.n1.dispositions.a, 'resolved');
  assert.equal(adapter.peek().reports.n2.localIssues[0].id, 'b');
});

test('fallback read/write adapters serialize semantic merges instead of overwriting another open store', async () => {
  const shared = memory();
  const adapter = { read: async key => { await new Promise(resolve => setTimeout(resolve, 2)); return shared.read(key); }, write: shared.write };
  const first = open(adapter), second = open(adapter);
  await Promise.all([first.getState().flush(), second.getState().flush()]);
  await Promise.all([first.getState().saveLocal('n1', 's1', []), second.getState().saveLocal('n2', 's2', [])]);
  assert.deepEqual(Object.keys(shared.peek().reports).sort(), ['n1', 'n2']);
});

test('a stale review cannot resurrect another tab cleared report or poison later writes', async () => {
  const adapter = memory({ version: 1, reports: { n1: report('n1', { localIssues: [issue()] }) } });
  const first = open(adapter), second = open(adapter);
  await Promise.all([first.getState().flush(), second.getState().flush()]);
  await second.getState().clearReport('n1');
  await first.getState().setDisposition('n1', 'i1', 'ignored');
  assert.equal(first.getState().reports.n1, undefined);
  await first.getState().saveLocal('n2', 's2', []);
  assert.deepEqual(Object.keys(adapter.peek().reports), ['n2']);
});

test('failed writes retain paid results in memory and retry merges with newer reports from another tab', async () => {
  const adapter = memory(), first = open(adapter), second = open(adapter);
  await Promise.all([first.getState().flush(), second.getState().flush()]);
  adapter.fail(true);
  await assert.rejects(first.getState().saveRun('n1', run('n1', { issues: [issue('paid', 'ai')] })), /空间不足/);
  assert.equal(first.getState().reports.n1.run.issues[0].id, 'paid');
  assert.equal(first.getState().saving, false);
  assert.match(first.getState().error, /空间不足/);
  adapter.fail(false);
  await second.getState().saveLocal('n2', 's2', []);
  await first.getState().retrySave();
  assert.deepEqual(Object.keys(adapter.peek().reports).sort(), ['n1', 'n2']);
  assert.equal(adapter.peek().reports.n1.run.issues.length, 1);
  assert.equal(first.getState().error, '');
});

test('capacity failures keep a newly generated report exportable and clearing an old report permits retry', async () => {
  const reports = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`n${index}`, report(`n${index}`)]));
  const adapter = memory({ version: 1, reports }), store = open(adapter);
  await store.getState().flush();
  await assert.rejects(store.getState().saveRun('new-book', run('new-book')), /容量上限/);
  assert.equal(store.getState().reports['new-book'].run.novelId, 'new-book');
  assert.equal(Object.keys(store.getState().reports).length, 21);
  assert.equal(Object.keys(adapter.peek().reports).length, 20);
  assert.match(store.getState().error, /新结果仍保留/);
  await store.getState().clearReport('n0');
  assert.equal(Object.keys(adapter.peek().reports).length, 20);
  assert.ok(adapter.peek().reports['new-book']);
  assert.equal(adapter.peek().reports.n0, undefined);
});

test('initial recovery marks interrupted work locally without corrupting another tab active run on ordinary writes', async () => {
  const adapter = memory({ version: 1, reports: { n1: report('n1', { run: run() }) } }), store = open(adapter);
  await store.getState().flush();
  assert.equal(store.getState().reports.n1.run.status, 'failed');
  assert.match(store.getState().reports.n1.run.lastAttempt.error, /刷新/);
  assert.equal(adapter.writes.length, 0);
  await store.getState().saveLocal('n2', 's2', []);
  assert.equal(adapter.peek().reports.n1.run.status, 'running');
});

test('unreadable data is never overwritten implicitly, and transient read errors recover without a reset', async () => {
  const adapter = memory({ version: 9, reports: {} }), store = open(adapter);
  await store.getState().flush();
  assert.equal(store.getState().unreadable, true);
  await assert.rejects(store.getState().saveLocal('n1', 's1', []), /无法读取/);
  assert.equal(adapter.writes.length, 0);
  adapter.seed({ version: 1, reports: { recovered: report('recovered') } });
  await store.getState().retrySave();
  assert.equal(store.getState().unreadable, false);
  assert.ok(store.getState().reports.recovered);
  assert.equal(adapter.writes.length, 0);
});

test('explicit unreadable reset clears corrupt storage but retains valid data concurrently recovered elsewhere', async () => {
  const adapter = memory({ version: 9, reports: {} }), store = open(adapter);
  await store.getState().flush();
  await store.getState().resetUnreadable();
  assert.deepEqual(Object.keys(adapter.peek().reports), []);
  const other = open(adapter); await other.getState().flush();
  adapter.seed({ version: 9, reports: {} });
  const unreadable = open(adapter); await unreadable.getState().flush();
  adapter.seed({ version: 1, reports: { valid: report('valid') } });
  await unreadable.getState().resetUnreadable();
  assert.ok(adapter.peek().reports.valid);
});

test('persisted cache rejects forged local-origin AI issues and malformed facts, and strips unrelated metadata', async () => {
  for (const badRun of [run('n1', { issues: [issue()] }), run('n1', { batches: { b: { reviewedSegmentIds: ['s'], issues: [], facts: [null] } } })]) {
    const adapter = memory({ version: 1, reports: { n1: report('n1', { run: badRun }) } }), store = open(adapter);
    await store.getState().flush();
    assert.equal(store.getState().unreadable, true);
    assert.equal(adapter.writes.length, 0);
  }
  const adapter = memory({ version: 1, reports: { n1: { ...report('n1', { localIssues: [{ ...issue(), apiKey: 'private-value' }] }), headers: { secret: 'private-value' } } } }), store = open(adapter);
  await store.getState().flush();
  assert.equal(JSON.stringify(store.getState().reports).includes('private-value'), false);
});

test('namespace keys isolate reports and browser storage absence cannot claim durable success', async () => {
  const adapter = memory(), first = createConsistencyWorkspace('account-a', { persistence: adapter }), second = createConsistencyWorkspace('account-b', { persistence: adapter });
  await first.getState().saveLocal('n1', 's1', []);
  await second.getState().flush();
  assert.deepEqual(Object.keys(second.getState().reports), []);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    delete globalThis.localStorage;
    const store = createConsistencyWorkspace('browser-no-storage', { key: 'browser-no-storage', cache: false });
    await store.getState().flush();
    assert.equal(store.getState().unreadable, true);
    await assert.rejects(store.getState().saveLocal('n1', 's1', []), /存储权限/);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else delete globalThis.localStorage;
  }
});
