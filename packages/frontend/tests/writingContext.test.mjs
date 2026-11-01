import test from 'node:test';
import assert from 'node:assert/strict';
import { writingRequirement, timelineContext } from '../src/lib/writingContext.ts';

test('writing requests preserve Arabic and Chinese word-count ranges', () => {
  for (const request of ['请续写一章，每章3000-4000字', '写第一章正文，三千到四千字', '请写正文三千字至四千字']) {
    assert.match(writingRequirement(request), /3000-4000/);
    assert.doesNotMatch(writingRequirement(request), /至少 4000/);
  }
  assert.match(writingRequirement('写第一章正文，1.2万字'), /12000/);
  assert.match(writingRequirement('续写当前章节，最多800字'), /最多800字/);
});

test('outline generation and chapter reviews never acquire a default body-length requirement', () => {
  for (const request of ['请帮我生成这本小说的大纲，请先问我一些关键问题', '请帮我优化当前大纲', '请检查最近5章逻辑问题', '请写章节大纲']) assert.equal(writingRequirement(request), '');
  assert.match(writingRequirement('请按照大纲顺序续写一章'), /3000-4000/);
  assert.equal(writingRequirement('续写当前章节', '本书每章1500字'), '');
});

test('timeline uses positive chapter positions and keeps time references in story order', () => {
  assert.equal(timelineContext([]), '');
  const one = timelineContext([{ title: '开篇', content: '下午15:55，他离开；晚上又回来了。' }]);
  assert.match(one, /第1章/);
  assert.match(one, /下午15:55 → 晚上/);
  const five = timelineContext(Array.from({ length: 5 }, (_, index) => ({ title: `章节${index + 1}`, content: '没有时间信息' })));
  assert.match(five, /第3章/);
  assert.match(five, /第5章/);
  assert.doesNotMatch(five, /第[012]章/);
});
