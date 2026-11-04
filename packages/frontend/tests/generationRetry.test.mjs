import test from 'node:test';
import assert from 'node:assert/strict';
import { completedGenerationHistory, generationOperation, generationRetry, interruptedGenerations } from '../src/lib/generationRetry.ts';

const user = { id: 'request', role: 'user', content: '请检查最近五章，保留这份原始要求。', timestamp: 1 };
const failed = { id: 'reply', role: 'assistant', content: '【章节】\n标题：未写完\n正文：保留这段文字', timestamp: 2, generation: { status: 'failed', requestMessageId: 'request', callId: 'call-first', reviewCount: 5 }, syncStatus: { state: 'partial', message: '未完成' } };
const session = { id: 'session-a', novelId: 'book-a', messages: [user, failed] };

test('manual retries retain the original request and call link without changing old partial text', () => {
  const before = structuredClone(session);
  assert.deepEqual(generationRetry([session], 'book-a', 'session-a', 'reply'), { content: user.content, retryOf: 'call-first', reviewCount: 5 });
  assert.deepEqual(session, before);
  assert.equal(generationRetry([session], 'book-b', 'session-a', 'reply'), null);
  assert.equal(generationRetry([session], 'book-a', 'other-session', 'reply'), null);
  assert.equal(generationRetry([{ ...session, messages: [failed] }], 'book-a', 'session-a', 'reply'), null);
  assert.equal(generationRetry([{ ...session, messages: [failed, user] }], 'book-a', 'session-a', 'reply'), null);
  for (const status of ['running', 'succeeded']) assert.equal(generationRetry([{ ...session, messages: [user, { ...failed, generation: { ...failed.generation, status } }] }], 'book-a', 'session-a', 'reply'), null);
});

test('reload exposes interrupted work for explicit retry and never turns partial markup into model history', () => {
  const running = { ...failed, generation: { ...failed.generation, status: 'running' } };
  const interrupted = interruptedGenerations([user, running]);
  assert.equal(interrupted[1].generation.status, 'interrupted');
  assert.equal(interrupted[1].content, failed.content);
  assert.equal(interrupted[1].syncStatus.state, 'partial');
  assert.equal(running.generation.status, 'running');
  assert.deepEqual(completedGenerationHistory(interrupted), [user]);
  const finished = { ...failed, content: '完整回复', generation: { ...failed.generation, status: 'succeeded' }, syncStatus: undefined };
  assert.deepEqual(completedGenerationHistory([user, failed, finished]), [user, finished]);
  assert.equal(interruptedGenerations([finished])[0], finished);
});

test('missing original requests and slash commands do not become billable retries; labels never contain prompt text', () => {
  for (const content of ['', '   ', '/clear']) assert.equal(generationRetry([{ ...session, messages: [{ ...user, content }, failed] }], 'book-a', 'session-a', 'reply'), null);
  assert.equal(generationOperation('请帮我生成这本小说的大纲，请先问我一些关键问题'), '生成大纲');
  assert.equal(generationOperation('请检查最近5章的通顺性'), '检查章节');
  assert.equal(generationOperation('私人内容不应出现在账本标签中'), '创作对话');
});

test('AI slash retries retain the expanded request, original command and read-only scope', () => {
  const request = { ...user, sourceCommand: '/check 1-5' };
  const reply = { ...failed, generation: { ...failed.generation, syncPolicy: 'review-only' } };
  const before = structuredClone({ request, reply });
  assert.deepEqual(generationRetry([{ ...session, messages: [request, reply] }], 'book-a', 'session-a', 'reply'), {
    content: user.content, retryOf: 'call-first', sourceCommand: '/check 1-5', syncPolicy: 'review-only', reviewCount: 5,
  });
  assert.deepEqual({ request, reply }, before);
});

test('persisted scoped command retries retain their original chapter target', () => {
  const request = { ...user, sourceCommand: '/polish 对话更自然' };
  const reply = { ...failed, generation: { ...failed.generation, syncPolicy: 'current-chapter', scopeChapterId: 'original-chapter' } };
  const persisted = JSON.parse(JSON.stringify({ ...session, messages: [request, reply] }));
  const retried = generationRetry([persisted], 'book-a', 'session-a', 'reply');
  assert.equal(retried.scopeChapterId, 'original-chapter');
  assert.equal(retried.sourceCommand, request.sourceCommand);
  assert.equal(retried.syncPolicy, 'current-chapter');
  assert.equal(persisted.messages[1].content, failed.content);
});
