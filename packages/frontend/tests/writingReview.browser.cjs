// Same real product workflows for the ordinary app and GitHub Pages. No provider traffic is real.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, readFileSync } = require('node:fs');

const mode = process.env.PARITY_MODE || 'demo';
const isDemo = mode === 'demo';
const base = process.env.PARITY_URL || `http://127.0.0.1:5224${isDemo ? '/noval-agent/' : '/'}`;
const key = name => isDemo ? `${name}-demo-v1` : name;
const novelId = 'review-school';
const chapterId = 'review-chapter-1';
const firstText = '晚自习后，林夏留在教室。她把红色钥匙交给了周桥。';
const secondText = '操场的灯全亮了。林夏右手受伤，周桥带着钥匙站在门外。';
const revisedText = '晚自习后，林夏去了图书馆。她把蓝色钥匙收进了书包。';
const aiEditedText = '晚自习后，林夏回到了教室。她发现红色钥匙还在桌上。';
const timestamp = 1730000000000;
const fixture = {
  novels: [
    { id: novelId, title: '创作检查回归样本', wordCount: 100, status: 'writing', summary: '校园群像测试，只用于本地模拟。', createdAt: timestamp, updatedAt: timestamp },
    { id: 'review-other', title: '另一部独立作品', wordCount: 20, status: 'draft', createdAt: timestamp, updatedAt: timestamp },
  ],
  chapters: [
    { id: chapterId, novelId, title: '雨夜点名', content: `<p>${firstText}</p>`, wordCount: firstText.length, sequence: 1, createdAt: timestamp, updatedAt: timestamp },
    { id: 'review-chapter-2', novelId, title: '操场灯光', content: `<p>${secondText}</p>`, wordCount: secondText.length, sequence: 2, createdAt: timestamp, updatedAt: timestamp },
    { id: 'review-other-chapter', novelId: 'review-other', title: '别处的故事', content: '<p>另一部作品的正文，不应出现在当前作品的检查或历史中。</p>', wordCount: 30, sequence: 1, createdAt: timestamp, updatedAt: timestamp },
  ],
  characters: [
    { id: 'review-linxia', novelId, name: '林夏', aliases: [], description: '高二女生，谨慎，想找到回家的路。', relationships: [{ targetId: 'missing-character', kind: 'ally', label: '失联同学' }], role: 'protagonist', sequence: 1 },
    { id: 'review-zhouqiao', novelId, name: '周桥', aliases: [], description: '林夏的同班同学，嘴硬但可靠。', relationships: [], role: 'supporting', sequence: 2 },
  ],
  worldSettings: [{ id: 'review-rule', novelId, category: '校园规则', title: '晚自习', content: '十点前离开教学楼。' }],
  plotCards: [{ id: 'review-plot', novelId, type: 'chapter', title: '未关联的计划', summary: '待写的章节。', sequence: 1, chapterId: 'missing-chapter', status: 'pending', statusMode: 'manual', createdAt: timestamp, updatedAt: timestamp }],
  foreshadowings: [{ id: 'review-foreshadow', novelId, title: '红色钥匙', description: '钥匙的来历需要解释。', plantedChapterId: 'review-chapter-2', resolvedChapterId: chapterId, status: 'resolved', createdAt: timestamp, updatedAt: timestamp }],
  sessions: [],
};

