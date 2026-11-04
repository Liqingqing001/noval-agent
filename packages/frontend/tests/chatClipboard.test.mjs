import assert from 'node:assert/strict';
import test from 'node:test';
import { chatReplyPreview, copyChatReply } from '../src/lib/chatClipboard.ts';

test('copy passes the entire original Chinese response literally and waits for clipboard confirmation', async () => {
  const original = '【章节】\n标题：夜校\n内容：林夏推开门。<p>这是原文，不是展示格式。</p>\n【/章节】';
  let saved, release;
  const waiting = new Promise(resolve => { release = resolve; });
  const copying = copyChatReply(original, { writeText: async value => { saved = value; await waiting; } });
  let completed = false;
  copying.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(saved, original);
  assert.equal(completed, false);
  release();
  assert.equal(await copying, 'copied');
});

test('denied or unavailable clipboard requests manual copying instead of reporting success', async () => {
  assert.equal(await copyChatReply('未改写的原回复', null), 'manual');
  assert.equal(await copyChatReply('未改写的原回复', { writeText: async () => { throw new Error('NotAllowedError'); } }), 'manual');
  assert.equal(await copyChatReply('未改写的原回复', { writeText() { throw new Error('Unavailable'); } }), 'manual');
});

test('long streaming preview retains the latest received tail without copying or mutating a shortened reply', () => {
  const original = '开篇设定\n' + '校园长篇正文。'.repeat(8000) + '\n林夏终于听见下课铃。';
  const preview = chatReplyPreview(original, true);
  assert.equal(preview.omitted, true);
  assert.ok(preview.head.startsWith('开篇设定'));
  assert.ok(preview.tail.endsWith('林夏终于听见下课铃。'));
  assert.ok(preview.head.length + preview.tail.length <= 340);
  assert.ok(original.endsWith(preview.tail));
  assert.equal(original.length > 40000, true);
});

test('previews never split an emoji and completed previews remain explicitly shortened', () => {
  const original = '校'.repeat(99) + '🌙' + '夜'.repeat(400) + '🌙' + '灯'.repeat(239);
  const streaming = chatReplyPreview(original, true);
  assert.equal(streaming.head, '校'.repeat(99));
  assert.equal(streaming.tail, '灯'.repeat(239));
  assert.equal(chatReplyPreview('短回复', false).omitted, false);
  assert.equal(chatReplyPreview('一\n'.repeat(20), false).omitted, true);
});
