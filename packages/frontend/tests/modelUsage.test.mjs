import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig } from '../src/lib/modelConfig.ts';
import { countOutputCharacters, estimateTextTokens, usageSummary } from '../src/lib/modelUsage.ts';
import { createUsageStore } from '../src/stores/usageStore.ts';
import { ModelService } from '../src/services/modelService.ts';

const config = (overrides = {}) => ({ ...createDefaultConfig('custom'), baseUrl: 'https://private.example/v1?api-version=private-query', model: 'usage-model', apiKey: 'private-api-key', ...overrides });
const messages = [{ role: 'system', content: 'PRIVATE SYSTEM TEXT' }, { role: 'user', content: 'PRIVATE NOVEL TEXT' }];
const visible = '你 好🙂\n';
const sse = value => `data: ${JSON.stringify(value)}\n\n`;
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const stream = events => new Response(new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode(events)); controller.close();
} }), { headers: { 'content-type': 'text/event-stream' } });
const ledger = () => createUsageStore({ storage: null });
const onlyRecord = store => { assert.equal(store.getState().records.length, 1); return store.getState().records[0]; };
const assertUsage = (store, input = 12, output = 7, status = 'succeeded') => {
  const row = onlyRecord(store);
  assert.equal(row.status, status);
  assert.equal(row.usageSource, 'reported');
  assert.equal(row.inputTokens, input); assert.equal(row.outputTokens, output); assert.equal(row.totalTokens, input + output);
  assert.equal(row.outputCharacters, countOutputCharacters(visible));
  assert.equal(row.reservedCost, undefined);
  assert.equal(usageSummary(store.getState()).month.calls, 1);
  return row;
};

const fixtures = {
  openai: {
    json: { choices: [{ message: { content: visible } }], usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19, completion_tokens_details: { reasoning_tokens: 5 } } },
    stream: sse({ choices: [{ delta: { reasoning_content: 'PRIVATE REASONING' } }] }) + sse({ choices: [{ delta: { content: visible }, finish_reason: 'stop' }] }) +
      sse({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19, completion_tokens_details: { reasoning_tokens: 5 } } }) + 'data: [DONE]\n\n',
  },
  responses: {
    json: { status: 'completed', output_text: visible, usage: { input_tokens: 12, output_tokens: 7, total_tokens: 19, output_tokens_details: { reasoning_tokens: 5 } } },
    stream: sse({ type: 'response.reasoning_summary_text.delta', delta: 'PRIVATE REASONING' }) + sse({ type: 'response.output_text.delta', delta: visible }) +
      sse({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 12, output_tokens: 7, total_tokens: 19, output_tokens_details: { reasoning_tokens: 5 } } } }),
  },
  anthropic: {
    json: { content: [{ type: 'thinking', thinking: 'PRIVATE REASONING' }, { type: 'text', text: visible }], usage: { input_tokens: 3, cache_creation_input_tokens: 4, cache_read_input_tokens: 5, output_tokens: 7 } },
    stream: sse({ type: 'message_start', message: { usage: { input_tokens: 3, cache_creation_input_tokens: 4, cache_read_input_tokens: 5, output_tokens: 1 } } }) +
      sse({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'PRIVATE REASONING' } }) +
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: visible } }) +
      sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }) +
      sse({ type: 'message_delta', usage: { output_tokens: 7 } }) + sse({ type: 'message_stop' }),
  },
  gemini: {
    json: { candidates: [{ content: { parts: [{ thought: true, text: 'PRIVATE REASONING' }, { text: visible }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, thoughtsTokenCount: 3, totalTokenCount: 19 } },
    stream: sse({ candidates: [{ content: { parts: [{ thought: true, text: 'PRIVATE REASONING' }] } }] }) +
      sse({ candidates: [{ content: { parts: [{ text: visible }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, thoughtsTokenCount: 3, totalTokenCount: 19 } }),
  },
};

for (const [protocol, fixture] of Object.entries(fixtures)) {
  for (const streaming of [false, true]) test(`${protocol}: ${streaming ? 'stream' : 'JSON'} settles provider usage exactly once`, async t => {
    const store = ledger();
    let fetches = 0, finishes = 0;
    const adapter = { getState: () => ({ ...store.getState(), finishCall: async (...args) => { finishes++; await store.getState().finishCall(...args); } }) };
    t.mock.method(globalThis, 'fetch', async () => { fetches++; return streaming ? stream(fixture.stream) : json(fixture.json); });
    const ids = [], chunks = [];
    const result = await new ModelService(config({ protocol, stream: streaming }), adapter).generate({ messages,
      usageContext: { operation: '续写章节', novelId: 'novel-1', sessionId: 'session-1', sourceId: 'chapter-1', retryOf: 'prior-call' },
      onCallId: id => ids.push(id), onStream: content => chunks.push(content) });
    assert.equal(result, visible); assert.equal(chunks.at(-1), visible);
    assert.equal(fetches, 1); assert.equal(finishes, 1);
    const row = assertUsage(store);
    assert.deepEqual(ids, [row.id]); assert.equal(row.operation, '续写章节');
    assert.deepEqual(row.context, { novelId: 'novel-1', sessionId: 'session-1', sourceId: 'chapter-1', retryOf: 'prior-call' });
    assert.equal(JSON.stringify(store.getState()).includes('PRIVATE'), false);
  });
}

test('OpenAI usage-only trailer is collected after finish_reason while a server keeps the body open', { timeout: 1500 }, async t => {
  const store = ledger();
  let cancelled = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { content: visible }, finish_reason: 'stop' }] })));
    setTimeout(() => controller.enqueue(new TextEncoder().encode(sse({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 } }))), 20);
  }, cancel() { cancelled++; } }), { headers: { 'content-type': 'text/event-stream' } }));
  assert.equal(await new ModelService(config(), store).generate({ messages }), visible);
  assertUsage(store); assert.equal(cancelled, 1);
});

