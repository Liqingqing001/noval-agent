// Run against a demo build. Use PLAYWRIGHT_MODULE / CHROME_PATH for an existing installation.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sample = require('../src/demo/library.json');
const { mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');

(async () => {
  const base = process.env.DEMO_URL || 'http://127.0.0.1:5181/noval-agent/';
  const server = process.env.DEMO_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5181', '--strictPort'], { cwd: resolve(__dirname, '..'), stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: '/noval-agent/' } });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* Await our own preview. */ }
      if (attempt === 60) throw Error('Demo playback preview did not start');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const results = [];
    // The public fixture's opening chapter is plain text with paragraph breaks.
    const expected = sample.chapters[0].content.trim();
    assert.ok(expected.length > 1200);
    assert.ok(!/<p[ >]/i.test(expected), 'Update this test if the sample switches to rich text');
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
        const start = page.getByRole('button', { name: '回放已有章节（非实时生成）', exact: true });
        const text = page.locator('#demo-playback-text');
        await start.click();
        await page.waitForFunction(() => document.querySelector('#demo-playback-text')?.textContent.length > 1200);
        await page.getByText('本章全文回放结束。', { exact: true }).waitFor();
        assert.equal(await text.textContent(), expected, 'Replay must include the complete opening chapter, including its last paragraph');
        await page.getByText(`《${sample.chapters[0].title}》 · 已回放 ${expected.length.toLocaleString()} / ${expected.length.toLocaleString()} 字符`, { exact: true }).waitFor();
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
        if (width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: '书架', exact: true }).click();
        await page.locator('.shelf-book').filter({ hasText: '潮汐替人记得' }).click();
        if (width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: 'AI 助手', exact: true }).click();
        const tideChapter = sample.chapters.find(chapter => chapter.novelId === 'demo-tide-remembers');
        const tideOriginal = await page.evaluate(() => localStorage.getItem('novel-agent-storage-demo-v1'));
        await start.click();
        await page.getByText('本章全文回放结束。', { exact: true }).waitFor();
        assert.equal(await text.textContent(), tideChapter.content.trim(), 'Switching books replays the selected case');
        assert.equal(await page.evaluate(() => localStorage.getItem('novel-agent-storage-demo-v1')), tideOriginal);
        assert.deepEqual(posts, [], 'Replay must not call a model or backend');
        assert.deepEqual(errors, []);
        results.push(`${width}px: both novels replay in full, expand/collapse, restart, no manuscript writes or API calls`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ url: base, results }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
