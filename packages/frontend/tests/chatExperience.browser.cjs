// Real conversation UI against a local mock provider: never sends a paid model request.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');

const mode = process.env.PARITY_MODE || 'demo';
const isDemo = mode === 'demo';
const previewPort = 5232, modelPort = 5233;
const base = process.env.PARITY_URL || `http://127.0.0.1:${previewPort}${isDemo ? '/noval-agent/' : '/'}`;
const key = name => isDemo ? `${name}-demo-v1` : name;
const novelId = 'chat-experience-book', otherId = 'chat-experience-other';
const currentId = 'chat-experience-chapter-2';
const pendingText = 'CURRENT_CHAPTER_02_SOURCE_ONLY：林夏在雨夜走进了教室。PENDING_EDITOR_FLUSH：窗边放着一把蓝色雨伞。';
const rawReply = '**原始回复**\n\n可以把这一幕的目标说清楚，再补一个具体动作。`保留原始 Markdown`，无需修改正文。';
const slowHead = 'SLOW_HEAD_VISIBLE：正在整理人物动机。\n' + '这一段只讨论写法，不修改已有正文。\n'.repeat(45);
const slowMiddle = '\nSLOW_MIDDLE_LATEST：最新收到的建议在这里。';
const slowTail = '\nSLOW_TAIL_COMPLETE：完整回复结束。';
const timestamp = 1730000000000;
const history = Array.from({ length: 18 }, (_, index) => [
  { id: `chat-old-user-${index}`, role: 'user', content: `历史需求 ${index}：只讨论人物动机，不生成结构化内容。` + '保留这条真实对话，发送上下文可以精简。'.repeat(8), timestamp: timestamp + index * 2 },
  { id: `chat-old-reply-${index}`, role: 'assistant', content: `历史回复 ${index}：角色需要一个具体的目标。` + '可以让选择通过行动体现，也要保留作者已经确定的事实。'.repeat(8), timestamp: timestamp + index * 2 + 1 },
]).flat();
history.splice(0, 0,
  { id: 'chat-local-command', role: 'user', content: '/status', timestamp },
  { id: 'chat-local-result', role: 'system', content: 'SYSTEM_LOCAL_STATUS_MUST_NOT_SEND', timestamp },
);
const fixture = {
  novels: [
    { id: novelId, title: '对话优化回归样本', wordCount: 400, status: 'writing', summary: '校园群像，按作者明确需求协作。', agentPrompt: 'BOOK_PREFERENCE_KEEP：请使用清楚易懂的中文。', createdAt: timestamp, updatedAt: timestamp },
    { id: otherId, title: '另一部对话作品', wordCount: 30, status: 'draft', createdAt: timestamp, updatedAt: timestamp },
  ],
  chapters: [
    ...Array.from({ length: 8 }, (_, index) => {
      const sequence = index + 1;
      const text = sequence === 1 ? 'PRECEDING_CHAPTER_01_SOURCE：林夏答应今晚回来。'
        : sequence === 2 ? 'CURRENT_CHAPTER_02_SOURCE_ONLY：林夏在雨夜走进了教室。'
        : sequence === 6 ? 'EXPLICIT_CHAPTER_06_WITNESS：周桥亲眼看见了钟楼的白影。'
        : sequence === 8 ? 'LATE_BOOK_CHAPTER_08_SECRET：最终揭晓的秘密不应默认传给前面的章节。'
        : `章节${sequence}的正文，记录这一晚的普通行动。`;
      return { id: `chat-experience-chapter-${sequence}`, novelId, title: ['约定', '雨夜教室', '值日', '走廊', '停电', '钟楼目击', '归队', '结局'][index], content: `<p>${text}</p>`, wordCount: text.length, sequence, createdAt: timestamp, updatedAt: timestamp };
    }),
    { id: 'chat-other-chapter', novelId: otherId, title: '别处的故事', content: '<p>OTHER_BOOK_SOURCE_MUST_NOT_SEND：另一部作品的独立正文。</p>', wordCount: 30, sequence: 1, createdAt: timestamp, updatedAt: timestamp },
  ],
  characters: [{ id: 'chat-linxia', novelId, name: '林夏', aliases: ['小夏'], role: 'protagonist', description: '谨慎的高中生，希望保护朋友。', personality: '谨慎、固执，紧张时会数窗户。', relationships: [] }],
  worldSettings: [{ id: 'chat-rule', novelId, category: '校园规则', title: '夜间规则', content: '十点后不要独自进入钟楼。' }],
  plotCards: Array.from({ length: 8 }, (_, index) => ({ id: `chat-plot-${index + 1}`, novelId, type: 'chapter', title: ['约定', '雨夜教室', '值日', '走廊', '停电', '钟楼目击', '归队', '结局'][index], summary: `记录第${index + 1}章计划中的行动。`, chapterId: `chat-experience-chapter-${index + 1}`, sequence: index + 1, status: 'completed', createdAt: timestamp, updatedAt: timestamp })),
  foreshadowings: [],
  sessions: [{ id: 'chat-experience-session', novelId, agentType: 'master', title: '已有真实对话', messages: history, createdAt: timestamp, updatedAt: timestamp }],
};
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(condition, message, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) { if (await condition()) return; await delay(50); }
  throw new Error(message);
}
const event = content => `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`;

