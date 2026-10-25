import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig, endpoint, migrateSettings, normalizeConfig, validateConfig } from '../src/lib/modelConfig.ts';
import { ModelService, buildRequestBody, consumeSSE, requestHeaders } from '../src/services/modelService.ts';

const config = (overrides = {}) => ({ ...createDefaultConfig('custom'), baseUrl: 'https://model.example/prefix/v1', model: 'test-model', apiKey: 'test-key', ...overrides });
const messages = [{ role: 'system', content: 'system rules' }, { role: 'user', content: 'hello' }];
const jsonResponse = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
function streamResponse(text, width = 3) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += width) controller.enqueue(bytes.slice(offset, offset + width));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
}
const sse = data => `data: ${JSON.stringify(data)}\n\n`;

test('endpoint preserves prefixes, query parameters and full request URLs', () => {
  for (const suffix of ['', '/', '/chat/completions', '/responses', '/messages']) {
    assert.equal(endpoint(config({ baseUrl: `https://model.example/deploy/gpt${suffix}?api-version=2025-01-01` }), 'chat'), 'https://model.example/deploy/gpt/chat/completions?api-version=2025-01-01');
  }
  assert.equal(endpoint(config({ baseUrl: 'https://model.example', protocol: 'responses' }), 'chat'), 'https://model.example/responses');
  assert.equal(endpoint(config({ baseUrl: 'https://model.example/v1beta/models/old:generateContent', protocol: 'gemini', model: 'models/new' }), 'chat'), 'https://model.example/v1beta/models/new:streamGenerateContent?alt=sse');
  assert.equal(endpoint(config({ protocol: 'gemini' }), 'chat', false), 'https://model.example/prefix/v1/models/test-model:generateContent');
});

test('validation allows keyless local models, rejects invalid URLs and inputs', () => {
  assert.deepEqual(validateConfig(config({ ...createDefaultConfig('ollama'), model: 'local:latest' })), []);
  for (const change of [{ baseUrl: 'file:///secret' }, { baseUrl: 'https://user:password@example.com' }, { baseUrl: 'https://example.com?key=secret' }, { model: '' }, { apiKey: '' }, { maxTokens: NaN }, { maxTokens: 1.5 }, { temperature: 4 }, { timeoutSeconds: 0 }, { extraBody: '[]' }, { extraBody: '{' }, { extraHeaders: '{"X-Test": 1}' }, { extraHeaders: '{"Authorization":"secret"}' }, { extraBody: '{"model":"override"}' }, { protocol: 'anthropic', tokenParameter: 'omit' }]) {
    assert.ok(validateConfig(config(change)).length > 0, JSON.stringify(change));
  }
  assert.deepEqual(validateConfig(config({ model: '' }), false), []);
});

test('legacy migration keeps user settings and uses old Chat Completions protocol', () => {
  const old = { apiProvider: 'openai', baseUrl: 'https://private.example/v42', apiKey: 'old-key', model: 'private-deployment', temperature: 0.4, maxTokens: 32000 };
  const migrated = migrateSettings(old);
  for (const [key, value] of Object.entries(old)) assert.equal(migrated[key], value);
  assert.equal(migrated.protocol, 'openai');
  assert.equal(migrated.sendTemperature, true);
  assert.equal(migrated.profiles.openai.apiKey, 'old-key');
  assert.equal(createDefaultConfig('anthropic').apiKey, '');
  assert.equal(normalizeConfig({ ...migrated, saveConfig() {} }).profiles, undefined);
  assert.equal(migrateSettings({ apiProvider: 'unknown', baseUrl: 'https://custom.test' }).apiProvider, 'custom');
});

