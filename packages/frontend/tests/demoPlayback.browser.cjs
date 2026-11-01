// Run against a demo build. Use PLAYWRIGHT_MODULE / CHROME_PATH for an existing installation.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sample = require('../src/demo/lingShiOrigin.json');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
  const base = process.env.DEMO_URL || 'http://127.0.0.1:5181/noval-agent/';
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const results = [];
  // The public fixture's opening chapter is plain text with paragraph breaks.
  const expected = sample.chapters[0].content.trim();
  assert.ok(expected.length > 1200);
  assert.ok(!/<p[ >]/i.test(expected), 'Update this test if the sample switches to rich text');
  try {
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const page = await context.newPage();
        const errors = [];
        const posts = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
        await page.goto(base);
        await page.locator('.tiptap').waitFor();
        const original = await page.evaluate(() => localStorage.getItem('novel-agent-storage-demo-v1'));
        if (width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: 'AI 助手', exact: true }).click();
        const start = page.getByRole('button', { name: '演示正文生成效果', exact: true });
        const text = page.locator('#demo-playback-text');
        await start.click();
        await page.waitForFunction(() => document.querySelector('#demo-playback-text')?.textContent.length > 1200);
        await page.getByText('本章全文回放结束。', { exact: true }).waitFor();
        assert.equal(await text.textContent(), expected, 'Replay must include the complete opening chapter, including its last paragraph');
        await page.getByText(`第一章《${sample.chapters[0].title}》 · 已回放 ${expected.length.toLocaleString()} / ${expected.length.toLocaleString()} 字符`, { exact: true }).waitFor();
        const expand = page.getByRole('button', { name: '展开全文', exact: true });
        assert.equal(await expand.getAttribute('aria-expanded'), 'false');
        assert.ok(await text.evaluate(element => element.scrollHeight > element.clientHeight));
        await expand.click();
        assert.equal(await page.getByRole('button', { name: '收起全文', exact: true }).getAttribute('aria-expanded'), 'true');
        assert.equal(await text.textContent(), expected);
        await page.getByRole('button', { name: '收起全文', exact: true }).click();
        await text.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await text.scrollIntoViewIfNeeded();
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, `demo-playback-${width}.png`) });
        }
        await start.click();
        await page.waitForFunction(total => {
          const length = document.querySelector('#demo-playback-text')?.textContent.length || 0;
          return length > 0 && length < total;
        }, expected.length);
        await page.getByText('本章全文回放结束。', { exact: true }).waitFor();
        assert.equal(await text.textContent(), expected, 'Completed playback must be restartable');
        assert.equal(await page.evaluate(() => localStorage.getItem('novel-agent-storage-demo-v1')), original, 'Replay must not modify the manuscript');
        assert.deepEqual(posts, [], 'Replay must not call a model or backend');
        assert.deepEqual(errors, []);
        results.push(`${width}px: full ${expected.length}-character chapter, expand/collapse, replay, no writes or API calls`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ url: base, results }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
