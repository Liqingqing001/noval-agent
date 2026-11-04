import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageStore } from '../src/stores/usageStore.ts';
import { estimateTextTokens, countOutputCharacters, usageCost, usagePeriodKeys, usageSummary } from '../src/lib/modelUsage.ts';

class MemoryStorage {
  values = new Map(); fail = false;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw new Error('PRIVATE quota details'); this.values.set(key, value); }
}
const input = { provider: 'custom', protocol: 'openai', model: 'test-model', operation: '续写章节', estimatedInputTokens: 100, outputTokenLimit: 500 };
const price = { provider: 'custom', protocol: 'openai', model: 'test-model', currency: 'CNY', inputPerMillion: 1000, outputPerMillion: 1000 };
function fixture(extra = {}) {
  const storage = extra.storage || new MemoryStorage();
  let at = new Date(2026, 10, 4, 12).getTime(), id = 0;
  const store = createUsageStore({ storage, key: 'usage-test', now: () => at, id: () => `call-${++id}`, ownerId: 'tab-a', ...extra });
  return { store, storage, state: () => store.getState(), at: () => at, advance: milliseconds => { at += milliseconds; } };
}
async function settle(f, overrides = {}, outcome = {}) {
  const call = await f.state().beginCall({ ...input, ...overrides });
  assert.equal(call.blockedReason, undefined);
  await f.state().updateCall(call.id, { dispatched: true });
  await f.state().finishCall(call.id, { status: 'succeeded', usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 }, outputCharacters: 80, usageSource: 'reported', ...outcome });
  return f.state().records.find(row => row.id === call.id);
}

test('default tracking is opt-in budgeting, unknown prices remain unknown, and fallback counts are labelled estimates', async () => {
  const f = fixture();
  assert.equal(f.state().budget.mode, 'off');
  const row = await settle(f);
  assert.equal(row.cost, undefined);
  assert.equal(row.usageSource, 'reported');
  assert.equal(usageSummary(f.state(), f.at()).month.unknownCostCalls, 1);
  assert.equal(usageSummary(f.state(), f.at()).month.outputCharacters, 80);
  assert.ok(estimateTextTokens('中文abcd') > estimateTextTokens('abcd'));
  assert.equal(countOutputCharacters('你 好🙂\n'), 3);
});

test('parallel reservations enforce the monthly ceiling, then final usage refunds unused reservation exactly once', async () => {
  const f = fixture();
  await f.state().savePrice(price);
  await f.state().saveBudget({ mode: 'block', monthlyLimit: 1 });
  const results = await Promise.all([f.state().beginCall(input), f.state().beginCall(input)]);
  assert.equal(results.filter(call => call.blockedReason).length, 1);
  const accepted = results.find(call => !call.blockedReason);
  assert.equal(usageSummary(f.state(), f.at()).active.reservedCost, 0.6);
  await f.state().updateCall(accepted.id, { dispatched: true });
  const outcome = { status: 'succeeded', usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 }, usageSource: 'reported' };
  await f.state().finishCall(accepted.id, outcome);
  await f.state().finishCall(accepted.id, outcome);
  assert.equal(usageSummary(f.state(), f.at()).month.calls, 1);
  assert.equal(usageSummary(f.state(), f.at()).month.cost, 0.2);
  const next = await f.state().beginCall(input);
  assert.equal(next.blockedReason, undefined);
  assert.match(next.warning, /80%/);
});

test('unknown price/output cap is blocked before dispatch; warn mode allows an explicit warning and per-call ceilings apply', async () => {
  const f = fixture();
  await f.state().saveBudget({ mode: 'block', perCallLimit: 0.5 });
  const unknown = await f.state().beginCall(input);
  assert.ok(unknown.blockedReason);
  assert.equal(f.state().records[0].dispatched, false);
  assert.equal(f.state().records[0].cost, 0);
  await f.state().savePrice(price);
  const over = await f.state().beginCall(input);
  assert.match(over.blockedReason, /单次/);
  const missingCap = await f.state().beginCall({ ...input, outputTokenLimit: undefined });
  assert.ok(missingCap.blockedReason);
  await f.state().saveBudget({ mode: 'warn' });
  const warned = await f.state().beginCall(input);
  assert.equal(warned.blockedReason, undefined);
  assert.match(warned.warning, /单次/);
  await assert.rejects(f.state().saveBudget({ monthlyLimit: undefined, perCallLimit: undefined }), /至少/);
});