test('request bodies translate messages, optional parameters and token limits', () => {
  const openai = buildRequestBody(config({ model: 'o3-mini', sendTemperature: false }), messages, true);
  assert.equal(openai.max_completion_tokens, 8192); assert.equal(openai.temperature, undefined);
  assert.equal(buildRequestBody(config({ tokenParameter: 'max_tokens', model: 'o3' }), messages, false).max_tokens, 8192);
  assert.equal(buildRequestBody(config({ tokenParameter: 'omit' }), messages, false).max_tokens, undefined);
  const responses = buildRequestBody(config({ protocol: 'responses' }), messages, true);
  assert.equal(responses.instructions, 'system rules'); assert.equal(responses.input.length, 1);
  assert.equal(responses.max_output_tokens, 8192); assert.equal(responses.store, false);
  const claude = buildRequestBody(config({ protocol: 'anthropic' }), [...messages, { role: 'user', content: 'again' }], true);
  assert.equal(claude.system, 'system rules'); assert.equal(claude.messages[0].content, 'hello\n\nagain');
  assert.equal(messages[1].content, 'hello');
  const gemini = buildRequestBody(config({ protocol: 'gemini', sendTemperature: false, extraBody: '{"generationConfig":{"thinkingConfig":{"thinkingBudget":0},"temperature":1}}' }), [...messages, { role: 'assistant', content: 'reply' }], true);
  assert.equal(gemini.systemInstruction.parts[0].text, 'system rules');
  assert.equal(gemini.contents[1].role, 'model');
  assert.equal(gemini.generationConfig.temperature, undefined);
  assert.equal(gemini.generationConfig.thinkingConfig.thinkingBudget, 0);
});

test('authentication is protocol-specific and never adds dummy keys for local models', () => {
  assert.equal(requestHeaders(config()).Authorization, 'Bearer test-key');
  assert.equal(requestHeaders(config({ authMode: 'api-key' }))['api-key'], 'test-key');
  assert.equal(requestHeaders(config({ protocol: 'anthropic', authMode: 'x-api-key' }))['x-api-key'], 'test-key');
  assert.equal(requestHeaders(config({ protocol: 'anthropic' }))['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(requestHeaders(config({ protocol: 'gemini' }))['x-goog-api-key'], 'test-key');
  assert.equal(requestHeaders(config({ authMode: 'none', apiKey: '' })).Authorization, undefined);
});

test('SSE supports CRLF split across bytes, comments, multiline data and final unterminated events', async () => {
  const events = [];
  await consumeSSE(streamResponse(': ping\r\nevent: sample\r\ndata: {"text":\r\ndata: "你好"}\r\n\r\ndata: final', 1), (data, event) => { events.push({ data, event }); });
  assert.deepEqual(events, [{ data: '{"text":\n"你好"}', event: 'sample' }, { data: 'final', event: '' }]);
});

const fixtures = {
  openai: { stream: sse({ choices: [{ delta: { content: '你好' } }] }) + sse({ choices: [{ delta: { content: '世界' }, finish_reason: 'stop' }] }) + 'data:[DONE]', json: { choices: [{ message: { content: [{ type: 'text', text: '你好世界' }] } }] } },
  responses: { stream: sse({ type: 'response.output_text.delta', delta: '你好' }) + sse({ type: 'response.output_text.delta', delta: '世界' }) + sse({ type: 'response.completed', response: { status: 'completed' } }), json: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '你好世界' }] }] } },
  anthropic: { stream: sse({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hidden' } }) + sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: '你好世界' } }) + sse({ type: 'message_stop' }), json: { content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: '你好世界' }] } },
  gemini: { stream: sse({ candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: '你好世界' }] }, finishReason: 'STOP' }] }), json: { candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: '你好世界' }] } }] } },
};
for (const [protocol, fixture] of Object.entries(fixtures)) {
  test(`${protocol}: streaming and non-streaming use the same adapter`, async t => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      assert.equal(init.method, 'POST');
      calls++;
      return calls === 1 ? streamResponse(fixture.stream, 1) : jsonResponse(fixture.json);
    });
    const parts = [];
    assert.equal(await new ModelService(config({ protocol })).generate({ messages, onStream: value => parts.push(value) }), '你好世界');
    assert.equal(parts.at(-1), '你好世界');
    assert.equal(await new ModelService(config({ protocol, stream: false })).generate({ messages }), '你好世界');
  });
}

test('JSON fallback works when a gateway ignores the streaming option', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(fixtures.openai.json));
  assert.equal(await new ModelService(config()).generate({ messages }), '你好世界');
});

