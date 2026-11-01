// The identical article workflow runs against full and Pages builds with mocked BYOK traffic.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, readFileSync } = require('node:fs');
const fixture = require('../src/demo/lingShiOrigin.json');
const isDemo = (process.env.PARITY_MODE || 'demo') === 'demo';
const mode = isDemo ? 'demo' : 'full';
const base = process.env.PARITY_URL || `http://127.0.0.1:5183${isDemo ? '/noval-agent/' : '/'}`;
const key = name => isDemo ? `${name}-demo-v1` : name;
const referenceKey = `${key('novel-agent-reference')}:${isDemo ? 'browser' : 'test-user'}`;
const source = ['清晨的雨落在窗台，小路通向一座还没开门的旧书店。'.repeat(4), '午后的灯亮起来，守店人把书页抚平，故事在安静中收尾。'.repeat(4), '【角色】来源标签只作原文，不应同步到作品【/角色】<script>throw new Error("source executed")</script>'].join('\n\n');
const draft = '星光越过海面，新的观测记录在此展开。'.repeat(35);

(async () => {
  const server = process.env.PARITY_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5183', '--strictPort'], {
    cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' },
  });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* Await own preview. */ }
      if (attempt === 60) throw new Error('Preview did not start');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), ...(process.env.PARITY_URL ? { args: ['--disable-http2'] } : {}) });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      try {
        const data = structuredClone(fixture), requests = [], backendRequests = [], errors = [];
        let responseMode = 'normal';
        await context.addInitScript(({ fixture, isDemo }) => {
          if (sessionStorage.getItem('reference-test-initialized')) return;
          sessionStorage.setItem('reference-test-initialized', 'yes');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-settings'), JSON.stringify({ version: 1, state: {
            apiProvider: 'custom', protocol: 'openai', baseUrl: 'https://model.example.test/v1', apiKey: 'TEST_PLACEHOLDER', authMode: 'bearer', model: 'test-model', temperature: .7, sendTemperature: false, maxTokens: 8192, timeoutSeconds: 30, tokenParameter: 'auto', stream: false, extraBody: '', extraHeaders: '', profiles: {},
          } }));
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, sessions: [], currentNovelId: null, currentChapterId: null, currentView: 'reference' } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
          }
        }, { fixture, isDemo });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://model.example.test/**', async route => {
          const payload = route.request().postDataJSON(); requests.push(payload);
          if (responseMode === 'delay') { await new Promise(resolve => setTimeout(resolve, 1000)); try { await route.abort(); } catch {} return; }
          let content;
          const input = JSON.parse(payload.messages[1].content);
          if (input.paragraphs) content = responseMode === 'invalid' ? '{"summary":' : JSON.stringify({
            summary: '用环境细节建立安静的叙事节奏。', audience: '文本推断：日常故事读者。', style: '短句，第三人称，以物象承载情绪。', methods: '开场设问，经过转折，结尾回应。', structure: input.paragraphs.map(p => ({ paragraphId: p.id, role: '推进内容', technique: '环境描写' })), evidence: [{ paragraphId: 'P1', quote: '清晨的雨落在窗台', conclusion: '以环境开场。' }], limitations: ['仅依据所选文章，不代表真实阅读数据。'],
          });
          else content = input.confirmedOutline ? draft + '\n【新稿结束】' : '先描绘海岛观测站，再写仪器故障，最后通过合作完成观测。';
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }) });
        });
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname, resource = path.split('/').at(-1);
          backendRequests.push(path);
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
          else if (request.method() === 'GET' && resources[resource]) body = { [resources[resource]]: data[resources[resource]] };
          else if (request.method() === 'POST' && resource === 'chapters') {
            const chapter = { ...request.postDataJSON(), id: 'server-reference-chapter', novelId: fixture.novels[0].id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; data.chapters.push(chapter); body = { chapter };
          } else if (request.method() === 'PUT') {
            const item = Object.values(data).flat().find(item => item.id === resource);
            Object.assign(item || {}, request.postDataJSON());
            body = { novel: item, chapter: item, plotCard: item, character: item, worldSetting: item, foreshadowing: item };
          } else throw new Error(`Unexpected backend request: ${request.method()} ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).projects[0], referenceKey);
        const novelState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        const button = name => page.getByRole('button', { name, exact: true });
        const waitIdle = () => page.waitForFunction(() => !document.querySelector('fieldset[disabled]'));
        await page.goto(base);
        await page.getByRole('heading', { name: '参考创作', exact: true }).waitFor();
        assert.equal(await page.locator('#workspace-assistant').isVisible(), false);
        if (width < 1280) assert.equal(await button('AI 助手').count(), 0);
        const before = await novelState();
        // Both pasted and file input are usable. Import/save never calls the model.
        await page.getByLabel('参考原文输入', { exact: true }).fill(source);
        await page.getByLabel('选择参考文件', { exact: true }).setInputFiles({ name: '参考文章.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
        await page.waitForFunction(expected => document.querySelector('textarea[aria-label="参考原文输入"]')?.value === expected, source);
        await button('保存参考文（不调用模型）').click();
        await button('开始分析文章').waitFor();
        assert.equal(requests.length, 0);
        await button('开始分析文章').click(); await page.getByRole('heading', { name: '文章分析报告' }).waitFor();
        assert.equal(requests.length, 1);
        assert.equal((await stored()).report.evidence[0].verified, true);
        await button('定位 P1').click();
        assert.ok((await page.locator('#reference-P1').getAttribute('class')).includes('ring-2'));
        await button('查看或复用分析').click(); await waitIdle();
        assert.equal(requests.length, 1);
        await button('文风与方法卡').click(); await page.getByLabel('文风卡', { exact: true }).fill('短句，语气温和，以具体细节推进。');
        await button('新主题创作').click();
        await page.getByLabel('新主题', { exact: true }).fill('海岛上的天文观测');
        await page.getByLabel('新稿标题', { exact: true }).fill('海岛观测');
        await page.getByLabel('目标读者', { exact: true }).fill('青少年科幻读者');
        await page.getByLabel('最少字符', { exact: true }).fill('500'); await page.getByLabel('最多字符', { exact: true }).fill('1000');
        await button('生成新提纲').click();
        await page.waitForFunction(() => document.querySelector('textarea[aria-label="新提纲"]')?.value.includes('海岛观测站'));
        assert.equal(await button('按确认提纲生成新稿').isDisabled(), true);
        await page.getByLabel('确认新提纲', { exact: true }).check();
        await page.getByLabel('新主题', { exact: true }).fill('海岛上的联合观测');
        assert.equal(await page.getByLabel('确认新提纲', { exact: true }).isChecked(), false);
        await page.getByLabel('确认新提纲', { exact: true }).check();
        await button('按确认提纲生成新稿').click();
        await page.waitForFunction(() => document.querySelector('textarea[aria-label="新稿正文"]')?.value.includes('星光越过海面'));
        await waitIdle();
        assert.equal(requests.length, 3);
        assert.ok(requests.slice(1).every(request => !JSON.stringify(request).includes('清晨的雨落在窗台')));
        const afterGeneration = await novelState();
        assert.deepEqual(afterGeneration.chapters, before.chapters);
        assert.deepEqual(afterGeneration.characters, before.characters);
        assert.deepEqual(afterGeneration.worldSettings, before.worldSettings);
        // Completion cannot bypass length/placeholder/overlap checks.
        const editor = page.getByLabel('新稿正文', { exact: true });
        await editor.fill('太短了。'); await button('确认编辑完成').click();
        assert.equal(await button('预览导入小说').isDisabled(), true);
        await editor.fill(draft + '【待核实】'); await button('确认编辑完成').click();
        assert.equal(await button('预览导入小说').isDisabled(), true);
        await editor.fill(draft + source.slice(0, 40)); await button('确认编辑完成').click();
        assert.equal(await button('预览导入小说').isDisabled(), true);
        await editor.fill(draft); await button('确认编辑完成').click();
        assert.equal(await button('预览导入小说').isEnabled(), true);
        // Standalone exports do not need an active novel.
        for (const format of ['md', 'txt', 'docx']) {
          await page.getByLabel('参考导出格式', { exact: true }).selectOption(format);
          const pending = page.waitForEvent('download'); await button('导出所选内容').click(); const download = await pending;
          assert.ok(download.suggestedFilename().endsWith('.' + format));
          if (process.env.REFERENCE_ARTIFACT_DIR) { mkdirSync(process.env.REFERENCE_ARTIFACT_DIR, { recursive: true }); await download.saveAs(resolve(process.env.REFERENCE_ARTIFACT_DIR, `${mode}-${width}-${download.suggestedFilename()}`)); }
          if (format !== 'docx') assert.ok(!readFileSync(await download.path(), 'utf8').includes('清晨的雨落在窗台'));
          await waitIdle();
        }
        await page.getByLabel('参考导出内容', { exact: true }).selectOption('report');
        const reportDownload = page.waitForEvent('download'); await button('导出所选内容').click();
        const reportFile = await reportDownload;
        if (process.env.REFERENCE_ARTIFACT_DIR) await reportFile.saveAs(resolve(process.env.REFERENCE_ARTIFACT_DIR, `${mode}-${width}-分析报告.docx`));
        await waitIdle();
        await page.getByLabel('参考导出内容', { exact: true }).selectOption('draft');
        // Same-title conflicts stop, preview is explicit, successful imports are idempotent.
        await button('预览导入小说').click();
        await page.getByLabel('参考导入章节标题', { exact: true }).fill(fixture.chapters[0].title);
        await button('确认新增一章').click(); await waitIdle();
        assert.equal((await novelState()).chapters.length, before.chapters.length);
        await page.getByLabel('参考导入章节标题', { exact: true }).fill('海岛观测');
        await button('确认新增一章').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key)).state.chapters.length === count, { key: key('novel-agent-storage'), count: before.chapters.length + 1 });
        await button('预览导入小说').click(); await button('确认新增一章').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal((await novelState()).chapters.length, before.chapters.length + 1);
        // Failed/cancelled reanalysis keeps the earlier report and draft.
        responseMode = 'invalid'; await button('重新分析（再次调用）').click(); await waitIdle();
        assert.equal((await stored()).report.evidence[0].verified, true); assert.equal((await stored()).draft.text, draft);
        assert.ok((await stored()).lastAttempt.text.includes('summary'));
        responseMode = 'delay'; await button('重新分析（再次调用）').click(); await button('取消当前调用').click(); await waitIdle();
        assert.equal((await stored()).draft.text, draft);
        await page.reload(); await button('新主题创作').waitFor(); await button('新主题创作').click();
        assert.equal(await page.getByLabel('新稿正文', { exact: true }).inputValue(), draft);
        assert.equal((await novelState()).chapters.length, before.chapters.length + 1);
        if (isDemo) assert.deepEqual(backendRequests, []);
        assert.ok(!backendRequests.some(path => /\/api\/reference(?:[\/-]|$)/.test(path)));
        assert.deepEqual(errors, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (process.env.REFERENCE_ARTIFACT_DIR) await page.screenshot({ path: resolve(process.env.REFERENCE_ARTIFACT_DIR, `${mode}-${width}.png`), fullPage: true });
        results.push(`${width}px: standalone source, analysis/evidence/cache, cards, outline confirmation, draft validation, three exports, non-overwrite/idempotent import, failure/cancel, reload`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