test('rates are frozen per call, explicit zero is valid, and currencies have separate prices and aggregates', async () => {
  const f = fixture();
  await f.state().savePrice(price);
  const call = await f.state().beginCall(input);
  await f.state().savePrice({ ...price, inputPerMillion: 9000, outputPerMillion: 9000 });
  await f.state().updateCall(call.id, { dispatched: true });
  await f.state().finishCall(call.id, { status: 'succeeded', usage: { inputTokens: 100, outputTokens: 100 }, usageSource: 'reported' });
  assert.equal(f.state().records[0].cost, 0.2);
  assert.equal(f.state().records[0].price.inputPerMillion, 1000);
  await f.state().saveBudget({ currency: 'USD' });
  await f.state().savePrice({ ...price, currency: 'USD', inputPerMillion: 0, outputPerMillion: 0 });
  const free = await settle(f);
  assert.equal(free.cost, 0);
  assert.equal(usageSummary(f.state(), f.at(), 'USD').month.calls, 1);
  assert.equal(usageSummary(f.state(), f.at(), 'USD').month.unknownCostCalls, 0);
  assert.equal(usageSummary(f.state(), f.at(), 'CNY').month.cost, 0.2);
  assert.equal(usageCost({ inputTokens: 1, outputTokens: 1 }), undefined);
});

test('retention and history clear preserve spending totals; statistics reset is explicit and retains the history', async () => {
  const f = fixture({ recordLimit: 2 });
  await f.state().savePrice(price);
  await settle(f); await settle(f); await settle(f);
  assert.equal(f.state().records.length, 2);
  assert.equal(usageSummary(f.state(), f.at()).month.calls, 3);
  await f.state().clearRecords();
  assert.equal(f.state().records.length, 0);
  assert.ok(Math.abs(usageSummary(f.state(), f.at()).month.cost - 0.6) < 1e-10);
  await f.state().saveBudget({ mode: 'block', monthlyLimit: 1 });
  assert.ok((await f.state().beginCall(input)).blockedReason);
  await f.state().resetStatistics();
  assert.equal(f.state().records.length, 1);
  assert.equal(usageSummary(f.state(), f.at()).month.calls, 0);
  const active = await f.state().beginCall(input);
  assert.equal(active.blockedReason, undefined);
  await assert.rejects(f.state().resetStatistics(), /执行中/);
});

test('local calendar day/month buckets change independently and calls spanning midnight belong to their start period', async () => {
  let at = new Date(2026, 0, 31, 23, 59).getTime();
  const f = fixture({ now: () => at });
  await f.state().savePrice(price);
  const call = await f.state().beginCall(input);
  await f.state().updateCall(call.id, { dispatched: true });
  at += 120_000;
  await f.state().finishCall(call.id, { status: 'succeeded', usage: { inputTokens: 100, outputTokens: 100 }, usageSource: 'reported' });
  assert.equal(usageSummary(f.state(), at).month.calls, 0);
  const old = usagePeriodKeys(at - 120_000, 'CNY');
  assert.equal(f.state().periods[old.month].calls, 1);
  assert.equal(f.state().periods[old.day].calls, 1);
  assert.equal(usagePeriodKeys(at, 'CNY').month, 'CNY:month:2026-02');
});

