// Run against either production build. Every provider and backend request is mocked.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, readFileSync } = require('node:fs');
const fixture = require('../src/demo/tideMemory.json');

const mode = process.env.PARITY_MODE || 'demo';
const isDemo = mode === 'demo';
const base = process.env.PARITY_URL || `http://127.0.0.1:5216${isDemo ? '/noval-agent/' : '/'}`;
const key = name => isDemo ? `${name}-demo-v1` : name;
const secret = 'USAGE_TEST_SECRET';
const privatePrompt = 'PRIVATE_USAGE_PROMPT：只讨论文风，不修改正文。';
const partialText = '尚未写完的保留文字。';
const retryText = '重试后的完整回复。';
const countCharacters = value => Array.from(value).filter(character => !/\s/u.test(character)).length;

(async () => {
  const server = process.env.PARITY_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5216', '--strictPort'], {
    cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' },
  });
  let browser;
  try {
    if (server) {
      for (let attempt = 0; ; attempt++) {
        try { if ((await fetch(base)).ok) break; } catch { /* Wait for our preview. */ }
        if (attempt === 60) throw new Error('Usage preview did not start');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
      try {
        const page = await context.newPage();
        const data = structuredClone(fixture);
        const errors = [], backendRequests = [];
        let modelRequests = 0, replyMode = 'reported';
        page.on('pageerror', error => errors.push(error.message));
        await context.addInitScript(({ fixture, isDemo, secret }) => {
          if (sessionStorage.getItem('usage-regression-initialized')) return;
          sessionStorage.setItem('usage-regression-initialized', 'true');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.removeItem(key('novel-agent-usage'));
          localStorage.setItem(key('novel-agent-settings'), JSON.stringify({ version: 1, state: {
            apiProvider: 'custom', protocol: 'openai', baseUrl: 'https://usage-model.example.test/v1?client-key=PRIVATE_ENDPOINT_QUERY',
            apiKey: secret, authMode: 'bearer', model: 'usage-model', temperature: .7, sendTemperature: false,
            maxTokens: 256, timeoutSeconds: 30, tokenParameter: 'auto', stream: true,
            extraBody: '', extraHeaders: '{"X-Test-Private":"PRIVATE_HEADER_VALUE"}', profiles: {},
          } }));
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: {
            ...fixture, sessions: [], currentNovelId: fixture.novels[0].id,
            currentChapterId: fixture.chapters[0].id, currentView: 'chapters',
          } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
          }
        }, { fixture, isDemo, secret });
        await page.route('https://usage-model.example.test/**', async route => {
          assert.equal(route.request().method(), 'POST', 'Only explicit text requests should contact the provider');
          modelRequests++;
          if (replyMode === 'partial-failure') {
            await route.fulfill({ contentType: 'text/event-stream', body: [
              `data: ${JSON.stringify({ choices: [{ delta: { content: partialText }, finish_reason: null }] })}\n\n`,
              `data: ${JSON.stringify({ error: { message: `模拟请求失败 ${secret}` } })}\n\n`,
            ].join('') });
            return;
          }
          const content = replyMode === 'retry' ? retryText : replyMode === 'estimated' ? '估算回复' : 'OK';
          const response = { choices: [{ message: { content } }] };
          if (replyMode !== 'estimated') response.usage = { prompt_tokens: 1000, completion_tokens: 2000, total_tokens: 3000 };
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
        });
        await page.route('**/api/**', async route => {
          backendRequests.push(route.request().url());
          const path = new URL(route.request().url()).pathname;
          const resource = path.split('/').at(-1);
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
          else if (route.request().method() === 'GET' && resources[resource]) body = { [resources[resource]]: data[resources[resource]] };
          else throw new Error(`Unexpected backend request in usage flow: ${route.request().method()} ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.goto(base);
        await page.locator('.tiptap').waitFor();
        const readUsage = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"state":{"records":[],"periods":{}}}').state, key('novel-agent-usage'));
        const readNovel = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        const waitRecords = async (count, status) => {
          await page.waitForFunction(({ key, count, status }) => {
            const records = JSON.parse(localStorage.getItem(key) || '{"state":{"records":[]}}').state.records;
            return records.length === count && (!status || records.some(record => record.status === status)) && records.every(record => record.status !== 'running');
          }, { key: key('novel-agent-usage'), count, status });
          return (await readUsage()).records;
        };
        const panel = async label => {
          if (page.viewportSize().width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: label, exact: true }).click();
        };
        const settings = async () => {
          await panel('书架');
          await page.locator('#workspace-bookshelf').getByRole('button', { name: '设置', exact: true }).click();
          await page.getByRole('tab', { name: '调用与预算', exact: true }).waitFor();
        };
        const usageTab = async () => {
          await page.getByRole('tab', { name: '调用与预算', exact: true }).click();
          await page.getByRole('region', { name: 'AI 调用记录与预算', exact: true }).waitFor();
        };
        const configTab = async () => page.getByRole('tab', { name: '模型配置', exact: true }).click();
        const setPrice = async (currency, input, output) => {
          await usageTab();
          await page.getByLabel('单价服务商', { exact: true }).selectOption('custom');
          await page.getByLabel('单价协议', { exact: true }).selectOption('openai');
          await page.getByLabel('单价模型', { exact: true }).fill('usage-model');
          await page.getByLabel('单价币种', { exact: true }).selectOption(currency);
          await page.getByLabel('输入单价（每百万 tokens）', { exact: true }).fill(String(input));
          await page.getByLabel('输出单价（每百万 tokens）', { exact: true }).fill(String(output));
          await page.getByRole('button', { name: '保存模型单价', exact: true }).click();
          await page.waitForFunction(({ key, currency, input, output }) => JSON.parse(localStorage.getItem(key) || 'null')?.state.prices.some(price => price.model === 'usage-model' && price.currency === currency && price.inputPerMillion === input && price.outputPerMillion === output), { key: key('novel-agent-usage'), currency, input, output });
        };
        const setBudget = async (currency, mode, monthly = '', perCall = '') => {
          await usageTab();
          await page.getByLabel('预算币种', { exact: true }).selectOption(currency);
          await page.getByLabel('预算策略', { exact: true }).selectOption(mode);
          await page.getByLabel('每月预算', { exact: true }).fill(String(monthly));
          await page.getByLabel('单次预算', { exact: true }).fill(String(perCall));
          await page.getByRole('button', { name: '保存预算', exact: true }).click();
          await page.waitForFunction(({ key, currency, mode, monthly, perCall }) => {
            const budget = JSON.parse(localStorage.getItem(key)).state.budget;
            return budget.currency === currency && budget.mode === mode && budget.monthlyLimit === (monthly === '' ? undefined : Number(monthly)) && budget.perCallLimit === (perCall === '' ? undefined : Number(perCall));
          }, { key: key('novel-agent-usage'), currency, mode, monthly, perCall });
        };
        const connection = async (expectedCount, status = 'succeeded') => {
          await configTab();
          await page.getByRole('button', { name: '测试连接', exact: true }).click();
          return waitRecords(expectedCount, status);
        };
        const historyRow = id => page.locator(`[data-usage-record="${id}"]`);

        // The ledger starts empty; opening settings and pricing never dispatches a model request.
        assert.equal((await readUsage()).records.length, 0);
        await settings(); await usageTab();
        assert.equal(await page.locator('[data-usage-record]').count(), 0);
        await setPrice('CNY', 2, 4);
        assert.equal(modelRequests, 0);
        let records = await connection(1);
        assert.equal(modelRequests, 1);
        const reported = records[0];
        assert.equal(reported.operation, '连接测试');
        assert.equal(reported.provider, 'custom');
        assert.equal(reported.protocol, 'openai');
        assert.equal(reported.model, 'usage-model');
        assert.equal(reported.usageSource, 'reported');
        assert.deepEqual([reported.inputTokens, reported.outputTokens, reported.totalTokens], [1000, 2000, 3000]);
        assert.equal(reported.outputCharacters, 2);
        assert.equal(reported.dispatched, true);
        assert.ok(reported.endedAt >= reported.startedAt && reported.durationMs >= 0);
        assert.equal(reported.cost, .01);
        await usageTab();
        await historyRow(reported.id).getByText('总 tokens · 接口返回', { exact: true }).waitFor();

        // Price edits affect future calls; old estimates retain the exact price used then.
        await setPrice('CNY', 20, 40);
        records = (await readUsage()).records;
        assert.equal(records.find(record => record.id === reported.id).cost, .01);
        assert.equal(records.find(record => record.id === reported.id).price.inputPerMillion, 2);
        replyMode = 'estimated';
        records = await connection(2);
        const estimated = records.find(record => record.id !== reported.id);
        assert.equal(estimated.usageSource, 'estimated');
        assert.ok(estimated.inputTokens > 0 && estimated.outputTokens > 0 && estimated.cost > 0);
        assert.equal(estimated.outputCharacters, countCharacters('估算回复'));
        await usageTab();
        await historyRow(estimated.id).getByText('总 tokens · 文本估算', { exact: true }).waitFor();

        // Two currencies have independent aggregates; neither implies a conversion rate.
        await setPrice('USD', 1, 2);
        await setBudget('USD', 'off');
        replyMode = 'reported';
        records = await connection(3);
        const dollar = records.find(record => record.currency === 'USD');
        assert.equal(dollar.cost, .005);
        const currencies = await readUsage();
        const dollarMonth = Object.entries(currencies.periods).find(([key]) => key.startsWith('USD:month:'))[1];
        const yuanMonth = Object.entries(currencies.periods).find(([key]) => key.startsWith('CNY:month:'))[1];
        assert.equal(dollarMonth.cost, .005);
        assert.ok(Math.abs(yuanMonth.cost - (.01 + estimated.cost)) < 1e-10);

        // Hard limits reject before fetch. Missing pricing also blocks instead of inventing zero cost.
        await setBudget('CNY', 'block', .000001, .000001);
        const beforeBlockedFetches = modelRequests;
        records = await connection(4, 'blocked');
        const lowBudget = records.find(record => record.status === 'blocked');
        assert.equal(modelRequests, beforeBlockedFetches);
        assert.equal(lowBudget.dispatched, false);
        assert.equal(lowBudget.cost, 0);
        assert.equal(lowBudget.errorCode, 'budget_blocked');
        await setBudget('CNY', 'block', 100, 100);
        await configTab();
        await page.getByLabel('模型 ID', { exact: true }).fill('usage-unpriced');
        await page.getByRole('button', { name: '测试连接', exact: true }).click();
        records = await waitRecords(5, 'blocked');
        const unpriced = records.find(record => record.model === 'usage-unpriced');
        assert.equal(unpriced.status, 'blocked');
        assert.equal(unpriced.dispatched, false);
        assert.equal(modelRequests, beforeBlockedFetches);
        await page.getByLabel('模型 ID', { exact: true }).fill('usage-model');
        await setBudget('CNY', 'off');

        // A failed stream leaves one visible, persisted partial answer. Retrying is explicit.
        await panel('AI 助手');
        const input = page.locator('#workspace-assistant').getByPlaceholder('输入需求... (/help 查看命令)');
        await input.fill(privatePrompt);
        replyMode = 'partial-failure';
        await input.press('Enter');
        records = await waitRecords(6, 'failed');
        const failed = records.find(record => record.status === 'failed');
        assert.equal(modelRequests, beforeBlockedFetches + 1);
        assert.equal(failed.outputCharacters, countCharacters(partialText));
        await page.locator('#workspace-assistant').getByText(partialText, { exact: true }).waitFor();
        await page.getByRole('button', { name: '重试本次请求', exact: true }).waitFor();
        const oldMessages = (await readNovel()).sessions.flatMap(session => session.messages);
        const partial = oldMessages.find(message => message.generation?.callId === failed.id);
        assert.equal(partial.content, partialText);
        assert.equal(partial.syncStatus.state, 'partial');
        assert.equal(partial.generation.status, 'failed');
        const draft = '不要覆盖我还没发送的想法';
        await input.fill(draft);
        replyMode = 'retry';
        await page.getByRole('button', { name: '重试本次请求', exact: true }).click();
        records = await waitRecords(7);
        const retried = records.find(record => record.context.retryOf === failed.id);
        assert.ok(retried, 'Manual retry links to the previous billable attempt');
        assert.equal(retried.status, 'succeeded');
        assert.equal(modelRequests, beforeBlockedFetches + 2);
        assert.equal(await input.inputValue(), draft);
        const messages = (await readNovel()).sessions.flatMap(session => session.messages);
        assert.equal(messages.find(message => message.id === partial.id).content, partialText);
        assert.equal(messages.find(message => message.generation?.callId === retried.id).content, retryText);
        assert.equal(messages.filter(message => message.role === 'user' && message.content === privatePrompt).length, 2);
        assert.deepEqual((await readNovel()).chapters.filter(chapter => chapter.novelId === fixture.novels[0].id).map(chapter => chapter.content), fixture.chapters.map(chapter => chapter.content));

        // An explicit retry passes through the same preflight guard as a first attempt.
        await settings();
        await setBudget('CNY', 'block', .000001, .000001);
        await panel('AI 助手');
        await page.getByRole('button', { name: '重试本次请求', exact: true }).first().click();
        records = await waitRecords(8, 'blocked');
        const guardedRetry = records.find(record => record.context.retryOf === failed.id && record.status === 'blocked');
        assert.ok(guardedRetry, 'Retries must obey the current budget');
        assert.equal(guardedRetry.dispatched, false);
        assert.equal(modelRequests, beforeBlockedFetches + 2);

        // Reload restores the same attempts and never retries a provider on its own.
        await page.reload();
        await page.getByRole('navigation', { name: '工作区切换', includeHidden: true }).waitFor({ state: 'attached' });
        await panel('AI 助手');
        await page.locator('#workspace-assistant').getByText(partialText, { exact: true }).waitFor();
        await page.locator('#workspace-assistant').getByText(retryText, { exact: true }).waitFor();
        assert.equal(modelRequests, beforeBlockedFetches + 2);
        assert.equal((await readUsage()).records.length, 8);
        await settings(); await usageTab();
        await historyRow(failed.id).waitFor();
        assert.equal(await historyRow(failed.id).getAttribute('data-usage-status'), 'failed');
        await page.getByLabel('筛选调用状态', { exact: true }).selectOption('failed');
        assert.equal(await page.locator('[data-usage-record]').count(), 1);
        await page.getByLabel('筛选调用状态', { exact: true }).selectOption('all');
        await page.getByLabel('搜索模型或任务', { exact: true }).fill('usage-unpriced');
        assert.equal(await page.locator('[data-usage-record]').count(), 1);
        await page.getByLabel('搜索模型或任务', { exact: true }).fill('');

        // Exports are useful ledgers, without prompts, generated text, secrets, or private URLs.
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: '导出调用记录', exact: true }).click();
        const download = await downloadPromise;
        assert.ok(download.suggestedFilename().endsWith('.json'));
        const exportedText = readFileSync(await download.path(), 'utf8');
        const exported = JSON.parse(exportedText.replace(/^\uFEFF/, ''));
        assert.equal(exported.records.length, 8);
        for (const privateValue of [secret, 'PRIVATE_ENDPOINT_QUERY', 'PRIVATE_HEADER_VALUE', 'PRIVATE_USAGE_PROMPT', partialText, retryText, 'usage-model.example.test']) assert.ok(!exportedText.includes(privateValue), 'Usage export must omit private request/response information');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.getByRole('heading', { name: 'AI 调用记录与预算', exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `usage-${mode}-${width}.png`) });
          await page.locator('[data-usage-record]').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `usage-history-${mode}-${width}.png`) });
        }
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 568 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Usage forms must fit a 320px phone');
          for (const label of ['单价模型', '每月预算', '搜索模型或任务']) {
            const box = await page.getByLabel(label, { exact: true }).boundingBox();
            assert.ok(box.width > 40 && box.x >= 0 && box.x + box.width <= 321, `${label} exceeds the phone width`);
          }
          if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `usage-${mode}-320.png`) });
          await page.setViewportSize({ width, height: 1000 });
        }

        // Clearing visible history never silently replenishes a monetary budget.
        const periodsBeforeClear = (await readUsage()).periods;
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: '清空调用记录', exact: true }).click();
        await waitRecords(0);
        assert.deepEqual((await readUsage()).periods, periodsBeforeClear);
        await setBudget('CNY', 'block', .000001, .000001);
        await connection(1, 'blocked');
        assert.equal(modelRequests, beforeBlockedFetches + 2);
        assert.deepEqual((await readUsage()).periods, periodsBeforeClear);
        assert.deepEqual(errors, []);
        if (isDemo) assert.deepEqual(backendRequests, []);
        results.push(`${width}px: reported/estimated usage, price snapshots, currency isolation, pre-fetch budget blocks, partial-stream retry, reload, private export, retained spending${width === 390 ? ', 320px layout' : ''}`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
