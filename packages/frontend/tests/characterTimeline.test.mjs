import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyTimelineDraft, orderTimelineEntries, parseTimelineSuggestions, timelineEvidence, timelineExtractionPrompt, timelineFingerprint, validateTimelineDraft } from '../src/lib/characterTimeline.ts';
import { reviewVisibleText } from '../src/lib/reviewText.ts';
import { createTimelineStore } from '../src/stores/timelineStore.ts';

const chapter = (id, sequence, content = '林夏右手受伤。她回到了教室。', novelId = 'book') => ({ id, novelId, sequence, title: id, content, wordCount: content.length, createdAt: 0, updatedAt: 0 });
const person = { id: 'person', novelId: 'book', name: '林夏', aliases: ['小夏'], description: '' };
const state = (id = 'entry', changes = {}) => ({ ...emptyTimelineDraft(), id, novelId: 'book', characterId: 'person', chapterId: 'one', physicalState: '右手受伤', quote: '林夏右手受伤', sourceFingerprint: timelineFingerprint(chapter('one', 1).content), origin: 'manual', createdAt: 1, updatedAt: 1, ...changes });
function memoryStorage() { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), data }; }

test('state ordering follows current same-book chapters and leaves missing references at the end', () => {
  const entries = [state('missing', { chapterId: 'gone' }), state('one'), state('two', { chapterId: 'two' })];
  assert.deepEqual(orderTimelineEntries(entries, [chapter('one', 9), chapter('two', 2), chapter('gone', 1, 'foreign', 'other')]).map(row => row.id), ['two', 'one', 'missing']);
  assert.deepEqual(entries.map(row => row.id), ['missing', 'one', 'two']);
});

test('missing characters/chapters, changed bodies and authored states are never presented as verified facts', () => {
  const entry = state();
  assert.equal(timelineEvidence(entry, [chapter('one', 1)], [person]), 'quoted');
  assert.equal(timelineEvidence(entry, [chapter('one', 1, '新正文')], [person]), 'changed');
  assert.equal(timelineEvidence(entry, [chapter('one', 1, chapter('one', 1).content, 'other')], [person]), 'missing-chapter');
  assert.equal(timelineEvidence(entry, [chapter('one', 1)], []), 'missing-character');
  assert.equal(timelineEvidence({ ...entry, quote: '' }, [chapter('one', 1)], [person]), 'unquoted');
});

test('review projection supports rich text boundaries, entities and safe exact evidence', () => {
  const source = '<p data-private="假的引用">林夏<strong>右手</strong>受伤 &amp; 疼痛。</p><p>她回到了教室。</p><script>秘密证据</script>';
  assert.equal(reviewVisibleText(source), '林夏右手受伤 & 疼痛。\n她回到了教室。');
  const parsed = parseTimelineSuggestions(JSON.stringify({ entries: [{ physicalState: '受伤', quote: '林夏右手受伤' }, { physicalState: '秘密', quote: '秘密证据' }, { note: '属性', quote: '假的引用' }] }), chapter('one', 1, source));
  assert.equal(parsed.suggestions.length, 1);
  assert.equal(parsed.rejected, 2);
  assert.equal(reviewVisibleText('甲 < 乙 & 丙\r\n下一段'), '甲 < 乙 & 丙\n下一段');
});

test('AI extraction accepts bounded exact-quoted proposals, drops invalid rows and never trusts supplied IDs', () => {
  const raw = { entries: [{ chapterId: 'foreign', characterId: 'foreign', physicalState: '右手受伤', quote: '林夏右手受伤' }, { physicalState: '没受伤', quote: '不存在的句子' }, { quote: '她回到了教室' }, { note: '类型错误', quote: 123 }] };
  const parsed = parseTimelineSuggestions('```json\n' + JSON.stringify(raw) + '\n```', chapter('one', 1));
  assert.equal(parsed.suggestions.length, 1);
  assert.equal(parsed.rejected, 3);
  assert.equal('chapterId' in parsed.suggestions[0], false);
  assert.equal('characterId' in parsed.suggestions[0], false);
  assert.throws(() => parseTimelineSuggestions('broken', chapter('one', 1)), /JSON/);
  assert.throws(() => parseTimelineSuggestions(JSON.stringify({ entries: Array(11).fill({}) }), chapter('one', 1)), /最多 10/);
});

