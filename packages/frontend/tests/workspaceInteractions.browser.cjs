// Shared desktop/touch regression. All API writes are intercepted inside this browser context.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');
const library = require('../src/demo/library.json');
const isDemo = (process.env.PARITY_MODE || 'demo') === 'demo';
const mode = isDemo ? 'demo' : 'full';
const base = process.env.INTERACTIONS_URL || `http://127.0.0.1:5202${isDemo ? '/noval-agent/' : '/'}`;
const key = name => isDemo ? `${name}-demo-v1` : name;
const school = library.novels.find(novel => novel.id === 'demo-school-night');
const tide = library.novels.find(novel => novel.id === 'demo-tide-remembers');
const profiles = library.characters.filter(character => character.novelId === tide.id);
const [first, second, third, fourth] = profiles;
const fixture = structuredClone(library);
fixture.characters = fixture.characters.map(character => character.novelId !== tide.id ? character : ({ ...character, relationships: [] }));
const relation = (targetId, label) => ({ targetId, kind: 'ally', label, notes: '用于隔离聚焦视图的浏览器测试', directed: false });
fixture.characters.find(character => character.id === first.id).relationships = [relation(second.id, '直接关系甲'), relation(second.id, '同一人物的另一条关系'), relation(third.id, '直接关系乙')];
fixture.characters.find(character => character.id === second.id).relationships = [relation(third.id, '相关人物之间的关系')];
fixture.characters.find(character => character.id === third.id).relationships = [relation(fourth.id, '另一支关系')];
const boardKey = `${key('novel-agent-character-board')}:${isDemo ? 'browser' : 'test-user'}:${tide.id}`;

