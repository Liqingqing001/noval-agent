import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../src/demo/tideMemory.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../public/book/manifest.json', import.meta.url), 'utf8'));

test('public database snapshot contains only Tide with complete linked manuscript and settings', () => {
  assert.equal(data.novels.length, 1);
  assert.equal(data.novels[0].title, '潮汐替人记得');
  assert.equal(data.novels[0].status, 'completed');
  assert.equal(data.chapters.length, 40);
  assert.ok(data.chapters.every(chapter => chapter.content.trim() && chapter.title.trim()));
  assert.equal(data.chapters.reduce((sum,chapter)=>sum+(chapter.content.match(/\p{Script=Han}/gu)||[]).length,0), manifest.hanCount);
  assert.match(data.chapters.at(-1).content, /——全文完——/);
  assert.equal(data.characters.length, 8);
  assert.ok(data.worldSettings.length >= 6);
  assert.equal(data.plotCards.filter(card=>card.type==='volume').length,5);
  const chapterOutlines=data.plotCards.filter(card=>card.type==='chapter');
  assert.equal(chapterOutlines.length,data.chapters.length);
  assert.ok(chapterOutlines.every(card=>card.status==='completed'&&data.chapters.some(chapter=>chapter.id===card.chapterId)));
  for (const key of ['chapters', 'characters', 'worldSettings', 'plotCards', 'foreshadowings']) assert.ok(data[key].every(item => item.novelId === data.novels[0].id));
});

test('public snapshot excludes accounts, credentials and prompts; only packaged book artwork is referenced', () => {
  const forbidden = new Set(['userId', 'email', 'passwordHash', 'apiKey', 'token', 'agentPrompt', 'sessions']);
  const ids = new Set(Object.values(data).flat().map(item => item.id));
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbidden.has(key), `Unexpected private field ${key}`);
      if (key === 'id') assert.ok(child.startsWith('demo-tide-'));
      else if (key.endsWith('Id')) assert.ok(!child || ids.has(child), `Unmapped relationship ${key}`);
      else if (key === 'cover') assert.match(child,/^book\/images\/[a-z-]+\.webp$/);
      inspect(child);
    }
  }
  inspect(data);
  assert.ok(!/\bsk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|-----BEGIN .*PRIVATE KEY/.test(JSON.stringify(data)));
});