test('failed persistence prevents a reservation or dispatch marker from becoming a phantom paid call', async () => {
  const f = fixture();
  f.storage.fail = true;
  await assert.rejects(f.state().beginCall(input), /保存失败/);
  assert.equal(f.state().records.some(row => row.status === 'running'), false);
  assert.equal(usageSummary(f.state(), f.at()).active.calls, 0);
  assert.ok(f.state().storageError);
  assert.equal(JSON.stringify(f.state()).includes('PRIVATE'), false);
  f.storage.fail = false;
  await f.state().retryPersistence();
  const call = await f.state().beginCall(input);
  f.storage.fail = true;
  await assert.rejects(f.state().updateCall(call.id, { dispatched: true }), /保存失败/);
  assert.equal(f.state().records.find(row => row.id === call.id).dispatched, false);
  f.storage.fail = false;
  await f.state().finishCall(call.id, { status: 'failed', dispatched: false });
  assert.equal(usageSummary(f.state(), f.at()).month.calls, 0);
});

test('an abort before actual fetch overrides the durable marker and releases all budget', async () => {
  const f = fixture();
  await f.state().savePrice(price);
  const call = await f.state().beginCall(input);
  await f.state().updateCall(call.id, { dispatched: true });
  await f.state().finishCall(call.id, { status: 'cancelled', dispatched: false, usage: { inputTokens: 100, outputTokens: 100 }, errorCode: 'cancelled' });
  assert.equal(f.state().records[0].cost, 0);
  assert.equal(f.state().records[0].totalTokens, 0);
  assert.equal(usageSummary(f.state(), f.at()).month.calls, 0);
});

test('reload recovery preserves a conservative uncertain cost exactly once and keeps other tabs live', async () => {
  const f = fixture();
  await f.state().savePrice(price);
  const call = await f.state().beginCall(input);
  await f.state().updateCall(call.id, { dispatched: true });
  const otherTab = createUsageStore({ storage: f.storage, key: 'usage-test', ownerId: 'tab-b', now: f.at });
  await otherTab.getState().retryPersistence();
  assert.equal(otherTab.getState().records[0].status, 'running');
  const reload = createUsageStore({ storage: f.storage, key: 'usage-test', ownerId: 'tab-a', now: f.at });
  await reload.getState().retryPersistence();
  assert.equal(reload.getState().records[0].status, 'interrupted');
  assert.equal(reload.getState().records[0].cost, 0.6);
  assert.equal(reload.getState().records[0].usageSource, 'estimated');
  assert.equal(usageSummary(reload.getState(), f.at()).month.calls, 1);
  const again = createUsageStore({ storage: f.storage, key: 'usage-test', ownerId: 'tab-a', now: f.at });
  await again.getState().retryPersistence();
  assert.equal(usageSummary(again.getState(), f.at()).month.calls, 1);
  await again.getState().saveBudget({ mode: 'block', monthlyLimit: 1 });
  assert.ok((await again.getState().beginCall(input)).blockedReason);
});

test('failed final persistence keeps received usage available for retry rather than forgetting a paid result', async () => {
  const f = fixture();
  await f.state().savePrice(price);
  const call = await f.state().beginCall(input);
  await f.state().updateCall(call.id, { dispatched: true });
  f.storage.fail = true;
  await assert.rejects(f.state().finishCall(call.id, { status: 'succeeded', usage: { inputTokens: 100, outputTokens: 200 }, usageSource: 'reported' }));
  assert.equal(f.state().records[0].status, 'succeeded');
  assert.equal(usageSummary(f.state(), f.at()).month.cost, 0.3);
  f.storage.fail = false;
  await f.state().retryPersistence();
  const loaded = createUsageStore({ storage: f.storage, key: 'usage-test', ownerId: 'tab-b', now: f.at });
  assert.equal(usageSummary(loaded.getState(), f.at()).month.cost, 0.3);
});