test('completed output survives transport cancellation during optional usage collection', async t => {
  const store = ledger();
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url, init) => new Response(new ReadableStream({ start(body) {
    body.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { content: visible }, finish_reason: 'stop' }] })));
    init.signal.addEventListener('abort', () => body.error(new DOMException('aborted', 'AbortError')));
  } }), { headers: { 'content-type': 'text/event-stream' } }));
  assert.equal(await new ModelService(config(), store).generate({ messages, signal: controller.signal, onStream() { controller.abort(); } }), visible);
  assert.equal(onlyRecord(store).status, 'succeeded');
});

test('missing usage is explicitly estimated and one-sided usage is mixed', async t => {
  const store = ledger();
  const responses = [json({ choices: [{ message: { content: visible } }] }), json({ choices: [{ message: { content: visible } }], usage: { prompt_tokens: 12 } })];
  t.mock.method(globalThis, 'fetch', async () => responses.shift());
  const service = new ModelService(config({ stream: false }), store);
  await service.generate({ messages });
  let row = onlyRecord(store);
  assert.equal(row.usageSource, 'estimated'); assert.equal(row.inputTokens, row.estimatedInputTokens);
  assert.equal(row.outputTokens, estimateTextTokens(visible)); assert.equal(row.cost, undefined);
  await service.generate({ messages });
  row = store.getState().records.find(record => record.usageSource === 'mixed');
  assert.ok(row); assert.equal(row.inputTokens, 12); assert.equal(row.outputTokens, estimateTextTokens(visible));
});

test('provider truncation preserves final partial text and reported usage before rejecting', async t => {
  for (const streaming of [false, true]) {
    const store = ledger(), chunks = [];
    const value = { choices: [{ [streaming ? 'delta' : 'message']: { content: visible }, finish_reason: 'length' }], usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 } };
    t.mock.method(globalThis, 'fetch', async () => streaming ? stream(sse(value)) : json(value));
    await assert.rejects(new ModelService(config({ stream: streaming }), store).generate({ messages, onStream: text => chunks.push(text) }), /上限/);
    const row = assertUsage(store, 12, 7, 'failed');
    assert.equal(row.errorCode, 'output_limit'); assert.deepEqual(chunks, [visible]);
  }
});

test('OpenAI truncation also collects its usage-only trailer before settling the failure', async t => {
  const store = ledger();
  t.mock.method(globalThis, 'fetch', async () => stream(sse({ choices: [{ delta: { content: visible }, finish_reason: 'length' }] }) +
    sse({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 } }) + 'data: [DONE]\n\n'));
  await assert.rejects(new ModelService(config(), store).generate({ messages }), /上限/);
  assert.equal(assertUsage(store, 12, 7, 'failed').errorCode, 'output_limit');
});