test('unterminated final content is retained before DONE', async t => {
  t.mock.method(globalThis, 'fetch', async () => streamResponse(sse({ choices: [{ delta: { content: 'first' } }] }) + 'data: {"choices":[{"delta":{"content":"last"},"finish_reason":"stop"}]}'));
  assert.equal(await new ModelService(config()).generate({ messages }), 'firstlast');
});

test('truncated, blocked, invalid, failed and empty results are rejected', async t => {
  const responses = [
    streamResponse(sse({ choices: [{ delta: { content: 'partial' } }] })),
    streamResponse(sse({ choices: [{ finish_reason: 'length' }] })),
    streamResponse(sse({ error: { message: 'stream failed' } })),
    streamResponse('data: invalid\n\n'),
    jsonResponse({ choices: [{ message: { content: '' } }] }),
    jsonResponse({ candidates: [{ finishReason: 'SAFETY' }] }),
    streamResponse(sse({ type: 'response.failed', response: { error: { message: 'failed' } } })),
  ];
  t.mock.method(globalThis, 'fetch', async () => responses.shift());
  for (const protocol of ['openai', 'openai', 'openai', 'openai', 'openai', 'gemini', 'responses']) {
    await assert.rejects(new ModelService(config({ protocol })).generate({ messages }));
  }
});

test('HTTP errors are actionable and redact keys', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"error":{"message":"invalid test-key"}}', { status: 401 }));
  await assert.rejects(new ModelService(config()).generate({ messages }), error => /HTTP 401/.test(error.message) && !error.message.includes('test-key'));
});

test('cancellation propagates to fetch and errors are readable', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => { init.signal.throwIfAborted(); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(new ModelService(config()).generate({ messages, signal: controller.signal }), /已取消/);
});

test('request timeout covers response body processing', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
    },
  }), { headers: { 'content-type': 'text/event-stream' } }));
  const pending = new ModelService(config({ timeoutSeconds: 5 })).generate({ messages });
  t.mock.timers.tick(5000);
  await assert.rejects(pending, /请求超时/);
});

test('cancelling after partial stream output does not report success', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url, init) => new Response(new ReadableStream({
    start(streamController) {
      streamController.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { content: 'partial' } }] })));
      init.signal.addEventListener('abort', () => streamController.error(new DOMException('aborted', 'AbortError')));
    },
  }), { headers: { 'content-type': 'text/event-stream' } }));
  await assert.rejects(new ModelService(config()).generate({ messages, signal: controller.signal, onStream() { controller.abort(); } }), /已取消/);
});

test('Gemini model discovery paginates and filters non-text models', async t => {
  let page = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    page++;
    if (page === 1) return jsonResponse({ models: [{ name: 'models/chat-a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'next' });
    assert.equal(new URL(url).searchParams.get('pageToken'), 'next');
    return jsonResponse({ models: [{ name: 'models/chat-b', supportedGenerationMethods: ['generateContent'] }] });
  });
  assert.deepEqual(await new ModelService(config({ protocol: 'gemini', model: '' })).listModels(), ['chat-a', 'chat-b']);
});

test('Anthropic model discovery uses ID cursors and deduplicates results', async t => {
  let page = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (++page === 1) return jsonResponse({ data: [{ id: 'a' }], has_more: true, last_id: 'a' });
    assert.equal(new URL(url).searchParams.get('after_id'), 'a');
    return jsonResponse({ data: [{ id: 'a' }, { id: 'b' }], has_more: false });
  });
  assert.deepEqual(await new ModelService(config({ protocol: 'anthropic', model: '' })).listModels(), ['a', 'b']);
});

test('connection test respects streaming and custom request parameters', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.stream, false); assert.equal(body.enable_thinking, false);
    assert.equal(body.max_tokens, 8192);
    assert.equal(init.headers['X-Custom'], 'custom');
    return jsonResponse({ choices: [{ message: { content: 'OK' } }] });
  });
  const result = await new ModelService(config({ stream: false, extraBody: '{"enable_thinking":false}', extraHeaders: '{"X-Custom":"custom"}' })).testConnection();
  assert.equal(result.text, 'OK');
});
