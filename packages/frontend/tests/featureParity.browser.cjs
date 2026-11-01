// Both builds run this same regression. Backend/model traffic is mocked and no real credentials are used.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');
const fixture = require('../src/demo/lingShiOrigin.json');
const mode = process.env.PARITY_MODE || 'demo';
const isDemo = mode === 'demo';
const base = process.env.PARITY_URL || `http://127.0.0.1:5182${isDemo ? '/noval-agent/' : '/'}`;
const key = name => isDemo ? `${name}-demo-v1` : name;

(async () => {
  const server = process.env.PARITY_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5182', '--strictPort'], {
    cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' },
  });
  let browser;
  try {
    if (server) {
      for (let attempt = 0; ; attempt++) {
        try { if ((await fetch(base)).ok) break; } catch { /* Await our own preview only. */ }
        if (attempt === 60) throw new Error('Preview did not start');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const data = structuredClone(fixture);
        const page = await context.newPage();
        const errors = [], modelRequests = [], backendRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.addInitScript(({ fixture, isDemo }) => {
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-settings'), JSON.stringify({ version: 1, state: {
            apiProvider: 'custom', protocol: 'openai', baseUrl: 'https://model.example.test/v1', apiKey: 'TEST_PLACEHOLDER', authMode: 'bearer', model: 'test-model',
            temperature: .7, sendTemperature: false, maxTokens: 8192, timeoutSeconds: 30, tokenParameter: 'auto', stream: false, extraBody: '', extraHeaders: '', profiles: {},
          } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
            localStorage.setItem('novel-agent-storage', JSON.stringify({ state: { ...fixture, sessions: [], currentNovelId: fixture.novels[0].id, currentChapterId: fixture.chapters[0].id, currentView: 'chapters' } }));
          }
        }, { fixture, isDemo });
        await page.route('https://model.example.test/**', async route => {
          modelRequests.push(route.request().postDataJSON());
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '| 检查项 | 结果 |\n| --- | --- |\n| 逻辑 | 正常 |' } }] }) });
        });
        await page.route('**/api/**', async route => {
          backendRequests.push(route.request().url());
          const path = new URL(route.request().url()).pathname;
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
          else {
            const resource = path.split('/').at(-1);
            const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
            if (route.request().method() === 'GET' && resources[resource]) body = { [resources[resource]]: data[resources[resource]] };
            else if (route.request().method() === 'PUT') {
              const update = route.request().postDataJSON();
              const item = Object.values(data).flat().find(item => item.id === resource);
              Object.assign(item || {}, update);
              body = { novel: item, chapter: item, plotCard: item, character: item, worldSetting: item, foreshadowing: item };
            } else throw new Error(`Unexpected backend request: ${path}`);
          }
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.goto(base);
        await page.locator('.tiptap').waitFor();
        const nav = page.getByRole('navigation', { name: '工作区切换' });
        if (width < 1280) await nav.getByRole('button', { name: 'AI 助手', exact: true }).click();
        for (const label of ['生成大纲', '优化大纲', '续写章节', '续写一章', '续写三章', '检查章节']) {
          await page.getByRole('button', { name: label, exact: true }).click();
          await page.getByText('生成中，可随时停止', { exact: false }).waitFor({ state: 'hidden' });
          await page.locator('#workspace-assistant table').first().waitFor();
        }
        assert.equal(modelRequests.length, 6);
        const latestUser = request => request.messages.at(-1).content;
        assert.ok(!latestUser(modelRequests[0]).includes('【本次章节字数要求】'));
        assert.ok(latestUser(modelRequests[3]).includes('3000-4000'));
        const review = latestUser(modelRequests.at(-1));
        for (const chapter of fixture.chapters.slice().sort((a, b) => a.sequence - b.sequence).slice(-5)) assert.ok(review.includes(chapter.content), `Review missing ${chapter.title}`);
        assert.ok(!review.includes('【本次章节字数要求】'));
        if (width < 1280) await nav.getByRole('button', { name: '书架', exact: true }).click();
        await page.getByRole('button', { name: '大纲', exact: true }).click();
        await page.getByRole('button', { name: /^编辑章节大纲：/ }).first().click();
        await page.getByRole('button', { name: '⏳ 待写作', exact: true }).click();
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        assert.equal(state.plotCards.find(card => card.id === fixture.plotCards.find(card => card.type === 'chapter').id).status, 'pending');
        if (width >= 1280) {
          while (await page.getByRole('button', { name: /^收起卷：/ }).count()) await page.getByRole('button', { name: /^收起卷：/ }).first().click();
          const volumes = page.locator('[data-volume-id]');
          const first = await volumes.nth(0).getAttribute('data-volume-id');
          const second = await volumes.nth(1).getAttribute('data-volume-id');
          await volumes.nth(0).dragTo(volumes.nth(1));
          assert.equal(await volumes.nth(0).getAttribute('data-volume-id'), second);
          assert.equal(await volumes.nth(1).getAttribute('data-volume-id'), first);
        }
        if (width < 1280) await nav.getByRole('button', { name: '书架', exact: true }).click();
        await page.getByRole('button', { name: '章节', exact: true }).click();
        await page.getByRole('button', { name: '导出', exact: true }).click();
        await page.getByLabel('文件格式', { exact: true }).selectOption('docx');
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: '下载文件', exact: true }).click();
        assert.ok((await download).suggestedFilename().endsWith('.docx'));
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        if (isDemo) assert.deepEqual(backendRequests, []);
        assert.deepEqual(errors, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          if (width < 1280) await nav.getByRole('button', { name: 'AI 助手', exact: true }).click();
          await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `parity-${mode}-${width}.png`) });
        }
        results.push(`${width}px: six actions, five-chapter review, GFM, outline status, volume sorting, Word export`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