test('provider stream failure preserves visible partial output and stores only safe error codes', async t => {
  const store = ledger(), chunks = [];
  t.mock.method(globalThis, 'fetch', async () => stream(sse({ choices: [{ delta: { content: visible } }] }) + sse({ error: { message: 'PRIVATE ERROR private-api-key https://private.example/v1?api-version=private-query' } })));
  await assert.rejects(new ModelService(config(), store).generate({ messages, onStream: text => chunks.push(text) }), error => !error.message.includes('private-api-key'));
  const row = onlyRecord(store);
  assert.equal(row.status, 'failed'); assert.equal(row.errorCode, 'request_failed');
  assert.equal(row.outputCharacters, countOutputCharacters(visible)); assert.equal(row.outputTokens, estimateTextTokens(visible));
  const exported = JSON.stringify(store.getState());
  for (const secret of ['PRIVATE', 'private-api-key', 'private.example', 'private-query', 'Authorization', visible]) assert.equal(exported.includes(secret), false, secret);
  assert.deepEqual(chunks, [visible]);
});

test('cancellation after a partial stream settles once with retained counts', async t => {
  const store = ledger(), controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url, init) => new Response(new ReadableStream({ start(body) {
    body.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { content: visible } }], usage: { prompt_tokens: 12 } })));
    init.signal.addEventListener('abort', () => body.error(new DOMException('aborted', 'AbortError')));
  } }), { headers: { 'content-type': 'text/event-stream' } }));
  await assert.rejects(new ModelService(config(), store).generate({ messages, signal: controller.signal, onStream() { controller.abort(); } }), /已取消/);
  const row = onlyRecord(store);
  assert.equal(row.status, 'cancelled'); assert.equal(row.errorCode, 'cancelled');
  assert.equal(row.outputCharacters, countOutputCharacters(visible)); assert.equal(row.inputTokens, 12);
  assert.equal(usageSummary(store.getState()).month.calls, 1); assert.equal(row.reservedCost, undefined);
});

test('timeout covers body processing and retains partial counts', async t => {
  const store = ledger();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let rendered;
  const partial = new Promise(resolve => { rendered = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url, init) => new Response(new ReadableStream({ start(body) {
    body.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { content: visible } }] })));
    init.signal.addEventListener('abort', () => body.error(new DOMException('aborted', 'AbortError')));
  } }), { headers: { 'content-type': 'text/event-stream' } }));
  const pending = new ModelService(config({ timeoutSeconds: 5 }), store).generate({ messages, onStream: () => rendered() });
  await partial; t.mock.timers.tick(5000);
  await assert.rejects(pending, /请求超时/);
  const row = onlyRecord(store);
  assert.equal(row.status, 'failed'); assert.equal(row.errorCode, 'timeout');
  assert.equal(row.outputCharacters, countOutputCharacters(visible)); assert.equal(row.reservedCost, undefined);
});

test('already-cancelled calls never fetch and settle zero usage', async t => {
  const store = ledger(), controller = new AbortController(); controller.abort();
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetches++; });
  await assert.rejects(new ModelService(config(), store).generate({ messages, signal: controller.signal }), /已取消/);
  const row = onlyRecord(store);
  assert.equal(fetches, 0); assert.equal(row.dispatched, false); assert.equal(row.totalTokens, 0); assert.equal(row.cost, 0);
  assert.equal(row.status, 'cancelled'); assert.equal(usageSummary(store.getState()).month.calls, 0);
});

test('hard budgets block before fetch and notify the caller with the blocked record ID', async t => {
  const store = ledger();
  await store.getState().savePrice({ provider: 'custom', protocol: 'openai', model: 'usage-model', currency: 'CNY', inputPerMillion: 1, outputPerMillion: 1 });
  await store.getState().saveBudget({ mode: 'block', perCallLimit: 0.001 });
  let fetches = 0;
  const ids = [], warnings = [];
  t.mock.method(globalThis, 'fetch', async () => { fetches++; });
  await assert.rejects(new ModelService(config(), store).generate({ messages, onCallId: id => ids.push(id), onBudgetWarning: warning => warnings.push(warning) }), /预算/);
  const row = onlyRecord(store);
  assert.equal(fetches, 0); assert.equal(row.status, 'blocked'); assert.equal(row.dispatched, false);
  assert.deepEqual(ids, [row.id]); assert.equal(warnings.length, 1); assert.equal(row.totalTokens, 0);
  assert.equal(row.reservedCost, undefined); assert.equal(usageSummary(store.getState()).month.calls, 0);
});