(async () => {
  const server = process.env.INTERACTIONS_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5202', '--strictPort'], { cwd: resolve(__dirname, '..'), stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' } });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) { try { if ((await fetch(base)).ok) break; } catch {} if (attempt > 60) throw Error('Interactions preview did not start'); await new Promise(resolve => setTimeout(resolve, 200)); }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    mkdirSync('/tmp/workspace-interactions', { recursive: true });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 1280 });
      try {
        const data = structuredClone(fixture), page = await context.newPage(), errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.addInitScript(({ fixture, isDemo, schoolId }) => {
          if (sessionStorage.getItem('workspace-interaction-ready')) return;
          sessionStorage.setItem('workspace-interaction-ready', 'yes');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, sessions: [], currentNovelId: schoolId, currentChapterId: fixture.chapters.find(chapter => chapter.novelId === schoolId).id, currentView: 'chapters' } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
          }
        }, { fixture, isDemo, schoolId: school.id });
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname, parts = path.split('/').filter(Boolean), resource = parts.at(-1);
          requests.push({ path, method: request.method() });
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
          else if (request.method() === 'GET' && resources[resource]) {
            const collection = resources[resource], novelId = parts[1] === 'novels' && parts.length > 3 ? parts[2] : null;
            body = { [collection]: novelId ? data[collection].filter(row => row.novelId === novelId) : data[collection] };
          } else if (request.method() === 'PUT') {
            const item = Object.values(data).flat().find(item => item.id === resource);
            assert.ok(item, `Unknown mocked record ${resource}`); Object.assign(item, request.postDataJSON());
            body = { novel: item, chapter: item, character: item, plotCard: item };
          } else throw Error(`Unexpected backend request: ${request.method()} ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const button = name => page.getByRole('button', { name, exact: true });
        const menu = () => page.getByRole('menu');
        const item = name => menu().getByRole('menuitem', { name, exact: true });
        const card = id => page.locator(`.shelf-book[data-novel-id="${id}"]`);
        const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).state, key('novel-agent-storage'));
        const panel = async name => { if (width < 1280) await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name, exact: true }).click(); };
        const openShelf = () => panel('书架');
        const navigate = async name => { await openShelf(); await page.locator('#workspace-bookshelf').getByRole('button', { name, exact: true }).click(); };
        const openBookMenu = async novel => { await button(`更多操作：${novel.title}`).click(); await menu().waitFor(); };
        const assertFits = async locator => {
          const viewport = page.viewportSize(), box = await locator.boundingBox(); assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${mode}/${viewport.width}: floating surface outside viewport`);
        };
        const closePreview = async (trigger, outside = false) => {
          if (outside) await page.mouse.click(5, 5); else await page.keyboard.press('Escape');
          await page.locator('[data-image-preview]').waitFor({ state: 'hidden' });
          if (trigger) {
            // Radix returns focus after the unmount microtask; wait for the user-visible result.
            await page.waitForFunction(node => document.activeElement === node, await trigger.elementHandle(), { timeout: 3000 });
            assert.equal(await trigger.evaluate(node => document.activeElement === node), true, 'Preview restores keyboard focus');
          }
        };
        const saved = () => page.getByRole('status').filter({ hasText: '画布已就绪' }).waitFor();
        const readBoard = () => page.evaluate(async key => {
          const db = await new Promise((resolve, reject) => { const request = indexedDB.open('novel-agent-reference-library-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
          try { return await new Promise((resolve, reject) => { const tx = db.transaction('workspaces'); const request = tx.objectStore('workspaces').get(key); tx.oncomplete = () => resolve(request.result); tx.onerror = reject; }); } finally { db.close(); }
        }, boardKey);

        await page.goto(base); await page.locator('.tiptap').waitFor(); await openShelf();
        assert.equal(await card(tide.id).locator('.shelf-book-actions').count(), 0, 'Book actions no longer occupy a bottom row');
        assert.equal(await card(tide.id).getByRole('button', { name: `更多操作：${tide.title}`, exact: true }).count(), 1);
        const coverButton = button(`预览封面：${tide.title}`);
        await coverButton.click();
        await page.getByRole('dialog', { name: `预览${tide.title}书封`, exact: true }).waitFor();
        await assertFits(page.locator('[data-image-preview]'));
        assert.equal((await state()).currentNovelId, school.id, 'Cover preview must not select its book');
        await closePreview(coverButton);
        await coverButton.click(); await page.locator('[data-image-preview]').waitFor(); await closePreview(coverButton, true);
        assert.equal((await state()).currentNovelId, school.id, 'Backdrop close does not select the previewed book');
        await page.screenshot({ path: `/tmp/workspace-interactions/bookshelf-${mode}-${width}.png` });

        await openBookMenu(tide); await assertFits(menu());
        for (const name of ['预览封面', '更换封面', '移除封面', '重命名小说', '删除小说']) await item(name).waitFor();
        await page.keyboard.press('End'); assert.equal(await item('删除小说').evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Home'); assert.equal(await item('预览封面').evaluate(node => node === document.activeElement), true);
        await page.keyboard.press('Escape'); await menu().waitFor({ state: 'hidden' });
        await openBookMenu(tide); await page.mouse.click(2, 2); await menu().waitFor({ state: 'hidden' });
        await card(tide.id).click({ button: 'right' }); await item('预览封面').waitFor();
        assert.equal((await state()).currentNovelId, school.id, 'Right click must not select its book');
        await page.keyboard.press('Escape'); await card(tide.id).getByRole('button', { name: tide.title, exact: true }).focus();
        await page.keyboard.press('Shift+F10'); await item('重命名小说').waitFor(); await page.keyboard.press('Escape');
        await openBookMenu(tide); page.once('dialog', dialog => dialog.dismiss()); await item('删除小说').click();
        assert.equal((await state()).novels.length, fixture.novels.length, 'Cancel deletion preserves every book');
        await openBookMenu(tide); page.once('dialog', dialog => dialog.dismiss()); await item('移除封面').click();
        assert.ok((await state()).novels.find(novel => novel.id === tide.id).cover, 'Cancel removal preserves cover');

        await openBookMenu(school); await item('重命名小说').click();
        const rename = card(school.id).locator('input'); await rename.fill('取消后不可保存的书名');
        assert.equal(await rename.evaluate(node => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }); node.dispatchEvent(e); return e.defaultPrevented; }), false, 'Inline input keeps native context menu');
        await rename.press('Escape'); assert.equal((await state()).novels.find(novel => novel.id === school.id).title, school.title);
        await openBookMenu(school); await item('重命名小说').click(); await card(school.id).locator('input').fill(`${school.title}（测试）`); await card(school.id).locator('input').press('Enter');
        assert.equal((await state()).novels.find(novel => novel.id === school.id).title, `${school.title}（测试）`);

        await openBookMenu(tide); page.once('dialog', dialog => dialog.accept()); await item('移除封面').click();
        assert.ok(!(await state()).novels.find(novel => novel.id === tide.id).cover);
        await openBookMenu(tide); await item('添加封面').waitFor();
        const chooser = page.waitForEvent('filechooser'); await item('添加封面').click();
        await (await chooser).setFiles({ name: 'preview-test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC2kAAAAASUVORK5CYII=', 'base64') });
        await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).state.novels.find(novel => novel.id === id).cover?.startsWith('data:image/png'), { key: key('novel-agent-storage'), id: tide.id });
        assert.equal((await state()).currentNovelId, school.id, 'Upload action does not select the book');
        assert.equal(await card(tide.id).evaluate(node => getComputedStyle(node).userSelect), 'none');

        await card(tide.id).getByRole('button', { name: tide.title, exact: true }).click(); await page.locator('.tiptap').waitFor();
        const manuscript = page.locator('.tiptap');
        assert.notEqual(await manuscript.evaluate(node => getComputedStyle(node).userSelect), 'none', 'Manuscript remains selectable');
        assert.equal(await manuscript.evaluate(node => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }); node.dispatchEvent(e); return e.defaultPrevented; }), false, 'Manuscript keeps native copy context menu');
        await manuscript.click(); await page.keyboard.press('ControlOrMeta+a');
        assert.ok(await page.evaluate(() => (getSelection()?.toString().length || 0) > 20), 'Text can still be selected for copy');
        await page.keyboard.press('ArrowRight');
        if (width < 768) await page.getByRole('button', { name: /^章节目录/ }).click();
        const chapterEntry = page.locator('.chapter-entry > button').first();
        await chapterEntry.click({ button: 'right' }); await menu().waitFor();
        await item('重命名章节').waitFor(); await item('删除章节').waitFor(); await page.keyboard.press('Escape');

        await navigate('人物'); await saved();
        assert.equal(await page.locator('[data-character-node]').count(), profiles.length);
        const firstNode = button(`查看人物：${first.name}`); await firstNode.focus(); await firstNode.press('ArrowRight'); await saved();
        const before = await readBoard(), priorTransform = await page.locator('.character-board-world').getAttribute('style');
        await page.getByLabel('只看一个人的关系', { exact: true }).selectOption(first.id);
        await page.locator(`[data-character-focus="${first.id}"]`).waitFor();
        assert.deepEqual((await page.locator('[data-character-node]').evaluateAll(nodes => nodes.map(node => node.dataset.characterNode))).sort(), [first.id, second.id, third.id].sort());
        const focusedEdges = await page.locator('[data-character-edge]').evaluateAll(edges => edges.map(edge => ({ source: edge.dataset.source, target: edge.dataset.target })));
        assert.equal(focusedEdges.length, 3); assert.ok(focusedEdges.every(edge => edge.source === first.id || edge.target === first.id), 'Peer relations must not clutter the central person view');
        assert.deepEqual(await readBoard(), before, 'Focus does not rewrite graph state');
        await button('查看关系清单').click();
        const relationList = page.getByRole('dialog', { name: `${first.name}的直接关系`, exact: true });
        await relationList.waitFor(); await assertFits(relationList);
        for (const name of [second.name, third.name]) {
          await relationList.getByText(name, { exact: true }).waitFor();
          const avatarButton = relationList.getByRole('button', { name: `预览${name}头像`, exact: true });
          await avatarButton.waitFor();
          await avatarButton.getByRole('img', { name: `${name}人物头像`, exact: true }).waitFor({ state: 'attached' });
          await avatarButton.locator('img').evaluate(image => image.decode());
        }
        for (const label of ['直接关系甲', '同一人物的另一条关系', '直接关系乙']) await relationList.getByText(label, { exact: true }).waitFor();
        assert.equal(await relationList.getByText('相关人物之间的关系', { exact: true }).count(), 0);
        assert.equal(await relationList.getByText('另一支关系', { exact: true }).count(), 0);
        const notes = relationList.getByText('用于隔离聚焦视图的浏览器测试', { exact: true });
        assert.equal(await notes.count(), 3, 'Multiple relationships with the same person keep every note');
        assert.ok(await notes.evaluateAll(nodes => nodes.every(node => Number.parseFloat(getComputedStyle(node).fontSize) >= 14)), 'Relationship notes remain readable instead of shrinking with the graph');
        await relationList.evaluate(async node => { await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
        await page.screenshot({ path: `/tmp/workspace-interactions/relations-${mode}-${width}.png` });
        await page.keyboard.press('Escape'); await relationList.waitFor({ state: 'hidden' });
        await page.waitForFunction(node => document.activeElement === node, await button('查看关系清单').elementHandle(), { timeout: 3000 });
        await page.locator(`[data-character-focus="${first.id}"]`).waitFor();
        assert.deepEqual(await readBoard(), before, 'Opening and closing the relation list does not change graph state');
        await page.getByLabel('只看一个人的关系', { exact: true }).selectOption(profiles[4].id);
        assert.equal(await page.locator('[data-character-node]').count(), 1, 'An isolated central person remains visible');
        assert.equal(await page.locator('[data-character-edge]').count(), 0);
        await page.locator(`[data-character-focus="${profiles[4].id}"]`).getByText('此人还没有关系记录。', { exact: false }).waitFor();
        await button('返回全部关系').click();
        assert.equal(await page.locator('[data-character-node]').count(), profiles.length);
        assert.equal(await page.locator('.character-board-world').getAttribute('style'), priorTransform);
        assert.deepEqual(await readBoard(), before);
        await firstNode.click({ button: 'right' }); await item('聚焦此人').click();
        await page.locator(`[data-character-focus="${first.id}"]`).waitFor();
        await button('返回全部关系').click();
        await firstNode.focus(); await page.keyboard.press('Shift+F10'); await item('预览人物头像').click();
        const portraitPreview = page.getByRole('dialog', { name: `预览${first.name}头像`, exact: true });
        await portraitPreview.waitFor();
        assert.equal(await portraitPreview.locator('[data-preview-cell]').getAttribute('data-preview-cell'), '0,4,2', 'Avatar preview crops just one atlas cell');
        await assertFits(portraitPreview); await page.screenshot({ path: `/tmp/workspace-interactions/portrait-${mode}-${width}.png` });
        await closePreview();
        await button('人物列表').click();
        const portraitButton = button(`预览${first.name}头像`); await portraitButton.click();
        await page.getByRole('dialog', { name: `预览${first.name}头像`, exact: true }).waitFor();
        assert.equal(await page.getByRole('dialog').count(), 1, 'Clicking portrait must not also open character editor');
        await closePreview(portraitButton);
        await portraitButton.click(); await page.locator('[data-image-preview]').waitFor(); await closePreview(portraitButton, true);
        assert.equal(await page.getByRole('dialog').count(), 0, 'Backdrop close must not click through to character editor');
        await page.getByRole('heading', { name: first.name, exact: true }).click();
        const personality = page.getByRole('dialog').locator('textarea').first();
        assert.notEqual(await personality.evaluate(node => getComputedStyle(node).userSelect), 'none');
        assert.equal(await personality.evaluate(node => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }); node.dispatchEvent(e); return e.defaultPrevented; }), false);
        await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
        await openShelf();
        const schoolTitle = (await state()).novels.find(novel => novel.id === school.id).title;
        await card(school.id).getByRole('button', { name: schoolTitle, exact: true }).click();
        await navigate('人物'); await saved(); await button('人物列表').click();
        const schoolProfile = fixture.characters.filter(character => character.novelId === school.id).at(-1);
        const schoolPortraitButton = button(`预览${schoolProfile.name}头像`);
        await schoolPortraitButton.click();
        assert.equal(await page.locator('[data-image-preview] [data-preview-cell]').getAttribute('data-preview-cell'), '11,4,3', 'School portraits also crop the correct nonzero atlas cell');
        await closePreview(schoolPortraitButton, true);
        if (width === 390) {
          await page.setViewportSize({ width: 320, height: 568 }); await openShelf();
          await openBookMenu(tide); await assertFits(menu());
          await page.screenshot({ path: `/tmp/workspace-interactions/menu-${mode}-320.png` }); await page.keyboard.press('Escape');
          await card(school.id).getByRole('button', { name: /^预览封面：/ }).click();
          await page.locator('[data-image-preview]').waitFor(); await assertFits(page.locator('[data-image-preview]'));
          await page.screenshot({ path: `/tmp/workspace-interactions/cover-${mode}-320.png` }); await closePreview();
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []); if (isDemo) assert.deepEqual(requests, []);
        results.push(`${width}px: compact book controls, click/right-click/keyboard menus, cover/avatar preview, atlas crop, focus restore, cancellation/upload/rename, direct relationship focus with no data mutation, selectable manuscript and native input menus`);
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ mode, results, screenshots: '/tmp/workspace-interactions' }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
