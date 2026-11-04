// Product commands against an ephemeral local provider. No external or paid model calls.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');

const mode = process.env.PARITY_MODE || 'demo', isDemo = mode === 'demo';
const previewPort = 5240, modelPort = 5241;
const base = process.env.PARITY_URL || `http://127.0.0.1:${previewPort}${isDemo ? '/noval-agent/' : '/'}`;
const key = name => isDemo ? `${name}-demo-v1` : name;
const novelId = 'slash-command-book', currentId = 'slash-command-chapter-2', sessionId = 'slash-command-session';
const at = 1730000000000;
const titles = ['约定', '雨夜教室', '走廊', '停电', '钟楼目击', '归队'];
const initialMessages = Array.from({ length: 10 }, (_, index) => [
  { id: `slash-old-user-${index}`, role: 'user', content: `历史需求${index}：保留角色动机与已确定的事实。`, timestamp: at + index * 2 },
  { id: `slash-old-assistant-${index}`, role: 'assistant', content: `历史回复${index}：先明确这段场景的目标。`, timestamp: at + index * 2 + 1 },
]).flat();
const fixture = {
  novels: [{ id: novelId, title: '斜杠命令回归样本', wordCount: 300, status: 'writing', summary: '校园群像，林夏与朋友共同调查。', createdAt: at, updatedAt: at }],
  chapters: titles.map((title, index) => ({ id: `slash-command-chapter-${index + 1}`, novelId, title,
    content: `<p>${index === 1 ? 'CURRENT_COMMAND_CHAPTER：<strong>林夏</strong>拿着蓝色雨伞走进教室。' : `CHAPTER_${index + 1}_COMMAND_SOURCE：林夏记录这一晚的普通行动。`}</p>`,
    sequence: index + 1, wordCount: 50, createdAt: at, updatedAt: at })),
  characters: [
    { id: 'slash-zhouqiao', novelId, name: '周桥', aliases: [], role: 'supporting', description: '负责核对时间的同学。', relationships: [] },
    { id: 'slash-linxia', novelId, name: '林夏', aliases: ['小夏'], role: 'protagonist', description: '谨慎、固执的高中生。', personality: '希望保护朋友。', relationships: [] },
  ],
  worldSettings: [{ id: 'slash-world', novelId, title: '夜间规则', category: '校园', content: '十点后不要独自进入钟楼。' }],
  plotCards: titles.map((title, index) => ({ id: `slash-plot-${index + 1}`, novelId, type: 'chapter', title, summary: `记录${title}的具体行动。`, sequence: index + 1, status: 'completed', chapterId: `slash-command-chapter-${index + 1}`, createdAt: at, updatedAt: at })),
  foreshadowings: [],
  sessions: [
    { id: sessionId, novelId, agentType: 'master', title: '已有对话', messages: initialMessages, createdAt: at, updatedAt: at },
    { id: 'slash-other-session', novelId: 'slash-other-book', agentType: 'master', title: '另一部作品的对话', messages: [{ id: 'slash-other-message', role: 'user', content: '保留另一部作品的资料。', timestamp: at }], createdAt: at, updatedAt: at },
  ],
};
const modelConfig = configured => ({ apiProvider: 'custom', protocol: 'openai', baseUrl: `http://127.0.0.1:${modelPort}/v1`, apiKey: 'SLASH_TEST_PLACEHOLDER', authMode: 'bearer', model: configured ? 'slash-test-model' : '', temperature: .7, sendTemperature: false, maxTokens: 4096, timeoutSeconds: 30, tokenParameter: 'auto', stream: true, extraBody: '', extraHeaders: '', profiles: {} });
const reply = '命令请求已收到。本回复只用于模拟接口测试，不改动作品内容。';
const continuationTail = 'CONTINUATION_TAIL_APPENDED：' + '窗外的雨水沿着玻璃往下流，林夏把听见的脚步声记在本子上。她先核对时钟，再让周桥站在门边，两人约好每过一分钟互相回应。'.repeat(3);
const continuationWrite = `【章节】\n标题：雨夜教室\n内容：${continuationTail}\n【/章节】`;
const safePolishWrite = '【修改】\n目标：章节\n标题：雨夜教室\n原内容：拿着蓝色雨伞\n新内容：握着蓝色雨伞\n【/修改】';
const checkWriteBlock = '【章节】\n标题：雨夜教室\n内容：CHECK_OUTPUT_MUST_NOT_REPLACE_SOURCE。' + '这是一段故意返回的结构化正文，应被检查命令的只读策略拦住。'.repeat(8) + '\n【/章节】';
const outOfScopeWrite = '【修改】\n目标：章节\n标题：雨夜教室\n原内容：握着蓝色雨伞\n新内容：抱着蓝色雨伞\n【/修改】\n【修改】\n目标：章节\n标题：约定\n原内容：林夏记录这一晚的普通行动。\n新内容：越界改动不应写入。\n【/修改】';
const partial = 'CHECK_PARTIAL_RETAINED：已经发现一处需要核对的时间线。';
const slowText = 'REWRITE_PARTIAL_RETAINED：林夏推开门，看见桌上的雨伞。';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sse = content => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`;
async function until(condition, message, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) { if (await condition()) return; await delay(50); }
  throw new Error(message);
}

(async () => {
  let active;
  const provider = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      let raw = ''; for await (const chunk of request) raw += chunk;
      if (!active || request.method !== 'POST' || !request.url.includes('/chat/completions')) throw new Error('Unexpected slash mock request');
      active.requests.push(JSON.parse(raw));
      if (active.replyMode === 'slow') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });
        response.flushHeaders(); response.write(sse(slowText)); active.slowResponse = response;
      } else if (active.replyMode === 'fail') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        response.write(sse(partial)); response.end(`data: ${JSON.stringify({ error: { message: '本地模拟中断，可主动重试' } })}\n\n`);
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: active.replyText || reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 400, completion_tokens: 100, total_tokens: 500 } }));
      }
    } catch (error) { active?.errors.push(error.message); response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: error.message } })); }
  });
  await new Promise((resolve, reject) => { provider.once('error', reject); provider.listen(modelPort, '127.0.0.1', resolve); });
  const server = process.env.PARITY_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
    cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' },
  });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* Wait for this test's preview. */ }
      if (attempt === 60) throw new Error('Slash preview did not start');
      await delay(200);
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 1280, acceptDownloads: true });
      let page;
      try {
        page = await context.newPage(); active = { requests: [], errors: [], replyMode: 'normal', replyText: reply, slowResponse: null };
        const data = structuredClone(fixture), errors = [], backendRequests = [], dialogs = [];
        let confirmDecision = 'accept';
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); if (confirmDecision === 'dismiss') await dialog.dismiss(); else await dialog.accept(); });
        await context.addInitScript(({ fixture, isDemo, config }) => {
          if (sessionStorage.getItem('slash-initialized')) return;
          sessionStorage.setItem('slash-initialized', 'true');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-settings'), JSON.stringify({ version: 1, state: config }));
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, currentNovelId: fixture.novels[0].id, currentChapterId: 'slash-command-chapter-2', currentView: 'chapters' } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-migrated', 'true'); localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'slash-user', nickname: '命令测试用户', email: 'slash@example.test' } } }));
          }
        }, { fixture, isDemo, config: modelConfig(false) });
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname, resource = path.split('/').at(-1);
          backendRequests.push(path);
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'slash-user', nickname: '命令测试用户', email: 'slash@example.test' } };
          else if (request.method() === 'GET' && resources[resource]) {
            const requestedNovel = path.includes('/novels/') ? path.split('/').at(-2) : null;
            body = { [resources[resource]]: requestedNovel && resource !== 'novels' ? data[resources[resource]].filter(row => row.novelId === requestedNovel) : data[resources[resource]] };
          } else if (request.method() === 'PUT') {
            const item = Object.values(data).flat().find(row => row.id === resource); Object.assign(item || {}, request.postDataJSON());
            body = { novel: item, chapter: item, character: item, plotCard: item, worldSetting: item };
          } else throw new Error(`Unexpected slash backend request: ${request.method()} ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const assistant = page.locator('#workspace-assistant');
        const input = () => assistant.getByRole('textbox', { name: 'AI 创作需求', exact: true });
        const trigger = () => assistant.getByRole('button', { name: '斜杠命令', exact: true });
        const menu = () => page.getByRole('listbox', { name: '命令菜单', exact: true });
        const completionPainted = async () => {
          await menu().waitFor({ state: 'hidden' });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        };
        const readState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        const messages = async () => (await readState()).sessions.find(row => row.id === sessionId)?.messages || [];
        const show = async label => { if (page.viewportSize().width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: label, exact: true }).click(); };
        const openChat = async () => {
          await show('AI 助手');
          const entry = assistant.getByRole('button', { name: '本地命令与对话', exact: true });
          if (isDemo) {
            await until(async () => await entry.count() > 0 || await input().count() > 0, 'Demo assistant entry did not load');
            if (await entry.count()) await entry.click();
          }
          await input().waitFor();
        };
        const selectChapter = async title => {
          await show('书架'); await page.getByRole('button', { name: '章节', exact: true }).click(); await show('作品');
          const toggle = page.locator('.chapter-directory-toggle');
          if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
          await page.locator('.chapter-entry').getByRole('button').filter({ has: page.getByText(title, { exact: true }) }).click();
          await openChat();
        };
        const send = async text => { await input().fill(text); assert.equal(await input().inputValue(), text); await assistant.getByRole('button', { name: '发送需求', exact: true }).click(); };
        const latestSystem = async () => [...await messages()].reverse().find(row => row.role === 'system')?.content || '';
        const settled = async count => { await until(() => active.requests.length === count, 'Mock provider count did not match'); await assistant.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden' }); await page.waitForFunction(key => { const records = JSON.parse(localStorage.getItem(key) || '{"state":{"records":[]}}').state.records; return records.every(row => row.status !== 'running'); }, key('novel-agent-usage')); };

        await page.goto(base); await page.locator('.tiptap').waitFor(); await openChat();
        if (isDemo) {
          await assistant.getByRole('button', { name: '返回示例回放', exact: true }).click();
          await assistant.getByRole('button', { name: '回放已有章节（非实时生成）', exact: true }).waitFor();
          await assistant.getByRole('button', { name: '本地命令与对话', exact: true }).click(); await input().waitFor();
        }
        const originalMessages = await messages(), originalChapters = (await readState()).chapters.filter(row => row.novelId === novelId);
        await trigger().click(); await menu().waitFor();
        assert.ok(await menu().getByRole('option').count() >= 12, 'Command menu exposes local and AI commands');
        assert.equal(active.requests.length, 0);
        await input().press('Escape'); await menu().waitFor({ state: 'hidden' }); assert.equal(await input().evaluate(element => document.activeElement === element), true);

        await input().fill('/sta'); await menu().waitFor();
        await input().evaluate(element => { element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '状' })); element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 229, isComposing: true })); element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '状' })); });
        assert.equal(await input().inputValue(), '/sta'); assert.equal(active.requests.length, 0);
        await input().press('Tab'); await completionPainted(); assert.match(await input().inputValue(), /^\/status\s/); assert.equal(active.requests.length, 0);
        await assistant.getByRole('button', { name: '发送需求', exact: true }).click(); await until(async () => (await latestSystem()).includes('模型'), 'Offline status did not execute');
        await input().fill('/'); await menu().waitFor();
        const beforeActive = await input().getAttribute('aria-activedescendant'); await input().press('ArrowDown');
        assert.notEqual(await input().getAttribute('aria-activedescendant'), beforeActive);
        await input().press('Enter'); await completionPainted(); assert.match(await input().inputValue(), /^\/[a-z]+\s/); assert.equal(active.requests.length, 0);
        await input().fill('/帮助'); await menu().waitFor(); await menu().locator('[data-slash-command="help"]').waitFor(); await input().press('Escape');

        const unsent = '请先保留这段未发送的小说草稿。';
        await input().fill(unsent); await trigger().click(); await menu().waitFor();
        await menu().locator('[data-slash-command="outline"]').click(); await completionPainted();
        assert.ok((await input().inputValue()).includes(unsent), 'Choosing a command must retain an ordinary unsent draft');
        assert.equal(active.requests.length, 0);
        const beforeInvalid = await messages(), beforeDialogs = dialogs.length;
        await send('/clear rubbish'); await assistant.getByText(/不接受参数/).first().waitFor();
        await until(async () => (await input().inputValue()) === '/clear rubbish', 'Invalid clear lost the draft');
        assert.deepEqual(await messages(), beforeInvalid); assert.equal(dialogs.length, beforeDialogs); assert.equal(active.requests.length, 0);
        await send('/rewrite'); await assistant.getByText(/补充具体要求/).first().waitFor(); assert.equal(await input().inputValue(), '/rewrite'); assert.deepEqual(await messages(), beforeInvalid); assert.equal(active.requests.length, 0);
        await send('/not-a-real-command'); await assistant.getByText(/未知命令/).first().waitFor(); assert.equal(await input().inputValue(), '/not-a-real-command'); assert.equal(active.requests.length, 0);

        await send('/help'); await until(async () => (await latestSystem()).includes('/continue'), 'Help does not reflect actual registry');
        for (const name of ['/context', '/history', '/rewrite']) assert.ok((await latestSystem()).includes(name));
        await send('/context'); await until(async () => /上下文|范围|正文/.test(await latestSystem()), 'Context command did not show its local scope');
        assert.match(await latestSystem(), /下一次普通对话的参考范围/);
        assert.match(await latestSystem(), /文本估算/);
        assert.match(await latestSystem(), /不调用模型/);
        await send('/compact 4'); await until(async () => (await readState()).sessions.find(row => row.id === sessionId)?.contextHistoryLimit === 4, 'Compact number was not applied');
        await send('/compact off'); await until(async () => (await readState()).sessions.find(row => row.id === sessionId)?.contextHistoryLimit === undefined, 'Compact off did not restore normal history');
        for (const message of originalMessages) assert.deepEqual((await messages()).find(row => row.id === message.id), message, 'Local commands preserve the existing transcript');
        assert.equal(active.requests.length, 0);

        await send('/usage'); await show('作品'); await page.getByRole('heading', { name: 'AI 调用记录与预算', exact: true }).waitFor(); await show('AI 助手');
        await send('/history'); await show('作品'); await page.getByRole('heading', { name: '章节版本历史', exact: true }).waitFor(); await show('AI 助手');
        await send('/review'); await show('作品'); await page.getByRole('heading', { name: '全书一致性检查', exact: true }).waitFor(); await show('AI 助手');
        await send('/timeline 林夏'); await show('作品'); await page.getByRole('combobox', { name: '时间线人物', exact: true }).waitFor(); assert.equal(await page.getByRole('combobox', { name: '时间线人物', exact: true }).inputValue(), 'slash-linxia'); await show('AI 助手');
        await send('/prompt'); const promptDialog = page.getByRole('dialog', { name: '自定义 Agent 提示词', exact: true }); await promptDialog.waitFor(); await page.keyboard.press('Escape'); await promptDialog.waitFor({ state: 'hidden' });
        assert.equal(active.requests.length, 0, 'Offline local commands do not call a provider');
        assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"state":{"records":[]}}').state.records.length, key('novel-agent-usage')), 0, 'Local commands and invalid arguments create no usage ledger rows');

        // The settings form has separate coverage; initialize its validated state for local model-command fixtures.
        await page.evaluate(({ key, config }) => localStorage.setItem(key, JSON.stringify({ version: 1, state: config })), { key: key('novel-agent-settings'), config: modelConfig(true) });
        await page.reload(); await openChat();
        for (const label of ['生成大纲', '优化大纲', '续写章节', '续写一章', '续写三章', '检查章节']) assert.equal(await assistant.getByRole('button', { name: label, exact: true }).count(), 1);
        await input().fill('/contin'); await menu().waitFor(); await input().press('Tab'); await completionPainted(); assert.match(await input().inputValue(), /^\/continue\s/); assert.equal(active.requests.length, 0);
        await input().fill('/contin'); await menu().waitFor();
        const immediateDraft = '/continue 当前 2000字';
        await input().evaluate((element, nextDraft) => {
          // A real edit can arrive before completion's pending animation frame.
          element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }));
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, nextDraft);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.setSelectionRange(nextDraft.length, nextDraft.length);
        }, immediateDraft);
        await completionPainted();
        assert.equal(await input().inputValue(), immediateDraft);
        assert.equal(await input().evaluate(element => element.selectionStart), immediateDraft.length, 'A pending completion must not move the caret inside a newer edit');
        assert.equal(active.requests.length, 0);
        active.replyText = continuationWrite;
        await send('/continue 当前 2000字'); await settled(1);
        const first = JSON.stringify(active.requests[0]); assert.ok(first.includes('CURRENT_COMMAND_CHAPTER')); assert.ok(first.includes('2000')); assert.ok(!active.requests[0].messages.at(-1).content.trimStart().startsWith('/continue'));
        let aiUser = [...await messages()].reverse().find(row => row.role === 'user' && !row.content.trimStart().startsWith('/'));
        assert.ok(aiUser?.content.includes('2000'), 'Canonical AI request remains suitable for retries and context');
        assert.equal(aiUser.sourceCommand, '/continue 当前 2000字', 'The original command remains available alongside the canonical request');
        const afterContinuation = (await readState()).chapters.filter(row => row.novelId === novelId);
        const continued = afterContinuation.find(row => row.id === currentId);
        assert.ok(continued.content.startsWith(originalChapters.find(row => row.id === currentId).content), 'Continuation preserves existing rich text instead of replacing it');
        assert.ok(continued.content.includes(continuationTail), 'New continuation text is appended');
        assert.ok(continued.content.includes('<strong>林夏</strong>'));
        assert.deepEqual(afterContinuation.filter(row => row.id !== currentId), originalChapters.filter(row => row.id !== currentId));

        active.replyText = safePolishWrite;
        await send('/polish 把拿着改为握着，保留人物和雨伞'); await settled(2);
        const expectedChapters = (await readState()).chapters.filter(row => row.novelId === novelId);
        const polished = expectedChapters.find(row => row.id === currentId);
        assert.ok(polished.content.includes('<strong>林夏</strong>握着蓝色雨伞走进教室。'), 'Scoped polish preserves rich text marks while applying the target replacement');
        assert.ok(polished.content.includes(continuationTail));
        assert.deepEqual(expectedChapters.filter(row => row.id !== currentId), originalChapters.filter(row => row.id !== currentId));
        const allowedSyncButtons = await assistant.getByRole('button', { name: '重新同步到面板', exact: true }).count();

        active.replyMode = 'fail'; await send('/check 当前'); await settled(3);
        await until(async () => (await messages()).some(row => row.content.includes(partial)), 'Failed command response did not retain partial output');
        await selectChapter('归队');
        assert.equal((await readState()).currentChapterId, 'slash-command-chapter-6');
        active.replyMode = 'normal'; active.replyText = checkWriteBlock;
        await assistant.getByRole('button', { name: '重试本次请求', exact: true }).last().click(); await settled(4);
        const checkPayload = JSON.stringify(active.requests[3]);
        assert.ok(checkPayload.includes('CURRENT_COMMAND_CHAPTER'), 'Retry retains the captured current-chapter target');
        assert.ok(!checkPayload.includes('CHAPTER_6_COMMAND_SOURCE'), 'Changing selected chapter cannot retarget the retry');
        assert.deepEqual((await readState()).chapters.filter(row => row.novelId === novelId), expectedChapters, 'Review-only command and its retry cannot apply model-returned write blocks');
        assert.equal(await assistant.getByRole('button', { name: '重新同步到面板', exact: true }).count(), allowedSyncButtons, 'A review-only reply cannot expose a manual write path');
        const records = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state.records, key('novel-agent-usage'));
        assert.equal(records.length, 4);
        assert.ok(records.every(row => row.context.novelId === novelId && row.model === 'slash-test-model'));
        const failed = records.find(row => row.status === 'failed'); assert.ok(failed && records.some(row => row.context.retryOf === failed.id && row.status === 'succeeded'));

        await selectChapter('雨夜教室'); active.replyText = outOfScopeWrite;
        await send('/polish 只润色当前章节的动作表达，保留事件'); await settled(5);
        assert.deepEqual((await readState()).chapters.filter(row => row.novelId === novelId), expectedChapters, 'A mixed current/foreign-chapter response must be rejected before either write');
        const rejected = (await messages()).find(row => row.role === 'assistant' && row.content === outOfScopeWrite);
        assert.ok(rejected?.syncStatus && /范围|越界|当前/.test(rejected.syncStatus.message), 'Out-of-scope output remains visible with an explicit scope warning');
        assert.equal(await assistant.getByRole('button', { name: '重新同步到面板', exact: true }).count(), allowedSyncButtons, 'Rejected output must not expose a manual bypass');

        const beforeRewrite = await messages(); const countBeforeCancel = active.requests.length;
        confirmDecision = 'dismiss'; await send('/rewrite 保留剧情，改为第一人称');
        await until(() => dialogs.length > beforeDialogs, 'Rewrite did not ask for scope confirmation');
        assert.equal(active.requests.length, countBeforeCancel); assert.equal(await input().inputValue(), '/rewrite 保留剧情，改为第一人称'); assert.deepEqual(await messages(), beforeRewrite);
        confirmDecision = 'accept'; active.replyMode = 'slow'; await assistant.getByRole('button', { name: '发送需求', exact: true }).click();
        await until(() => active.requests.length === 6 && active.slowResponse, 'Confirmed rewrite did not reach the provider exactly once');
        await input().fill('/clear');
        if (await assistant.getByRole('button', { name: '发送需求', exact: true }).isEnabled()) await assistant.getByRole('button', { name: '发送需求', exact: true }).click();
        assert.equal(active.requests.length, 6); assert.ok((await messages()).some(row => row.id === originalMessages[0].id), 'Busy clear must not erase a live conversation');
        await send('/context'); assert.equal(active.requests.length, 6);
        await send('/stop'); const nextDraft = '停止后准备的下一条草稿，仍需保留。'; await input().fill(nextDraft); await settled(6);
        assert.equal(await input().inputValue(), nextDraft);
        assert.ok((await messages()).some(row => row.content.includes(slowText) && row.generation?.status === 'cancelled'), 'Stop retains partial command output');
        assert.deepEqual((await readState()).chapters.filter(row => row.novelId === novelId), expectedChapters);
        active.slowResponse?.end(); active.slowResponse = null;
        const beforeClear = await readState(), clearDialogCount = dialogs.length;
        assert.ok(beforeClear.sessions.find(row => row.id === 'slash-other-session'), 'Another book conversation is present for the clear-scope check');
        confirmDecision = 'dismiss'; await send('/clear');
        await until(() => dialogs.length > clearDialogCount, 'Clear did not ask for confirmation');
        assert.deepEqual((await readState()).sessions, beforeClear.sessions, 'Dismissing clear preserves every conversation');
        assert.equal(await input().inputValue(), '/clear');
        confirmDecision = 'accept'; await assistant.getByRole('button', { name: '发送需求', exact: true }).click();
        await until(async () => (await latestSystem()).includes('已清空当前会话'), 'Confirmed clear did not complete');
        const afterClear = await readState();
        assert.equal((await messages()).length, 2, 'Clear leaves only its command and local result');
        assert.deepEqual(afterClear.sessions.find(row => row.id === 'slash-other-session'), beforeClear.sessions.find(row => row.id === 'slash-other-session'), 'Clear is scoped to this conversation');
        for (const resource of ['chapters', 'characters', 'worldSettings']) assert.deepEqual(afterClear[resource], beforeClear[resource]);
        assert.equal(active.requests.length, 6, 'Clear never calls a model');
        assert.deepEqual(errors, []); assert.deepEqual(active.errors, []); if (isDemo) assert.deepEqual(backendRequests, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (process.env.SCREENSHOT_DIR) { mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `slash-${mode}-${width}.png`) }); }
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 568 }); await input().fill('/'); await menu().waitFor();
          const bounds = await page.locator('[data-slash-menu]').boundingBox(); assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= 321 && bounds.y + bounds.height <= 569, 'Command menu fits the narrow phone');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `slash-${mode}-320.png`) });
          await input().press('Escape'); assert.equal(await input().evaluate(element => document.activeElement === element), true);
        }
        results.push(`${width}px: offline command menu/completion/IME, draft retention, strict validation, local navigation, lossless compact, canonical continuation append, rich text polish, review-only captured-target retries, atomic scope rejection, rewrite confirmation/cancellation, stop/partial output${width === 390 ? ', 320px menu bounds' : ''}`);
      } catch (error) { if (page && process.env.SCREENSHOT_DIR) { mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `slash-failed-${mode}-${width}.png`) }).catch(() => {}); } throw error; }
      finally { active?.slowResponse?.end(); await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results }));
  } finally { active?.slowResponse?.end(); await browser?.close(); server?.kill(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