test('reservation is durable and marked dispatched before the one paid fetch', async t => {
  const values = new Map();
  const store = createUsageStore({ storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) } });
  await store.getState().savePrice({ provider: 'custom', protocol: 'openai', model: 'usage-model', currency: 'CNY', inputPerMillion: 1, outputPerMillion: 1 });
  await store.getState().saveBudget({ mode: 'block', perCallLimit: 1 });
  t.mock.method(globalThis, 'fetch', async () => {
    const persisted = JSON.parse([...values.values()][0]).state.records[0];
    assert.equal(persisted.status, 'running'); assert.equal(persisted.dispatched, true); assert.ok(persisted.reservedCost > 0);
    return json(fixtures.openai.json);
  });
  await new ModelService(config({ stream: false }), store).generate({ messages });
  const row = assertUsage(store);
  assert.equal(row.cost, 19 / 1_000_000);
  assert.equal(usageSummary(store.getState()).active.calls, 0);
});

test('multiple generated candidates multiply the output reservation', async t => {
  for (const [protocol, extraBody] of [['openai', '{"n":3}'], ['gemini', '{"generationConfig":{"candidateCount":3}}']]) {
    const store = ledger();
    await store.getState().savePrice({ provider: 'custom', protocol, model: 'usage-model', currency: 'CNY', inputPerMillion: 0, outputPerMillion: 1 });
    await store.getState().saveBudget({ mode: 'block', perCallLimit: 0.02 });
    let fetches = 0;
    t.mock.method(globalThis, 'fetch', async () => { fetches++; });
    await assert.rejects(new ModelService(config({ protocol, extraBody }), store).generate({ messages }), /预算/);
    assert.equal(fetches, 0); assert.equal(onlyRecord(store).outputTokenLimit, 8192 * 3);
  }
});

test('metadata callback failures cannot duplicate a generation or settlement', async t => {
  const store = ledger();
  await store.getState().saveBudget({ mode: 'warn', perCallLimit: 1 });
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetches++; return json(fixtures.openai.json); });
  assert.equal(await new ModelService(config({ stream: false }), store).generate({ messages,
    onCallId() { throw new Error('metadata callback failed'); }, onBudgetWarning() { throw new Error('status callback failed'); } }), visible);
  assert.equal(fetches, 1); assertUsage(store);
});

test('only documented native OpenAI/DeepSeek streaming presets request usage trailers', async t => {
  for (const [apiProvider, baseUrl, expected] of [['openai', 'https://api.openai.com/v1', true], ['deepseek', 'https://api.deepseek.com/v1', true], ['custom', 'https://gateway.example/v1', undefined], ['openai', 'https://gateway.example/v1', undefined]]) {
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      assert.equal(JSON.parse(init.body).stream_options?.include_usage, expected);
      return stream(fixtures.openai.stream);
    });
    await new ModelService(config({ apiProvider, baseUrl }), ledger()).generate({ messages });
  }
});

test('connection tests are one labeled generation; free model discovery creates no records', async t => {
  const store = ledger();
  t.mock.method(globalThis, 'fetch', async (_url, init) => init.method === 'GET' ? json({ data: [{ id: 'usage-model' }] }) : json({ choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }));
  const service = new ModelService(config({ stream: false }), store);
  assert.deepEqual(await service.listModels(), ['usage-model']); assert.equal(store.getState().records.length, 0);
  assert.equal((await service.testConnection()).text, 'OK');
  assert.equal(onlyRecord(store).operation, '连接测试'); assert.equal(usageSummary(store.getState()).month.calls, 1);
});

test('configured key is scrubbed from model/context metadata before persistence', async t => {
  const store = ledger();
  t.mock.method(globalThis, 'fetch', async () => json(fixtures.openai.json));
  await new ModelService(config({ stream: false, model: 'model-private-api-key' }), store).generate({ messages, usageContext: { sessionId: 'private-api-key', operation: 'PRIVATE SYSTEM TEXT' } });
  const row = onlyRecord(store);
  assert.equal(row.operation, '文本生成'); assert.deepEqual(row.context, {});
  assert.equal(JSON.stringify(store.getState()).includes('private-api-key'), false);
});