test('metadata is rebuilt through a whitelist both on input and when reading edited storage', async () => {
  const f = fixture();
  await settle(f, { apiKey: 'PRIVATE', baseUrl: 'PRIVATE', prompt: 'PRIVATE', operation: 'PRIVATE', context: { novelId: 'novel-1', sessionId: 'PRIVATE URL https://private', body: 'PRIVATE' } });
  assert.equal(JSON.stringify(f.state()).includes('PRIVATE'), false);
  const raw = JSON.parse(f.storage.getItem('usage-test'));
  raw.state.apiKey = 'PRIVATE'; raw.state.records[0].prompt = 'PRIVATE'; raw.state.records[0].headers = { Authorization: 'PRIVATE' };
  raw.state.records[0].warning = 'PRIVATE'; raw.state.records[0].errorCode = 'PRIVATE';
  raw.state.records[0].context.prompt = 'PRIVATE'; raw.state.budget.secret = 'PRIVATE';
  f.storage.setItem('usage-test', JSON.stringify(raw));
  const loaded = createUsageStore({ storage: f.storage, key: 'usage-test', ownerId: 'tab-b', now: f.at });
  assert.equal(JSON.stringify(loaded.getState()).includes('PRIVATE'), false);
  assert.deepEqual(loaded.getState().records[0].context, { novelId: 'novel-1' });
});

test('unreadable storage blocks calls until an explicit recovery, and memory-only Node usage remains available', async () => {
  const storage = new MemoryStorage(); storage.setItem('usage-test', 'broken');
  const f = fixture({ storage });
  await assert.rejects(f.state().beginCall(input), /读取/);
  assert.equal(storage.getItem('usage-test'), 'broken');
  await f.state().clearRecords();
  assert.equal((await f.state().beginCall(input)).blockedReason, undefined);
  const memory = createUsageStore({ storage: null });
  assert.equal((await memory.getState().beginCall(input)).blockedReason, undefined);
});

test('a previously unknown paid call cannot become fake-free when a price is configured later', async () => {
  const f = fixture();
  await settle(f);
  await f.state().savePrice(price);
  await f.state().saveBudget({ mode: 'block', monthlyLimit: 1 });
  assert.ok((await f.state().beginCall(input)).blockedReason);
  await f.state().clearRecords();
  assert.ok((await f.state().beginCall(input)).blockedReason);
  await f.state().resetStatistics();
  assert.equal((await f.state().beginCall(input)).blockedReason, undefined);
});

test('two browser tabs share locked reservations and reload recovery re-reads a concurrent settlement', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let queue = Promise.resolve(), lockCalls = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request(_key, callback) { lockCalls++; const next = queue.then(callback); queue = next.catch(() => {}); return next; },
  } } });
  try {
    const f = fixture();
    await f.state().savePrice(price);
    await f.state().saveBudget({ mode: 'block', monthlyLimit: 1 });
    let id = 0;
    const b = createUsageStore({ storage: f.storage, key: 'usage-test', now: f.at, ownerId: 'tab-b', id: () => `other-${++id}` });
    const calls = await Promise.all([f.state().beginCall(input), b.getState().beginCall(input)]);
    assert.equal(calls.filter(call => call.blockedReason).length, 1);
    const accepted = calls.find(call => !call.blockedReason);
    await f.state().updateCall(accepted.id, { dispatched: true });
    const finishing = f.state().finishCall(accepted.id, { status: 'succeeded', usage: { inputTokens: 100, outputTokens: 100 }, usageSource: 'reported' });
    // At construction storage still contains running; recovery must acquire the
    // shared lock and re-read after the already queued final settlement.
    const reload = createUsageStore({ storage: f.storage, key: 'usage-test', now: f.at, ownerId: 'tab-a' });
    await Promise.all([finishing, reload.getState().retryPersistence()]);
    assert.equal(reload.getState().records.find(row => row.id === accepted.id).status, 'succeeded');
    assert.equal(usageSummary(reload.getState(), f.at()).month.calls, 1);
    assert.equal(usageSummary(reload.getState(), f.at()).month.cost, 0.2);
    assert.ok(lockCalls >= 7);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});