test('single-chapter prompt includes full visible text, not attributes or other chapters; oversized source is rejected', () => {
  const content = '<p title="secret">林夏<strong>右手</strong>受伤。</p>';
  const prompt = timelineExtractionPrompt(person, chapter('one', 1, content));
  assert.match(prompt, /林夏右手受伤/);
  assert.doesNotMatch(prompt, /secret|<strong>/);
  assert.throws(() => timelineExtractionPrompt(person, chapter('long', 1, '甲'.repeat(32001))), /不会被截断/);
  assert.equal(timelineFingerprint('甲乙'), timelineFingerprint('甲乙'));
  assert.notEqual(timelineFingerprint('甲乙'), timelineFingerprint('乙甲'));
});

test('manual drafts require meaningful states and enforce bounded plain text', () => {
  assert.throws(() => validateTimelineDraft({ quote: '只有引文' }), /至少/);
  assert.throws(() => validateTimelineDraft({ emotion: 1 }), /文字/);
  assert.throws(() => validateTimelineDraft({ emotion: '甲'.repeat(1001) }), /过长/);
  assert.deepEqual(validateTimelineDraft({ location: ' 教室 ', ignored: '不会保存' }), { ...emptyTimelineDraft(), location: '教室' });
});

test('local persistence survives reload, isolates account keys and rejects cross-book/character rewriting', () => {
  const storage = memoryStorage(), first = createTimelineStore('alice', { storage });
  first.getState().save(state());
  assert.equal(createTimelineStore('alice', { storage }).getState().entries.length, 1);
  assert.equal(createTimelineStore('bob', { storage }).getState().entries.length, 0);
  assert.throws(() => first.getState().save(state('entry', { novelId: 'other' })), /另一本书/);
  assert.throws(() => first.getState().save(state('entry', { characterId: 'other' })), /其他人物/);
  first.getState().remove('entry', 'other');
  assert.equal(first.getState().entries.length, 1);
  first.getState().remove('entry', 'book');
  assert.equal(first.getState().entries.length, 0);
});

test('storage failure leaves old saved records intact and exposes error; explicit retry does not invent a saved draft', () => {
  const storage = memoryStorage();
  let fail = false;
  const wrapped = { getItem: storage.getItem, setItem: (key, value) => { if (fail) throw new Error('quota'); storage.setItem(key, value); } };
  const store = createTimelineStore('local', { storage: wrapped });
  store.getState().save(state()); fail = true;
  assert.throws(() => store.getState().save(state('new')), /保存失败/);
  assert.equal(store.getState().entries.length, 1);
  assert.match(store.getState().error, /表单仍保留/);
  fail = false; store.getState().retrySave();
  assert.equal(store.getState().error, '');
  assert.equal(createTimelineStore('local', { storage }).getState().entries.length, 1);
});

test('a second open workspace merges independent additions and removes only the selected event', () => {
  const storage = memoryStorage(), first = createTimelineStore('local', { storage }), second = createTimelineStore('local', { storage });
  first.getState().save(state('first'));
  second.getState().save(state('second'));
  assert.deepEqual(createTimelineStore('local', { storage }).getState().entries.map(row => row.id), ['first', 'second']);
  first.getState().remove('first', 'book');
  assert.deepEqual(createTimelineStore('local', { storage }).getState().entries.map(row => row.id), ['second']);
});

test('malformed saved data is retained and blocks writes; explicit ID remapping only affects the intended book', () => {
  const storage = memoryStorage(); storage.setItem('bad', '{bad json');
  const broken = createTimelineStore('local', { storage, key: 'bad' });
  assert.equal(broken.getState().unreadable, true);
  assert.throws(() => broken.getState().save(state()), /无法读取/);
  assert.equal(storage.getItem('bad'), '{bad json');
  const store = createTimelineStore('local', { storage: null });
  store.getState().save(state()); store.getState().save(state('foreign', { novelId: 'other' }));
  store.getState().remapReference('chapterId', 'one', 'new-one', 'book');
  store.getState().remapReference('characterId', 'person', 'new-person', 'book');
  assert.equal(store.getState().entries.find(row => row.id === 'entry').chapterId, 'new-one');
  assert.equal(store.getState().entries.find(row => row.id === 'entry').characterId, 'new-person');
  assert.equal(store.getState().entries.find(row => row.id === 'foreign').chapterId, 'one');
});