(async () => {
  const server = process.env.PARITY_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5224', '--strictPort'], {
    cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' },
  });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* Await only this preview. */ }
      if (attempt === 60) throw new Error('Writing-review preview did not start');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
      let page;
      try {
        page = await context.newPage();
        const data = structuredClone(fixture), errors = [], requests = [], backendRequests = [];
        let responseMode = 'consistency', failedComparison = false, sourceCalls = 0, comparisonCalls = 0;
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await context.addInitScript(({ fixture, isDemo }) => {
          if (sessionStorage.getItem('writing-review-initialized')) return;
          sessionStorage.setItem('writing-review-initialized', 'true');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-settings'), JSON.stringify({ version: 1, state: {
            apiProvider: 'custom', protocol: 'openai', baseUrl: 'https://review-model.example.test/v1', apiKey: 'REVIEW_TEST_KEY', authMode: 'bearer', model: 'review-model',
            temperature: .7, sendTemperature: false, maxTokens: 4096, timeoutSeconds: 30, tokenParameter: 'auto', stream: false, extraBody: '', extraHeaders: '', profiles: {},
          } }));
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, currentNovelId: fixture.novels[0].id, currentChapterId: fixture.chapters[0].id, currentView: 'chapters' } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
          }
        }, { fixture, isDemo });
        await page.route('https://review-model.example.test/**', async route => {
          const payload = route.request().postDataJSON(); requests.push(payload);
          let content;
          if (responseMode === 'edit') content = `【替换】\n目标：章节\n标题：雨夜点名\n新内容：${aiEditedText}\n【/替换】`;
          else if (responseMode === 'timeline') content = JSON.stringify({ entries: [
            { storyTime: '同一夜', location: '门外', physicalState: '右手受伤', emotion: '', knowledge: '', relationships: '', possessions: '', note: '仅依据原文提取，等待作者确认。', quote: '林夏右手受伤' },
            { storyTime: '', location: '火星', physicalState: '', emotion: '', knowledge: '', relationships: '', possessions: '', note: '这条应被拒绝。', quote: '原文并没有这句话' },
          ] });
          else {
            const input = JSON.parse(payload.messages.at(-1).content);
            if (input.segments) {
              sourceCalls++;
              const chapters = input.segments.filter(segment => segment.sourceType === 'chapter');
              assert.deepEqual(chapters.map(segment => segment.sourceId), [chapterId, 'review-chapter-2']);
              assert.ok(!JSON.stringify(input).includes('另一部作品的正文'), 'The check sends only the selected book');
              content = JSON.stringify({
                reviewedSegmentIds: input.segments.map(segment => segment.id),
                issues: [{ category: 'timeline', severity: 'info', title: '待核实引文示例', detail: '这条模拟模型提示的引用不在原文里，只能标为未核实。', suggestion: '不要据此修改正文。', evidence: [{ segmentId: chapters[0].id, quote: '这是不存在的原文引句' }] }],
                facts: chapters.map((segment, index) => ({ entity: '林夏', characterId: 'review-linxia', dimension: '地点', value: index ? '出现在操场附近' : '回到教室', evidence: { segmentId: segment.id, quote: segment.text.replace(/<[^>]*>/g, '').slice(0, 20) } })),
              });
            } else if (input.facts) {
              comparisonCalls++;
              if (!failedComparison) {
                failedComparison = true;
                await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '模拟跨批次复核中断' } }) });
                return;
              }
              content = JSON.stringify({ issues: [{ category: 'timeline', severity: 'warning', title: '场景变化需要核对', detail: '两章地点不同，请确认转场已经交代；地点不同本身不代表矛盾。', suggestion: '人工核对段落过渡，不直接修改正文。', characterIds: ['review-linxia'], evidence: input.facts.slice(0, 2).map(fact => ({ factId: fact.id, quote: fact.evidence.quote })) }] });
            } else throw new Error('Unexpected consistency model payload');
          }
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } }) });
        });
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname, resource = path.split('/').at(-1);
          backendRequests.push(path);
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
          else if (request.method() === 'GET' && resources[resource]) {
            const requestedNovelId = path.includes('/novels/') ? path.split('/').at(-2) : null;
            const rows = data[resources[resource]];
            body = { [resources[resource]]: requestedNovelId && resource !== 'novels' ? rows.filter(item => item.novelId === requestedNovelId) : rows };
          }
          else if (request.method() === 'PUT') {
            const item = Object.values(data).flat().find(item => item.id === resource);
            Object.assign(item || {}, request.postDataJSON());
            body = { novel: item, chapter: item, plotCard: item, character: item, worldSetting: item, foreshadowing: item };
          } else if (request.method() === 'POST' && resource === 'chapters') {
            const chapter = { ...request.postDataJSON(), id: `review-created-${data.chapters.length}`, novelId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; data.chapters.push(chapter); body = { chapter };
          } else if (request.method() === 'DELETE') {
            for (const collection of Object.values(resources)) data[collection] = data[collection].filter(item => item.id !== resource);
            body = { success: true };
          } else throw new Error(`Unexpected backend request: ${request.method()} ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const readNovel = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        const readUsage = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"state":{"records":[]}}').state, key('novel-agent-usage'));
        const readHistory = () => page.evaluate(async key => {
          const database = await new Promise((resolve, reject) => { const request = indexedDB.open('novel-agent-chapter-history-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
          try { return await new Promise((resolve, reject) => { const transaction = database.transaction('workspaces'); const request = transaction.objectStore('workspaces').get(key); transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error); }); }
          finally { database.close(); }
        }, `${key('novel-agent-chapter-history')}:${isDemo ? 'demo' : 'test-user'}`);
        const timelineState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"entries":[]}'), `${key('novel-agent-timeline')}:${isDemo ? 'browser' : 'test-user'}`);
        const chapterText = async () => (await readNovel()).chapters.find(chapter => chapter.id === chapterId)?.content;
        const waitChapter = text => page.waitForFunction(({ key, chapterId, text }) => JSON.parse(localStorage.getItem(key)).state.chapters.find(chapter => chapter.id === chapterId)?.content.includes(text), { key: key('novel-agent-storage'), chapterId, text });
        const button = name => page.getByRole('button', { name, exact: true });
        const panel = async name => { if (page.viewportSize().width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name, exact: true }).click(); };
        const navigate = async name => { await panel('书架'); await page.locator('#workspace-bookshelf').getByRole('button', { name, exact: true }).click(); };
        const reviewTab = async name => {
          await navigate('创作检查');
          await page.getByRole('tab', { name, exact: true }).click();
        };

        await page.goto(base); await page.locator('.tiptap').waitFor();
        assert.equal(requests.length, 0, 'Opening a book never starts a model check');

        // A named checkpoint survives manual edits; restoring it keeps the newer text available.
        await reviewTab('版本历史');
        await page.getByRole('heading', { name: '章节版本历史', exact: true }).waitFor();
        await page.getByLabel('历史章节', { exact: true }).selectOption(chapterId);
        await page.getByLabel('版本名称', { exact: true }).fill('改稿前检查点');
        await button('保存当前版本').click();
        await page.getByText('改稿前检查点', { exact: true }).waitFor();
        await navigate('章节'); await page.locator('.tiptap').waitFor();
        await page.locator('.tiptap').fill(revisedText); await page.keyboard.press('Control+s'); await waitChapter(revisedText);
        await reviewTab('版本历史');
        await page.getByLabel('历史章节', { exact: true }).selectOption(chapterId);
        await page.getByLabel('版本名称', { exact: true }).fill('人工改稿检查点');
        await button('保存当前版本').click(); await page.getByText('人工改稿检查点', { exact: true }).waitFor();

        const historyCard = label => page.locator('[data-history-version]').filter({ hasText: label });
        await historyCard('改稿前检查点').getByRole('button', { name: '查看此版本', exact: true }).click();
        await page.getByRole('heading', { name: '版本对比', exact: true }).waitFor();
        assert.equal(await page.getByLabel('历史版本正文', { exact: true }).inputValue(), firstText);
        assert.equal(await page.getByLabel('当前版本正文', { exact: true }).inputValue(), revisedText);
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 1000 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Version preview stays within a320px viewport');
          await page.setViewportSize({ width, height: 1000 });
        }
        await historyCard('改稿前检查点').getByRole('button', { name: '恢复此版本', exact: true }).click();
        await waitChapter(firstText);
        await historyCard('人工改稿检查点').getByRole('button', { name: '查看此版本', exact: true }).click();
        assert.equal(await page.getByLabel('历史版本正文', { exact: true }).inputValue(), revisedText);
        assert.equal(requests.length, 0, 'Version operations never request a model');

        // The existing AI writing path reaches the same history hook before changing the chapter.
        await panel('AI 助手');
        const input = page.locator('#workspace-assistant').getByPlaceholder('输入需求... (/help 查看命令)');
        responseMode = 'edit';
        await input.fill('把雨夜点名这一章按要求整体改写。'); await input.press('Enter'); await waitChapter(aiEditedText);
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).state.sessions.some(session => session.messages.some(message => message.role === 'assistant' && message.syncStatus?.state === 'success')), key('novel-agent-storage'));
        await reviewTab('版本历史');
        await page.getByLabel('历史章节', { exact: true }).selectOption(chapterId);
        await page.getByLabel('版本名称', { exact: true }).fill('AI 改稿检查点');
        await button('保存当前版本').click(); await page.getByText('AI 改稿检查点', { exact: true }).waitFor();
        const captured = await readHistory();
        assert.ok(captured.versions.some(version => version.novelId === novelId && version.chapterId === chapterId && version.kind === 'automatic' && version.content.includes(firstText)), 'AI changes preserve an automatic pre-edit snapshot');
        assert.ok(captured.versions.some(version => version.kind === 'before-restore' && version.content.includes(revisedText)), 'Restore first preserves the newer draft');

        // The current manuscript is the source of local checks; AI checking never applies edits.
        await reviewTab('全书一致性检查');
        await button('本机结构检查').click();
        await page.getByRole('heading', { name: '人物关系目标不存在', exact: true }).waitFor();
        await page.getByRole('heading', { name: '伏笔回收早于埋下', exact: true }).waitFor();
        await page.getByLabel('复核状态：人物关系目标不存在', { exact: true }).selectOption('ignored');
        await page.getByLabel('筛选复核状态', { exact: true }).selectOption('ignored');
        await page.waitForFunction(() => document.querySelectorAll('[data-consistency-issue]').length === 1);
        assert.equal(await page.locator('[data-consistency-issue]').count(), 1);
        await page.getByLabel('筛选复核状态', { exact: true }).selectOption('all');
        assert.equal(requests.length, 1);
        const manuscriptBeforeCheck = (await readNovel()).chapters.filter(chapter => chapter.novelId === novelId).map(({ id, title, content }) => ({ id, title, content }));
        responseMode = 'consistency';
        await button('AI 全书检查').click();
        await page.getByRole('dialog', { name: '确认 AI 全书检查范围', exact: true }).waitFor();
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 1000 });
          const box = await page.getByRole('dialog', { name: '确认 AI 全书检查范围', exact: true }).boundingBox();
          assert.ok(box && box.x >= -1 && box.x + box.width <= 321, 'AI sending-scope dialog fits a320px viewport');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.setViewportSize({ width, height: 1000 });
        }
        assert.equal(requests.length, 1, 'Previewing the sending scope does not start a model request');
        await button('确认开始 AI 检查').click();
        await button('继续未完成检查').waitFor();
        await page.locator('[data-consistency-coverage]').getByText(/检查未完成/).waitFor();
        assert.equal(sourceCalls, 1); assert.equal(comparisonCalls, 1);
        await button('继续未完成检查').click(); await button('确认继续 AI 检查').click();
        await page.locator('[data-consistency-coverage]').getByText(/检查已完成，结果待复核/).waitFor();
        assert.equal(sourceCalls, 1, 'Explicit continuation reuses the completed source batch');
        assert.equal(comparisonCalls, 2);
        await page.getByRole('heading', { name: '场景变化需要核对', exact: true }).waitFor();
        await page.getByText('证据未完全核实，仅供人工排查。', { exact: true }).waitFor();
        assert.deepEqual((await readNovel()).chapters.filter(chapter => chapter.novelId === novelId).map(({ id, title, content }) => ({ id, title, content })), manuscriptBeforeCheck, 'Checks never apply model suggestions to the manuscript');
        const download = page.waitForEvent('download'); await button('导出检查报告').click();
        const reportFile = await download;
        const report = JSON.parse(readFileSync(await reportFile.path(), 'utf8').replace(/^\uFEFF/, ''));
        assert.equal(report.novelId, novelId);
        assert.equal(report.ai.status, 'completed');
        assert.ok(!JSON.stringify(report).includes('REVIEW_TEST_KEY'));
        await page.locator('[data-consistency-issue]').filter({ hasText: '场景变化需要核对' }).getByRole('button', { name: '查看章节：雨夜点名', exact: true }).first().click();
        await page.locator('.tiptap').waitFor();
        assert.ok((await chapterText()).includes(aiEditedText));

        // Timeline entries are authored, chapter-linked records; model suggestions require acceptance.
        await reviewTab('人物状态时间线');
        await page.getByLabel('时间线人物', { exact: true }).selectOption('review-linxia');
        await button('添加状态记录').click();
        const timelineForm = page.getByRole('form', { name: '人物状态记录编辑', exact: true });
        await page.getByLabel('状态所属章节', { exact: true }).selectOption(chapterId);
        await timelineForm.getByLabel('故事时间', { exact: true }).fill('第一个夜晚');
        await timelineForm.getByLabel('地点', { exact: true }).fill('教室');
        await timelineForm.getByLabel('身体状态', { exact: true }).fill('尚未受伤');
        await timelineForm.getByLabel('已知信息', { exact: true }).fill('发现钥匙仍在桌上');
        await timelineForm.getByLabel('原文依据', { exact: true }).fill('林夏回到了教室');
        await button('保存状态记录').click();
        await page.getByText('第一个夜晚', { exact: true }).waitFor();
        assert.equal(requests.length, 4, 'Authoring a state is a local operation');

        await button('编辑状态记录：雨夜点名').click();
        await timelineForm.getByLabel('情绪', { exact: true }).fill('紧张但清醒');
        await button('保存状态记录').click();
        assert.equal((await timelineState()).entries[0].emotion, '紧张但清醒');
        await page.getByLabel('状态所属章节', { exact: true }).selectOption('review-chapter-2');
        responseMode = 'timeline';
        await button('AI 提取本章状态').click();
        await button('采纳这条状态').waitFor();
        assert.equal((await timelineState()).entries.length, 1, 'AI output is only a suggestion until accepted');
        await page.getByText(/另有 1 条格式或引用不符，未采纳/).waitFor();
        assert.equal(await button('采纳这条状态').count(), 1, 'An invented source quote never becomes a valid suggestion');
        await button('采纳这条状态').click();
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{"entries":[]}').entries.length === 2, `${key('novel-agent-timeline')}:${isDemo ? 'browser' : 'test-user'}`);
        assert.equal((await timelineState()).entries.find(entry => entry.origin === 'ai-reviewed').chapterId, 'review-chapter-2');
        await page.reload();
        await reviewTab('人物状态时间线');
        await page.getByLabel('时间线人物', { exact: true }).selectOption('review-linxia');
        await page.getByText('第一个夜晚', { exact: true }).waitFor();
        assert.equal(requests.length, 5, 'Reload never automatically re-runs an AI task');
        assert.equal(await page.locator('[data-timeline-entry]').count(), 2);
        assert.ok((await page.locator('[data-timeline-entry]').first().innerText()).includes('雨夜点名'));
        assert.ok((await page.locator('[data-timeline-entry]').nth(1).innerText()).includes('操场灯光'));
        const timelineDownload = page.waitForEvent('download'); await button('导出时间线').click();
        const timelineFile = await timelineDownload;
        const exportedTimeline = JSON.parse(readFileSync(await timelineFile.path(), 'utf8').replace(/^\uFEFF/, ''));
        assert.equal(exportedTimeline.novelId, novelId); assert.equal(exportedTimeline.entries.length, 2);
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.locator('[data-timeline-entry]').first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `timeline-${mode}-${width}.png`) });
        }
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 1000 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Review remains usable at320px');
          if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `timeline-${mode}-320.png`) });
          await page.setViewportSize({ width, height: 1000 });
        }
        await button('删除状态记录：操场灯光').click();
        assert.equal((await timelineState()).entries.length, 1);
        assert.equal((await readNovel()).chapters.filter(chapter => chapter.novelId === novelId).length, 2, 'Deleting a state never deletes a manuscript chapter');

        // New edits invalidate state evidence and report coverage rather than silently certifying it.
        await page.locator('[data-timeline-entry]').first().getByRole('button', { name: '查看原章节', exact: true }).click();
        await page.locator('.tiptap').waitFor();
        await page.locator('.tiptap').fill(revisedText); await page.keyboard.press('Control+s'); await waitChapter(revisedText);
        await reviewTab('人物状态时间线');
        await page.getByText('正文已变化，状态待复核', { exact: true }).waitFor();
        await reviewTab('全书一致性检查');
        await page.getByRole('alert').filter({ hasText: '来自旧稿' }).waitFor();
        assert.equal(requests.length, 5);

        // Stored records cannot bleed into a different work, and returning restores the first work.
        await panel('书架'); await page.locator('#workspace-bookshelf').getByRole('button', { name: '另一部独立作品', exact: true }).click();
        await reviewTab('版本历史');
        assert.equal(await page.getByText('改稿前检查点', { exact: true }).count(), 0);
        assert.equal(await page.getByLabel('历史章节', { exact: true }).locator('option', { hasText: '雨夜点名' }).count(), 0);
        await reviewTab('人物状态时间线'); assert.equal(await page.locator('[data-timeline-entry]').count(), 0);
        await panel('书架'); await page.locator('#workspace-bookshelf').getByRole('button', { name: '创作检查回归样本', exact: true }).click();
        await reviewTab('版本历史'); await page.getByLabel('历史章节', { exact: true }).selectOption(chapterId);
        await page.getByText('改稿前检查点', { exact: true }).waitFor();

        // Deleted chapters can be recovered into this work while retaining all previous checkpoints.
        await navigate('章节'); await page.locator('.tiptap').waitFor();
        if (width < 1024) await page.locator('.chapter-directory-toggle').click();
        await button('删除章节：雨夜点名').click();
        await page.waitForFunction(({ key, chapterId }) => !JSON.parse(localStorage.getItem(key)).state.chapters.some(chapter => chapter.id === chapterId), { key: key('novel-agent-storage'), chapterId });
        await reviewTab('版本历史'); await page.getByLabel('历史章节', { exact: true }).selectOption(chapterId);
        await historyCard('改稿前检查点').getByRole('button', { name: '恢复为新章节', exact: true }).click();
        await page.waitForFunction(({ key, novelId, text }) => JSON.parse(localStorage.getItem(key)).state.chapters.some(chapter => chapter.novelId === novelId && chapter.title === '雨夜点名' && chapter.content.includes(text)), { key: key('novel-agent-storage'), novelId, text: firstText });
        await page.getByText('改稿前检查点', { exact: true }).waitFor();
        assert.equal((await readNovel()).chapters.filter(chapter => chapter.novelId === novelId).length, 2);
        const usage = (await readUsage()).records;
        assert.equal(usage.length, 5);
        assert.equal(usage.filter(record => record.operation === '全书检查').length, 3);
        assert.equal(usage.filter(record => record.operation === '人物时间线').length, 1);
        assert.ok(usage.every(record => record.context.novelId === novelId && record.status !== 'running'));
        assert.deepEqual(errors, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (isDemo) assert.deepEqual(backendRequests, []);
        if (process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `review-${mode}-${width}.png`) });
        }
        results.push(`${width}px: automatic/manual/AI history, preview/restore/deleted recovery; local issues, AI coverage/failure/continue cache and export; manual/reviewed timeline, stale evidence, reload and book isolation`);
      } catch (error) {
        if (page && process.env.SCREENSHOT_DIR) {
          mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, `review-failed-${mode}-${width}.png`) }).catch(() => {});
        }
        throw error;
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
