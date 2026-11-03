// The identical article workflow runs against full and Pages builds with mocked BYOK traffic.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, readFileSync } = require('node:fs');
const fixture = require('../src/demo/tideMemory.json');
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
        let responseMode = 'normal', failOnRequest = 0;
        await context.addInitScript(({ fixture, isDemo, source }) => {
          if (sessionStorage.getItem('reference-test-initialized')) return;
          sessionStorage.setItem('reference-test-initialized', 'yes');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-settings'), JSON.stringify({ version: 1, state: {
            apiProvider: 'custom', protocol: 'openai', baseUrl: 'https://model.example.test/v1', apiKey: 'TEST_PLACEHOLDER', authMode: 'bearer', model: 'test-model', temperature: .7, sendTemperature: false, maxTokens: 8192, timeoutSeconds: 30, tokenParameter: 'auto', stream: false, extraBody: '', extraHeaders: '', profiles: {},
          } }));
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, sessions: [], currentNovelId: null, currentChapterId: null, currentView: 'reference' } }));
          localStorage.setItem(`${key('novel-agent-reference')}:${isDemo ? 'browser' : 'test-user'}`, JSON.stringify({ version: 1, currentId: 'legacy-reference', projects: [{ id: 'legacy-reference', title: '旧版参考资料', source, sourceHash: 'legacy-hash', createdAt: 1, updatedAt: 1, style: '原有文风卡', methods: '', brief: { topic: '', audience: '', title: '', requirements: '', min: 800, max: 1200, mode: 'both' }, outline: '', imports: [] }] }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
          }
        }, { fixture, isDemo, source });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://model.example.test/**', async route => {
          const payload = route.request().postDataJSON(); requests.push(payload);
          if (requests.length === failOnRequest) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '模拟批次服务中断' } }) }); return; }
          if (responseMode === 'delay') { await new Promise(resolve => setTimeout(resolve, 1000)); try { await route.abort(); } catch {} return; }
          let content;
          const input = JSON.parse(payload.messages[1].content);
          if (input.paragraphs) content = responseMode === 'invalid' ? '{"summary":' : JSON.stringify({
            summary: '用环境细节建立安静的叙事节奏。', audience: '文本推断：日常故事读者。', style: '短句，第三人称，以物象承载情绪。', methods: '开场设问，经过转折，结尾回应。', structure: input.paragraphs.map(p => ({ paragraphId: p.id, role: '推进内容', technique: '环境描写' })), evidence: [{ paragraphId: input.paragraphs[0].id, quote: input.paragraphs[0].text.slice(0, 30), conclusion: '以环境开场。' }], limitations: ['仅依据所选文章，不代表真实阅读数据。'],
          });
          else if (input.summaries) content = JSON.stringify({ summary: '综合各批次后的叙事节奏与变化。', audience: '文本推断：小说读者', style: '克制、用细节推进。', methods: '设置悬念，推进，回应。', limitations: ['仅覆盖所选范围，模型判断可能有误。'] });
          else content = input.confirmedOutline ? draft + '\n【新稿结束】' : '先描绘海岛观测站，再写仪器故障，最后通过合作完成观测。';
          if (responseMode === 'missing-card' && input.paragraphs) { const report = JSON.parse(content); delete report.style; content = JSON.stringify(report); }
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
        const readWorkspace = () => page.evaluate(async key => {
          const database = await new Promise((resolve, reject) => { const request = indexedDB.open('novel-agent-reference-library-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
          try { return await new Promise((resolve, reject) => { const transaction = database.transaction('workspaces'); const request = transaction.objectStore('workspaces').get(key); transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error); }); }
          finally { database.close(); }
        }, referenceKey);
        const stored = async () => { const workspace = await readWorkspace(); return workspace.projects.find(project => project.id === workspace.currentId); };
        const novelState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        const button = name => page.getByRole('button', { name, exact: true });
        const waitIdle = () => page.waitForFunction(() => !document.querySelector('fieldset[disabled]'));
        await page.goto(base);
        await page.getByRole('heading', { name: '参考创作', exact: true }).waitFor();
        assert.equal(await page.locator('#workspace-assistant').isVisible(), false);
        if (width < 1280) assert.equal(await button('AI 助手').count(), 0);
        // Recover a complete legacy response rejected only because cards were objects, without a paid call.
        await page.evaluate(async ({ key, source }) => {
          const database = await new Promise(resolve => { const request = indexedDB.open('novel-agent-reference-library-v1', 1); request.onsuccess = () => resolve(request.result); });
          const workspace = await new Promise(resolve => { const request = database.transaction('workspaces').objectStore('workspaces').get(key); request.onsuccess = () => resolve(request.result); });
          workspace.projects[0].lastAttempt = { stage: '分析文章', error: '文风卡缺失或过长', at: Date.now(), text: JSON.stringify({ summary: '环境开场', audience: '文本推断', style: { 视角: '第三人称', 句式: ['短句', '长短交替'] }, methods: ['铺垫', '回应'], structure: source.split('\n\n').map((text, index) => ({ paragraphId: `P${index + 1}`, role: '描写', technique: '细节' })), evidence: [{ paragraphId: 'P1', quote: '清晨的雨落在窗台', conclusion: '环境开场' }], limitations: [] }) };
          await new Promise((resolve, reject) => { const transaction = database.transaction('workspaces', 'readwrite'); transaction.objectStore('workspaces').put(workspace, key); transaction.oncomplete = resolve; transaction.onerror = reject; }); database.close();
        }, { key: referenceKey, source });
        await page.reload();
        await page.locator('summary').filter({ hasText: '上次分析文章未完成' }).click();
        await button('重新解析保留结果（不调用模型）').click(); await waitIdle();
        assert.equal(requests.length, 0); assert.ok((await stored()).report.style.includes('视角：第三人称'));
        await button('查看或复用分析').click(); await waitIdle(); assert.equal(requests.length, 0);
        await button('新参考文').click();
        assert.equal(await page.evaluate(key => localStorage.getItem(key), referenceKey), null);
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
        await page.getByLabel('参考导入目标作品', { exact: true }).selectOption(fixture.novels[0].id);
        await page.getByLabel('参考导入章节标题', { exact: true }).fill(fixture.chapters[0].title);
        await button('确认新增一章').click(); await waitIdle();
        assert.equal((await novelState()).chapters.length, before.chapters.length);
        await page.getByLabel('参考导入章节标题', { exact: true }).fill('海岛观测');
        await button('确认新增一章').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key)).state.chapters.length === count, { key: key('novel-agent-storage'), count: before.chapters.length + 1 });
        await button('预览导入小说').click(); await page.getByLabel('参考导入目标作品', { exact: true }).selectOption(fixture.novels[0].id); await button('确认新增一章').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal((await novelState()).chapters.length, before.chapters.length + 1);
        // Failed/cancelled reanalysis keeps the earlier report and draft.
        responseMode = 'invalid'; await button('重新分析（再次调用）').click(); await waitIdle();
        assert.equal((await stored()).report.evidence[0].verified, true); assert.equal((await stored()).draft.text, draft);
        assert.ok((await stored()).lastAttempt.text.includes('summary'));
        responseMode = 'missing-card'; await button('重新分析（再次调用）').click(); await waitIdle();
        assert.ok((await stored()).report.style); assert.ok((await stored()).lastAttempt.error.includes('未返回文风卡'));
        responseMode = 'delay';
        assert.equal(await button('重新分析（再次调用）').evaluate(element => { element.click(); return Boolean(document.querySelector('fieldset[disabled]')) && document.body.textContent.includes('准备分析范围'); }), true);
        await button('取消当前调用').click(); await waitIdle();
        assert.equal((await stored()).draft.text, draft);
        await page.reload(); await button('新主题创作').waitFor(); await button('新主题创作').click();
        assert.equal(await page.getByLabel('新稿正文', { exact: true }).inputValue(), draft);
        assert.equal((await novelState()).chapters.length, before.chapters.length + 1);
        // A whole book can be saved independently of analysis limits and the selected scope.
        responseMode = 'normal';
        const book = Array.from({ length: 10 }, (_, chapter) => [`第${chapter + 1}章 远海`, ...Array.from({ length: 20 }, (_, paragraph) => `第${chapter}-${paragraph}段：` + '海面上的微光映照着船舱，人物在不同的时刻作出选择。'.repeat(8))].join('\n\n')).join('\n\n');
        assert.ok(Array.from(book).length > 20000);
        await button('新参考文').click();
        await page.getByLabel('选择参考文件', { exact: true }).setInputFiles({ name: '长篇小说.txt', mimeType: 'text/plain', buffer: Buffer.from(book) });
        await page.waitForFunction(text => document.querySelector('textarea[aria-label="参考原文输入"]')?.value === text, book);
        const initialCalls = requests.length;
        await button('保存参考文（不调用模型）').click(); await waitIdle();
        assert.equal(requests.length, initialCalls);
        assert.equal((await stored()).source, book);
        assert.equal(await page.locator('[id^="reference-P"]').count(), 60);
        await button('原文下一页').click(); assert.ok(await page.locator('#reference-P61').isVisible());
        await page.getByLabel('分析章节', { exact: true }).selectOption('1');
        await button('开始分析文章').click(); await waitIdle();
        assert.equal(requests.length, initialCalls + 1);
        assert.ok(JSON.parse(requests.at(-1).messages[1].content).paragraphs.every(p => Number(p.id.slice(1)) >= 22 && Number(p.id.slice(1)) <= 42));
        assert.deepEqual((await stored()).analyzedRange, { from: 22, to: 42 });
        await button('分析完整作品').click();
        const budget = Number((await page.getByText(/本次只发送 P/).textContent()).match(/最多 (\d+) 次模型调用/)[1]);
        const beforeBlocked = requests.length;
        await button('开始分析文章').click(); await waitIdle(); assert.equal(requests.length, beforeBlocked);
        await page.getByLabel('确认批量分析费用', { exact: true }).check();
        failOnRequest = requests.length + 2;
        await button('开始分析文章').click(); await waitIdle();
        assert.equal(requests.length, failOnRequest);
        assert.ok((await stored()).lastAttempt.error);
        assert.equal(Object.keys((await stored()).analysisCache).length, 2);
        await page.reload(); await page.getByLabel('确认批量分析费用', { exact: true }).waitFor();
        await page.getByLabel('确认批量分析费用', { exact: true }).check();
        const beforeResume = requests.length;
        await button('开始分析文章').click(); await waitIdle();
        assert.equal(requests.length - beforeResume, budget - 1);
        assert.equal((await stored()).report.structure.length, 210);
        assert.deepEqual((await stored()).analyzedRange, { from: 1, to: 210 });
        assert.equal(await page.locator('tbody tr').count(), 100);
        await button('结构下一页').click(); assert.equal(await page.locator('tbody tr').count(), 100);
        await page.getByRole('button', { name: /^定位 P/ }).last().click();
        assert.ok(Number((await page.locator('[id^="reference-P"]').first().getAttribute('id')).split('-P')[1]) > 1);
        await button('导出完整原文备份').click({ trial: true });
        const backup = page.waitForEvent('download'); await button('导出完整原文备份').click();
        assert.equal(readFileSync(await (await backup).path(), 'utf8').replace(/^\uFEFF/, ''), book);
        await page.getByRole('button', { name: '分析报告', exact: true }).click();
        await page.getByLabel('参考导出内容', { exact: true }).selectOption('report');
        await page.getByLabel('参考导出格式', { exact: true }).selectOption('docx');
        const longReport = page.waitForEvent('download'); await button('导出所选内容').click();
        const longReportFile = await longReport;
        if (process.env.REFERENCE_ARTIFACT_DIR) await longReportFile.saveAs(resolve(process.env.REFERENCE_ARTIFACT_DIR, `${mode}-${width}-长文分析报告.docx`));
        await waitIdle();
        // A failed IndexedDB write must remain visibly unsaved and be recoverable without dropping edits.
        await page.evaluate(() => { window.originalReferenceTransaction = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function(...args) { if (args[1] === 'readwrite') throw new DOMException('模拟空间不足', 'QuotaExceededError'); return window.originalReferenceTransaction.apply(this, args); }; });
        await button('文风与方法卡').click(); await page.getByLabel('文风卡', { exact: true }).fill('存储失败时保留在页面的文风卡');
        await page.getByRole('alert').filter({ hasText: '参考资料未保存' }).waitFor();
        assert.equal(await page.getByLabel('文风卡', { exact: true }).inputValue(), '存储失败时保留在页面的文风卡');
        await page.evaluate(() => { IDBDatabase.prototype.transaction = window.originalReferenceTransaction; });
        await button('重试保存').click();
        await page.getByRole('alert').filter({ hasText: '参考资料未保存' }).waitFor({ state: 'hidden' });
        await page.getByRole('status').filter({ hasText: '参考资料库已就绪' }).waitFor();
        await page.getByLabel('结构方法卡', { exact: true }).fill('快速修改的中间版本');
        await page.getByLabel('结构方法卡', { exact: true }).fill('快速修改的最终版本');
        await page.getByRole('status').filter({ hasText: '参考资料库已就绪' }).waitFor();
        await page.reload(); await button('文风与方法卡').click();
        await page.waitForFunction(() => document.querySelector('textarea[aria-label="文风卡"]')?.value === '存储失败时保留在页面的文风卡');
        assert.equal(await page.getByLabel('结构方法卡', { exact: true }).inputValue(), '快速修改的最终版本');
        assert.equal((await novelState()).chapters.length, before.chapters.length + 1);
        assert.ok((await readWorkspace()).projects.find(project => project.id === 'legacy-reference').style.includes('视角：第三人称'));
        // Corrupt IndexedDB records must not be silently replaced with an empty library.
        const healthyWorkspace = await readWorkspace();
        const writeWorkspace = data => page.evaluate(async ({ key, data }) => {
          const database = await new Promise(resolve => { const request = indexedDB.open('novel-agent-reference-library-v1', 1); request.onsuccess = () => resolve(request.result); });
          try { await new Promise((resolve, reject) => { const transaction = database.transaction('workspaces', 'readwrite'); transaction.objectStore('workspaces').put(data, key); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); }
          finally { database.close(); }
        }, { key: referenceKey, data });
        await writeWorkspace({ version: 999, projects: [] }); await page.reload();
        await page.getByRole('alert').filter({ hasText: '参考资料无法读取' }).waitFor();
        assert.equal((await readWorkspace()).version, 999);
        await writeWorkspace(healthyWorkspace); await page.reload(); await button('文风与方法卡').click();
        if (isDemo) assert.deepEqual(backendRequests, []);
        assert.ok(!backendRequests.some(path => /\/api\/reference(?:[\/-]|$)/.test(path)));
        assert.deepEqual(errors, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (process.env.REFERENCE_ARTIFACT_DIR) await page.screenshot({ path: resolve(process.env.REFERENCE_ARTIFACT_DIR, `${mode}-${width}.png`), fullPage: true });
        results.push(`${width}px: article workflow, legacy migration, long-book import, chapter scope, paged source/report, bounded batch consent, failure/resume without repeated calls, full backup, long Word report, IndexedDB quota recovery, reload`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
