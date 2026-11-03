import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../src/demo/library.json', import.meta.url), 'utf8'));
const sources = [
  ['demo-school-night', '晚自习后，别回头', 'school'],
  ['demo-tide-remembers', '潮汐替人记得', 'book'],
];

test('database-exported library opens with the new novel and retains both complete linked manuscripts', () => {
  assert.deepEqual(data.novels.map(novel => novel.title), sources.map(source => source[1]));
  assert.equal(data.chapters.length, 80);
  for (const [id, title, directory] of sources) {
    const manifest = JSON.parse(readFileSync(new URL(`../public/${directory}/manifest.json`, import.meta.url), 'utf8'));
    const novel = data.novels.find(item => item.id === id);
    const chapters = data.chapters.filter(item => item.novelId === id).sort((a, b) => a.sequence - b.sequence);
    assert.equal(novel.title, title); assert.equal(novel.status, 'completed');
    assert.equal(chapters.length, 40);
    assert.ok(chapters.every(chapter => chapter.content.trim() && chapter.title.trim() && !/^第[零〇一二三四五六七八九十百千两\d]+章/.test(chapter.title)));
    assert.equal(chapters.reduce((sum, chapter) => sum + (chapter.content.match(/\p{Script=Han}/gu) || []).length, 0), manifest.hanCount);
    assert.equal(novel.wordCount, manifest.hanCount);
    assert.match(chapters.at(-1).content, /——全文完——/);
    assert.equal(data.plotCards.filter(card => card.novelId === id && card.type === 'volume').length, 5);
    const outlines = data.plotCards.filter(card => card.novelId === id && card.type === 'chapter');
    assert.equal(outlines.length, 40);
    assert.ok(outlines.every(card => card.status === 'completed' && chapters.some(chapter => chapter.id === card.chapterId && chapter.title === card.title)));
    for (const chapter of chapters) {
      const source = readFileSync(new URL(`../public/${directory}/chapters/${String(chapter.sequence + 1).padStart(2, '0')}.md`, import.meta.url), 'utf8');
      assert.equal(chapter.content, source.replace(/^# .*\r?\n/, '').trim(), 'Database manuscript preserves the authored chapter body');
    }
    assert.deepEqual(JSON.parse(readFileSync(new URL(`../src/demo/${directory === 'book' ? 'tideMemory' : 'schoolNight'}.json`, import.meta.url), 'utf8')).novels, [novel]);
  }
});

test('both cases include individual portraits, full profiles and valid character relationships', () => {
  for (const [novelId, , directory] of sources) {
    const characters = data.characters.filter(character => character.novelId === novelId);
    assert.equal(characters.length, directory === 'book' ? 8 : 12);
    for (const character of characters) {
      assert.match(character.avatar, new RegExp(`^${directory}/images/portraits\\.webp#cell=\\d+,4,${directory === 'book' ? 2 : 3}$`));
      assert.ok(character.description.length >= 50 && character.appearance.length >= 15 && character.personality.length >= 15 && character.background.length >= 15, `Complete profile: ${character.name}`);
      assert.ok(character.relationships.length > 0, `Relationships: ${character.name}`);
      for (const relationship of character.relationships) {
        assert.ok(characters.some(target => target.id === relationship.targetId && target.id !== character.id));
        assert.ok(relationship.kind && relationship.label);
      }
    }
  }
});

test('public snapshot excludes accounts and credentials, maps relationships and packages referenced artwork', () => {
  const forbidden = new Set(['userId', 'email', 'passwordHash', 'apiKey', 'token', 'agentPrompt', 'sessions']);
  const ids = new Set(Object.values(data).flat().map(item => item.id));
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbidden.has(key), `Unexpected private field ${key}`);
      if (key === 'id') assert.match(child, /^demo-(?:tide|school)-/);
      else if (key.endsWith('Id')) assert.ok(!child || ids.has(child), `Unmapped relationship ${key}`);
      else if (key === 'cover' || key === 'avatar') {
        assert.match(child, /^(?:book|school)\/images\/[a-z-]+\.webp(?:#cell=\d+,\d+,\d+)?$/);
        assert.ok(existsSync(new URL(`../public/${child.split('#')[0]}`, import.meta.url)));
      }
      inspect(child);
    }
  }
  inspect(data);
  assert.ok(!/\bsk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|-----BEGIN .*PRIVATE KEY/.test(JSON.stringify(data)));
});
