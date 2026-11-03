import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorldSettingContent, worldContentUrl } from '../src/components/world/WorldSettingContent.tsx';

test('world-setting artwork resolves local assets and rejects executable or disguised external URLs', () => {
  assert.equal(worldContentUrl('book/images/characters.webp'), 'https://novel-agent.invalid/book/images/characters.webp');
  assert.equal(worldContentUrl('https://example.test/image.webp'), 'https://example.test/image.webp');
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '//example.test/image.webp', '\\\\example.test/image.webp', 'java\nscript:alert(1)', 'file:///tmp/image']) assert.equal(worldContentUrl(value), '', value);
});

test('world cards display stored Markdown images and keep raw HTML inert', () => {
  const html = renderToStaticMarkup(React.createElement(WorldSettingContent, { content: '人物说明\n\n![四位主角](book/images/characters.webp)\n\n<script>alert(1)</script>\n\n[坏链接](javascript:alert(1))' }));
  assert.match(html, /alt="四位主角"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /book\/images\/characters.webp/);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('href="javascript:'));
});