(async () => {
  let activeProvider;
  const provider = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      let raw = ''; for await (const chunk of request) raw += chunk;
      if (!activeProvider || request.method !== 'POST' || !request.url.includes('/chat/completions')) throw new Error('Unexpected mock provider request');
      activeProvider.requests.push(JSON.parse(raw));
      if (activeProvider.replyMode === 'slow') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });
        response.flushHeaders();
        activeProvider.slowResponse = response;
        response.write(event(slowHead));
      } else {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: rawReply }, finish_reason: 'stop' }], usage: { prompt_tokens: 400, completion_tokens: 90, total_tokens: 490 } }));
      }
    } catch (error) { activeProvider?.errors.push(error.message); response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: error.message } })); }
  });
  await new Promise((resolve, reject) => { provider.once('error', reject); provider.listen(modelPort, '127.0.0.1', resolve); });
  const server = process.env.PARITY_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], {
    cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' },
  });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* Wait for our preview. */ }
      if (attempt === 60) throw new Error('Chat preview did not start');
      await delay(200);
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 1280 });
      let page;
      try {
        page = await context.newPage();
        const data = structuredClone(fixture), errors = [], backendRequests = [];
        let phoneMessageHeight;
        activeProvider = { requests: [], errors: [], replyMode: 'normal', slowResponse: null };
        let userId = 'chat-user';
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await context.addInitScript(({ fixture, isDemo, modelPort }) => {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => {
            if (window.__chatClipboardRejected) throw new Error('模拟浏览器拒绝复制');
            window.__chatCopiedText = text;
          } } });
          if (sessionStorage.getItem('chat-experience-initialized')) return;
          sessionStorage.setItem('chat-experience-initialized', 'true');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          const inactiveDraftKey = isDemo ? 'novel-agent-chat-draft:chat-user:chat-experience-book' : 'novel-agent-chat-draft-demo-v1:browser:chat-experience-book';
          localStorage.setItem(inactiveDraftKey, 'INACTIVE_MODE_DRAFT_MUST_NOT_CHANGE');
          localStorage.setItem(key('novel-agent-settings'), JSON.stringify({ version: 1, state: {
            apiProvider: 'custom', protocol: 'openai', baseUrl: `http://127.0.0.1:${modelPort}/v1`, apiKey: 'CHAT_TEST_KEY', authMode: 'bearer', model: 'chat-test-model',
            temperature: .7, sendTemperature: false, maxTokens: 4096, timeoutSeconds: 30, tokenParameter: 'auto', stream: true, extraBody: '', extraHeaders: '', profiles: {},
          } }));
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, currentNovelId: fixture.novels[0].id, currentChapterId: 'chat-experience-chapter-2', currentView: 'chapters' } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'chat-user', nickname: '对话测试用户', email: 'chat@example.test' } } }));
          }
        }, { fixture, isDemo, modelPort });
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname, resource = path.split('/').at(-1);
          backendRequests.push(path);
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: userId, nickname: '对话测试用户', email: 'chat@example.test' } };
          else if (request.method() === 'GET' && resources[resource]) {
            const requestedNovel = path.includes('/novels/') ? path.split('/').at(-2) : null;
            const rows = data[resources[resource]];
            body = { [resources[resource]]: requestedNovel && resource !== 'novels' ? rows.filter(item => item.novelId === requestedNovel) : rows };
          } else if (request.method() === 'PUT') {
            const item = Object.values(data).flat().find(item => item.id === resource);
            Object.assign(item || {}, request.postDataJSON()); body = { novel: item, chapter: item, character: item, plotCard: item, worldSetting: item, foreshadowing: item };
          } else throw new Error(`Unexpected backend request in chat flow: ${request.method()} ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const assistant = page.locator('#workspace-assistant');
        const input = () => assistant.getByRole('textbox', { name: 'AI 创作需求', exact: true });
        const readNovel = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        const messages = async () => (await readNovel()).sessions.find(session => session.id === 'chat-experience-session').messages;
        const showPanel = async label => {
          if (page.viewportSize().width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: label, exact: true }).click();
        };
        const selectBook = async title => {
          await showPanel('书架');
          await page.locator('#workspace-bookshelf').getByRole('button', { name: title, exact: true }).click();
          await showPanel('AI 助手');
        };
        const send = async content => {
          await input().fill(content); await assistant.getByRole('button', { name: '发送需求', exact: true }).click();
        };
        const settled = async count => {
          await page.waitForFunction(({ key, count }) => {
            const records = JSON.parse(localStorage.getItem(key) || '{"state":{"records":[]}}').state.records;
            return records.length === count && records.every(row => row.status !== 'running');
          }, { key: key('novel-agent-usage'), count });
          await assistant.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden' });
          assert.equal(activeProvider.requests.length, count);
        };
        const scopeDetails = assistant.locator('[data-chat-context]');

        await page.goto(base); await page.locator('.tiptap').waitFor();
        assert.equal((await readNovel()).currentChapterId, currentId);
        // The editor is intentionally not saved with Ctrl+S: moving to chat must flush it.
        await page.locator('.tiptap').fill(pendingText);
        await showPanel('AI 助手');
        for (const label of ['生成大纲', '优化大纲', '续写章节', '续写一章', '续写三章', '检查章节']) assert.equal(await assistant.getByRole('button', { name: label, exact: true }).count(), 1);

        // Pending input is scoped by book and survives a switch before the debounce expires.
        const draftA = 'A书未发送草稿：不要带到另一本书。', draftB = 'B书独立草稿：返回时还要保留。';
        await input().fill(draftA); await selectBook('另一部对话作品');
        assert.equal(await input().inputValue(), '');
        await input().fill(draftB); await selectBook('对话优化回归样本');
        assert.equal(await input().inputValue(), draftA);
        await page.reload(); await showPanel('AI 助手');
        await input().waitFor(); assert.equal(await input().inputValue(), draftA);
        await selectBook('另一部对话作品'); assert.equal(await input().inputValue(), draftB);
        await selectBook('对话优化回归样本');

        // Composing Chinese text never sends; coarse-pointer phones use Enter as a newline.
        await showPanel('作品');
        await page.locator('.tiptap').fill(`${pendingText} SEND_TIME_EDITOR_FLUSH：这句话还未等待自动保存。`);
        await showPanel('AI 助手');
        const request = '请检查当前章节，只讨论写法，不修改正文。';
        await input().fill(request);
        await input().evaluate(element => {
          element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '文' }));
          element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true }));
          element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '文' }));
        });
        assert.equal(activeProvider.requests.length, 0);
        assert.equal(await input().inputValue(), request);
        if (width < 1280) {
          await input().press('Enter');
          assert.equal(activeProvider.requests.length, 0);
          assert.ok((await input().inputValue()).includes('\n'));
        }
        // A transcript quota failure is a local preflight failure, and cannot leave
        // the request lock stuck or send an unrecorded provider request.
        await page.evaluate(storageKey => {
          const prototype = Object.getPrototypeOf(localStorage);
          window.__chatOriginalSetItem = prototype.setItem;
          prototype.setItem = function (key, value) {
            if (key === storageKey) throw new DOMException('模拟对话存储空间不足', 'QuotaExceededError');
            return window.__chatOriginalSetItem.call(this, key, value);
          };
        }, key('novel-agent-storage'));
        if (width < 1280) await assistant.getByRole('button', { name: '发送需求', exact: true }).click(); else await input().press('Enter');
        await assistant.getByRole('alert').filter({ hasText: '会话暂未保存' }).waitFor();
        assert.equal(activeProvider.requests.length, 0);
        assert.equal((await input().inputValue()).trim(), request);
        await page.evaluate(() => { Object.getPrototypeOf(localStorage).setItem = window.__chatOriginalSetItem; });
        if (width < 1280) await assistant.getByRole('button', { name: '发送需求', exact: true }).click(); else await input().press('Enter');
        await settled(1);
        const firstPayload = JSON.stringify(activeProvider.requests[0]);
        assert.ok(firstPayload.includes('PENDING_EDITOR_FLUSH'), 'The current unsaved editor body must be in the actual model input');
        assert.ok(firstPayload.includes('SEND_TIME_EDITOR_FLUSH'), 'Sending a request flushes pending editor changes before assembling context');
        assert.ok(firstPayload.includes('PRECEDING_CHAPTER_01_SOURCE'), 'A nearby preceding chapter provides continuity');
        assert.ok(!firstPayload.includes('LATE_BOOK_CHAPTER_08_SECRET'), 'An early selected chapter does not silently attach the book ending');
        assert.ok(!firstPayload.includes('OTHER_BOOK_SOURCE_MUST_NOT_SEND'));
        assert.ok(!firstPayload.includes('【本次章节字数要求】'), 'A critique-only request does not inherit the chapter-writing word count');
        assert.equal(firstPayload.split('BOOK_PREFERENCE_KEEP').length - 1, 1, 'Book preferences are sent once');
        assert.equal(activeProvider.requests[0].messages.filter(message => message.role === 'system').length, 1);
        assert.ok(!firstPayload.includes('SYSTEM_LOCAL_STATUS_MUST_NOT_SEND'));
        await scopeDetails.waitFor();
        assert.ok((await scopeDetails.textContent()).includes('雨夜教室'));

        // Copy is the original raw message, and a denied clipboard offers manual copy.
        await assistant.getByRole('button', { name: '复制回复', exact: true }).last().click();
        await page.waitForFunction(expected => window.__chatCopiedText === expected, rawReply);
        await assistant.getByText('已复制完整回复', { exact: true }).waitFor();
        await page.evaluate(() => { window.__chatClipboardRejected = true; });
        await assistant.getByRole('button', { name: '复制回复', exact: true }).last().click();
        const copyDialog = page.getByRole('dialog', { name: '手动复制回复', exact: true });
        await copyDialog.waitFor();
        const rawText = copyDialog.getByRole('textbox', { name: '原始回复文本', exact: true });
        assert.equal(await rawText.inputValue(), rawReply);
        assert.deepEqual(await rawText.evaluate(element => [element.selectionStart, element.selectionEnd]), [0, rawReply.length]);
        await copyDialog.getByRole('button', { name: '完成', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '复制回复' || document.activeElement?.textContent?.trim() === '复制回复');
        await page.evaluate(() => { window.__chatClipboardRejected = false; });
        assert.equal(activeProvider.requests.length, 1);

        // Compaction changes only what is sent, preserving every stored author/assistant message.
        const beforeCompact = await messages();
        await send('/compact');
        await until(async () => (await messages()).length > beforeCompact.length, 'Compact command result was not saved');
        const afterCompact = await messages();
        for (const message of beforeCompact) assert.deepEqual(afterCompact.find(row => row.id === message.id), message, 'Compact must not delete or rewrite the author transcript');
        await send('/status'); await send('/help');
        assert.equal(activeProvider.requests.length, 1, 'Local commands never call the provider');
        await send('请检查第六章《钟楼目击》，只讨论这一章，不修改正文。');
        await settled(2);
        const explicit = activeProvider.requests[1], explicitText = JSON.stringify(explicit);
        assert.ok(explicitText.includes('EXPLICIT_CHAPTER_06_WITNESS'), 'An explicit numbered chapter request retrieves the requested body');
        assert.ok(!explicitText.includes('LATE_BOOK_CHAPTER_08_SECRET'));
        assert.ok(!explicitText.includes('SYSTEM_LOCAL_STATUS_MUST_NOT_SEND'));
        assert.equal(explicit.messages.filter(message => message.role === 'system').length, 1);
        assert.ok(!explicit.messages.some(message => /^\/(?:compact|status|help)\s*$/.test(message.content)), 'Slash command rows are excluded from model history');
        assert.ok((await scopeDetails.textContent()).includes('钟楼目击'), 'After completion an empty composer retains the actual last request scope');

        // A genuinely streamed response must leave the reader at their scroll position.
        activeProvider.replyMode = 'slow';
        await send('继续讨论当前编辑章节的写法，不修改正文。');
        const nextDraft = '生成期间输入的下一条想法，回复完成后仍要保留。';
        await input().fill(nextDraft);
        await until(() => activeProvider.slowResponse, 'Slow provider was not reached');
        await assistant.locator('[data-stream-preview-tail]').waitFor();
        const scroll = assistant.locator('[data-chat-scroll]');
        await scroll.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll', { bubbles: true })); });
        activeProvider.slowResponse.write(event(slowMiddle));
        await page.waitForFunction(() => document.querySelector('[data-stream-preview-tail]')?.textContent.includes('SLOW_MIDDLE_LATEST'));
        assert.ok(await scroll.evaluate(element => element.scrollTop < 50), 'Incoming chunks must not force a reader away from earlier messages');
        await assistant.getByRole('button', { name: '回到最新', exact: true }).click();
        await page.waitForFunction(() => { const element = document.querySelector('[data-chat-scroll]'); return element && element.scrollHeight - element.clientHeight - element.scrollTop < 120; });
        activeProvider.slowResponse.write(event(slowTail));
        activeProvider.slowResponse.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
        activeProvider.slowResponse.end(); activeProvider.slowResponse = null;
        await settled(3);
        assert.equal(await input().inputValue(), nextDraft);
        assert.equal((await messages()).filter(message => message.content === slowHead + slowMiddle + slowTail).length, 1);
        const reloadedDraft = `${nextDraft} 刷新前刚补的一句。`;
        await input().fill(reloadedDraft);
        await page.reload(); await showPanel('AI 助手'); await input().waitFor();
        assert.equal(await input().inputValue(), reloadedDraft, 'A reload flushes the pending next-message draft');

        // A new normal-app account cannot see the previous account's draft for the same book ID.
        if (!isDemo) {
          userId = 'chat-user-other';
          await page.evaluate(userId => localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: userId, nickname: '另一账号', email: 'other@example.test' } } })), userId);
          await page.reload(); await showPanel('AI 助手'); await input().waitFor();
          assert.equal(await input().inputValue(), '');
          await input().fill('另一账号自己的草稿');
          userId = 'chat-user';
          await page.evaluate(userId => localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: userId, nickname: '原账号', email: 'chat@example.test' } } })), userId);
          await page.reload(); await showPanel('AI 助手'); await input().waitFor();
          assert.equal(await input().inputValue(), reloadedDraft);
        }
        assert.equal(activeProvider.requests.length, 3);
        const inactiveDraftKey = isDemo ? 'novel-agent-chat-draft:chat-user:chat-experience-book' : 'novel-agent-chat-draft-demo-v1:browser:chat-experience-book';
        assert.equal(await page.evaluate(key => localStorage.getItem(key), inactiveDraftKey), 'INACTIVE_MODE_DRAFT_MUST_NOT_CHANGE');
        assert.deepEqual(activeProvider.errors, []); assert.deepEqual(errors, []);
        if (isDemo) assert.deepEqual(backendRequests, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `chat-${mode}-${width}.png`) });
        }
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 568 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          const inputBounds = await input().boundingBox();
          assert.ok(inputBounds && inputBounds.x >= 0 && inputBounds.x + inputBounds.width <= 321);
          const messageBounds = await scroll.boundingBox();
          phoneMessageHeight = messageBounds?.height;
          assert.ok(messageBounds && messageBounds.height >= 200, `Narrow-phone conversation should keep at least 200px of readable space, got ${messageBounds?.height}`);
          for (const label of ['生成大纲', '优化大纲', '续写章节', '续写一章', '续写三章', '检查章节']) {
            const bounds = await assistant.getByRole('button', { name: label, exact: true }).boundingBox();
            assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 321 && bounds.y >= 0 && bounds.y + bounds.height <= 569, `Quick action ${label} remains visible on a narrow phone`);
          }
          if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `chat-${mode}-320.png`) });
          await page.evaluate(() => { window.__chatClipboardRejected = true; });
          await assistant.getByRole('button', { name: '复制回复', exact: true }).last().click();
          const narrowDialog = page.getByRole('dialog', { name: '手动复制回复', exact: true });
          await narrowDialog.waitFor();
          const dialogBounds = await narrowDialog.boundingBox();
          assert.ok(dialogBounds && dialogBounds.x >= -1 && dialogBounds.x + dialogBounds.width <= 321, 'Manual copy fits a narrow phone');
          await narrowDialog.getByRole('button', { name: '完成', exact: true }).click();
        }
        results.push(`${width}px: scoped drafts, editor flush, current/explicit chapter context, Chinese IME/phone Enter, preflight quota recovery, raw clipboard/manual fallback, lossless compact, local commands, streamed scroll pause/resume, next draft, reload${isDemo ? '' : ', account isolation'}${width === 390 ? `, 320px bounds/message area ${phoneMessageHeight}px` : ''}`);
      } catch (error) {
        if (page && process.env.SCREENSHOT_DIR) { mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `chat-failed-${mode}-${width}.png`) }).catch(() => {}); }
        throw error;
      } finally { activeProvider?.slowResponse?.end(); await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results }));
  } finally {
    activeProvider?.slowResponse?.end();
    await browser?.close(); server?.kill(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
