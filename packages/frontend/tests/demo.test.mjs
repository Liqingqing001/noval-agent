import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../src/demo/lingShiOrigin.json', import.meta.url), 'utf8'));

test('public fixture contains only the requested novel with readable chapters', () => {
  assert.equal(data.novels.length, 1);
  assert.equal(data.novels[0].title, '灵石起源');
  assert.equal(data.chapters.length, 17);
  assert.ok(data.chapters.every(chapter => chapter.content.trim() && chapter.title.trim()));
  for (const key of ['chapters', 'characters', 'worldSettings', 'plotCards', 'foreshadowings']) assert.ok(data[key].every(item => item.novelId === data.novels[0].id));
});

test('public fixture excludes account fields, credentials, prompts, cover URLs and original IDs', () => {
  const forbidden = new Set(['userId', 'email', 'passwordHash', 'apiKey', 'token', 'agentPrompt', 'cover', 'sessions']);
  const ids = new Set(Object.values(data).flat().map(item => item.id));
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbidden.has(key), `Unexpected private field ${key}`);
      if (key === 'id') assert.ok(child.startsWith('demo-'));
      else if (key.endsWith('Id')) assert.ok(ids.has(child), `Unmapped relationship ${key}`);
      inspect(child);
    }
  }
  inspect(data);
  assert.ok(!/\bsk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|-----BEGIN .*PRIVATE KEY/.test(JSON.stringify(data)));
});
