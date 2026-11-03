// Run against a demo build. Install Playwright locally, or set PLAYWRIGHT_MODULE to its module path.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const base = process.env.DEMO_URL || 'http://127.0.0.1:5181/noval-agent/';
  const sizes = [[320, 667], [375, 667], [390, 844], [844, 390], [768, 1024], [1024, 768], [1280, 800], [1680, 1050]];
  const results = [];
  try {
    for (const [width, height] of sizes) {
      const compact = width < 1280;
      const phone = width < 768 || (compact && height < 500);
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: compact, acceptDownloads: true });
      // Resizing preferences saved on a computer must not squeeze mobile content out of view.
      await context.addInitScript(() => {
        localStorage.setItem('novel-agent-sidebar-width', '400');
        localStorage.setItem('novel-agent-panel-width', '600');
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const nav = page.getByRole('navigation', { name: '工作区切换' });
      const changePanel = label => nav.getByRole('button', { name: label, exact: true }).click();
      const assertLayout = async () => {
        const dimensions = await page.evaluate(() => {
          const main = document.querySelector('#workspace-content').getBoundingClientRect();
          return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, main: main.width };
        });
        assert.ok(dimensions.scroll <= width + 1, `${width}: page overflows: ${JSON.stringify(dimensions)}`);
        if (await page.locator('#workspace-content').isVisible()) assert.ok(dimensions.main >= Math.min(width, 500), `${width}: content squeezed`);
        if (compact) {
          const bounds = await nav.boundingBox();
          assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height + 1, `${width}: navigation clipped`);
        }
      };
      try {
        await page.goto(base);
        await page.locator('.tiptap').waitFor();
        await assertLayout();
        assert.ok((await page.locator('.tiptap').boundingBox()).width > 160, `${width}: manuscript collapsed`);
        const paragraph = await page.locator('.tiptap p').first().boundingBox();
        const paper = await page.locator('.manuscript-background').boundingBox();
        assert.ok(Math.min(paragraph.y + paragraph.height, paper.y + paper.height) - Math.max(paragraph.y, paper.y) > 12, `${width}: first paragraph outside reading area`);
        if (compact) {
          assert.equal(await page.locator('#workspace-bookshelf').isVisible(), false);
          assert.equal(await page.locator('#workspace-assistant').isVisible(), false);
        } else {
          assert.equal(await nav.isVisible(), false);
          assert.ok(await page.locator('#workspace-bookshelf').isVisible());
          assert.ok(await page.locator('#workspace-assistant').isVisible());
        }

        if (phone) await page.getByRole('button', { name: /^章节目录/ }).click();
        await page.locator('.chapter-entry > button').nth(1).click();
        await page.locator('.tiptap').waitFor();
        if (phone) assert.equal(await page.locator('#chapter-directory-panel').isVisible(), false);

        // Keep the same editor mounted when switching panels and flush pending changes immediately.
        await page.locator('.tiptap').fill(`手机编辑检查 ${width}`);
        if (compact) {
          await changePanel('AI 助手');
          await page.getByRole('button', { name: '回放已有章节（非实时生成）' }).click();
          await changePanel('作品');
          assert.equal(await page.locator('.tiptap').innerText(), `手机编辑检查 ${width}`);
          await changePanel('AI 助手');
          await page.getByText('示例回放完成 · 已有文字，非实时 AI 生成', { exact: true }).waitFor();
          await page.getByRole('button', { name: '返回章节', exact: true }).click();
          assert.ok(await page.locator('.tiptap').isVisible()); // includes same-view navigation
        }
        await page.reload();
        await page.locator('.tiptap').waitFor();
        assert.equal(await page.locator('.tiptap').innerText(), `手机编辑检查 ${width}`);

        for (const [label, heading] of [['人物', '人物管理'], ['世界观', '世界观设定'], ['设置', '模型设置']]) {
          if (compact) await changePanel('书架');
          await page.getByRole('button', { name: label, exact: true }).click();
          await page.getByRole('heading', { name: heading, exact: true }).waitFor();
          await assertLayout();
        }
        if (compact) await changePanel('书架');
        await page.getByRole('button', { name: '大纲', exact: true }).click();
        assert.ok((await page.locator('.outline-workspace > .min-h-0').boundingBox()).height > 48, `${width}: synopsis squeezed out outline`);
        await assertLayout();
        if (compact) await changePanel('AI 助手');
        await page.getByRole('button', { name: '配置自己的 API', exact: true }).click();
        await page.getByRole('heading', { name: '模型设置', exact: true }).waitFor();
        if (compact) await changePanel('书架');
        await page.getByRole('button', { name: '章节', exact: true }).click();
        await page.locator('.tiptap').waitFor();
        await page.getByRole('button', { name: '导出', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        const dialogBounds = await dialog.boundingBox();
        assert.ok(dialogBounds.x >= -1 && dialogBounds.x + dialogBounds.width <= width + 1, `${width}: export dialog clipped`);
        await page.getByLabel('导出范围', { exact: true }).selectOption('chapter');
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: '下载文件', exact: true }).click();
        assert.ok((await download).suggestedFilename().endsWith('.txt'));
        await dialog.waitFor({ state: 'hidden' });

        if (phone) {
          await page.getByLabel('正文排版设置', { exact: true }).click();
          const prefs = await page.locator('.editor-preferences-panel').boundingBox();
          assert.ok(prefs.x >= -1 && prefs.x + prefs.width <= width + 1, `${width}: editor preferences clipped`);
          await page.getByLabel('正文排版设置', { exact: true }).click();
        }
        await assertLayout();
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, `workspace-${width}x${height}.png`) });
        }
        // Resizing while a secondary panel is selected must restore all desktop panels.
        if (compact) {
          await changePanel('AI 助手');
          await page.setViewportSize({ width: 1680, height: 1050 });
          assert.ok(await page.locator('.tiptap').isVisible());
          assert.ok(await page.locator('#workspace-bookshelf').isVisible());
          await page.setViewportSize({ width, height });
          await changePanel('作品');
          await assertLayout();
        }
        assert.deepEqual(errors, [], `${width}: runtime errors`);
        results.push(`${width}x${height}: passed`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ url: base, results }));
  } finally { await browser.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
