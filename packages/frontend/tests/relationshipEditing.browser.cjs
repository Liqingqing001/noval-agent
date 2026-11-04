// All relationship edits use browser-local storage; no external or paid model calls.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, readFileSync } = require('node:fs');

const mode = process.env.PARITY_MODE || 'demo', isDemo = mode === 'demo';
const port = 5244;
const base = process.env.RELATIONSHIP_URL || `http://127.0.0.1:${port}${isDemo ? '/noval-agent/' : '/'}`;
const fixture = structuredClone(require('../src/demo/tideMemory.json'));
fixture.characters = fixture.characters.slice(0, 4).map(character => ({ ...character, relationships: [] }));
fixture.chapters = fixture.chapters.slice(0, 2);
fixture.plotCards = []; fixture.worldSettings = []; fixture.foreshadowings = [];
const [first, second, third, fourth] = fixture.characters;
const relation = (targetId, label, directed = false) => ({ targetId, kind: 'ally', label, notes: `关系细节：${label}。只修改关系线的位置，不修改正文或人物档案。`, directed });
first.relationships = [relation(second.id, '共同调查'), relation(second.id, '有所隐瞒', true), relation(third.id, '同班同学')];
second.relationships = [relation(first.id, '暗中保护', true), relation(fourth.id, '同住一室')];
const key = name => isDemo ? `${name}-demo-v1` : name;
const boardKey = `${key('novel-agent-character-board')}:${isDemo ? 'browser' : 'test-user'}:${fixture.novels[0].id}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition, message, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) { if (await condition()) return; await delay(50); }
  throw Error(message);
}
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
const attribute = (name, value) => `[${name}=${JSON.stringify(value)}]`;

(async () => {
  const server = process.env.RELATIONSHIP_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' },
  });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) {
      try { if ((await fetch(base)).ok) break; } catch { /* Wait for this suite's preview. */ }
      if (attempt > 60) throw Error('Relationship preview did not start');
      await delay(200);
    }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const screenshotDir = process.env.RELATIONSHIP_ARTIFACT_DIR || '/tmp/relationship-editing'; mkdirSync(screenshotDir, { recursive: true });
    const results = [];
    for (const width of [390, 1680]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 1280, acceptDownloads: true });
      let cdp, page;
      try {
        page = await context.newPage();
        const errors = [], requests = [], apiWrites = [], data = structuredClone(fixture);
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await context.addInitScript(({ fixture, isDemo }) => {
          if (sessionStorage.getItem('relationship-editing-ready')) return;
          sessionStorage.setItem('relationship-editing-ready', 'true');
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, sessions: [], currentNovelId: fixture.novels[0].id, currentChapterId: fixture.chapters[0].id, currentView: 'characters' } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER'); localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
          }
        }, { fixture, isDemo });
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname, parts = path.split('/').filter(Boolean), resource = parts.at(-1);
          requests.push(path);
          if (request.method() !== 'GET') { apiWrites.push({ path, method: request.method() }); throw Error(`Relationship display/curve adjustment must stay local: ${request.method()} ${path}`); }
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
          else if (resources[resource]) {
            const collection = resources[resource], novelId = parts[1] === 'novels' && parts.length > 3 ? parts[2] : null;
            body = { [collection]: novelId ? data[collection].filter(row => row.novelId === novelId) : data[collection] };
          } else throw Error(`Unexpected relationship GET ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const button = name => page.getByRole('button', { name, exact: true });
        const frames = () => page.evaluate(async () => { for (let count = 0; count < 3; count++) await new Promise(requestAnimationFrame); });
        const ready = () => page.getByRole('status').filter({ hasText: '画布已就绪' }).waitFor();
        const inspector = () => page.getByRole('complementary', { name: '人物详情', exact: true });
        const node = id => page.locator(attribute('data-character-node', id));
        const path = id => page.locator(attribute('data-character-edge', id));
        const canvas = page.getByLabel('人物关系画布', { exact: true });
        const readBoard = () => page.evaluate(async key => {
          const db = await new Promise((resolve, reject) => { const request = indexedDB.open('novel-agent-reference-library-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
          try { return await new Promise((resolve, reject) => { const tx = db.transaction('workspaces'), request = tx.objectStore('workspaces').get(key); tx.oncomplete = () => resolve(request.result); tx.onerror = reject; }); } finally { db.close(); }
        }, boardKey);
        const transform = () => page.locator('.character-board-world').evaluate(element => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform); return { scale: matrix.a, x: matrix.e, y: matrix.f };
        });
        const nodeStyles = () => page.locator('[data-character-node]').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.dataset.characterNode, element.getAttribute('style')])));
        const paths = () => page.locator('[data-character-edge]').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.dataset.characterEdge, element.getAttribute('d')])));
        const openDetails = async id => { await node(id).focus(); await node(id).press('Enter'); await inspector().waitFor(); };
        const fits = async locator => {
          const bounds = await locator.boundingBox(), size = page.viewportSize(); assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= size.width + 1 && bounds.y + bounds.height <= size.height + 1, `Floating view outside ${size.width}px viewport`);
        };
        await page.goto(base); await ready(); await frames();
        await until(async () => (await readBoard())?.edges.length === 5, 'Preset relationships did not persist');
        assert.equal(await nodeStyles().then(Object.keys).then(ids => ids.length), 4);
        const originalBoard = await readBoard(), originalView = await transform(), originalManuscripts = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state.chapters, key('novel-agent-storage'));

        // An associated-person row selects a relationship without replacing the anchor or siblings.
        await openDetails(first.id);
        const relatedRows = () => inspector().locator('[data-related-person]');
        assert.equal(await inspector().getAttribute('data-inspector-person'), first.id);
        const relatedIds = await relatedRows().evaluateAll(elements => elements.map(element => element.dataset.relatedPerson));
        assert.deepEqual([...relatedIds].sort(), [second.id, third.id].sort());
        await inspector().locator(`[data-related-person="${second.id}"]`).click();
        assert.equal(await inspector().getAttribute('data-inspector-person'), first.id, 'Selecting a related row must not navigate every row to another person');
        assert.deepEqual(await relatedRows().evaluateAll(elements => elements.map(element => element.dataset.relatedPerson)), relatedIds);
        await inspector().locator(`[data-inspector-pair="${second.id}"]`).waitFor();
        for (const label of ['共同调查', '有所隐瞒', '暗中保护']) await inspector().locator(`[data-inspector-pair="${second.id}"]`).getByText(label, { exact: true }).waitFor();
        await inspector().locator(`[data-related-person="${third.id}"]`).click();
        assert.equal(await inspector().getAttribute('data-inspector-person'), first.id);
        assert.deepEqual(await relatedRows().evaluateAll(elements => elements.map(element => element.dataset.relatedPerson)), relatedIds);
        await inspector().locator(`[data-inspector-pair="${third.id}"]`).waitFor();
        await inspector().locator(`[data-related-person="${second.id}"]`).click();
        await inspector().getByRole('button', { name: `查看${second.name}档案`, exact: true }).click();
        await until(async () => (await inspector().getAttribute('data-inspector-person')) === second.id, 'Explicit profile navigation did not change the anchor');
        await inspector().getByRole('button', { name: `返回${first.name}档案`, exact: true }).click();
        assert.equal(await inspector().getAttribute('data-inspector-person'), first.id);
        await fits(inspector());
        await inspector().locator(`[data-related-person="${second.id}"]`).click();
        await page.screenshot({ path: resolve(screenshotDir, `inspector-${mode}-${width}.png`) });
        await inspector().getByRole('button', { name: '只看这两人', exact: true }).click(); await inspector().waitFor({ state: 'hidden' }); await frames();
        assert.deepEqual(Object.keys(await nodeStyles()).sort(), [first.id, second.id].sort(), 'Pair view contains only the selected two people');
        assert.equal(await page.locator('[data-character-edge]').count(), 3, 'Pair view preserves every parallel and opposite-direction relationship');
        assert.equal(await page.getByLabel('只看一个人的关系').inputValue(), first.id);
        assert.equal(await page.getByLabel('只看两个人的关系').inputValue(), second.id);
        assert.deepEqual(await readBoard(), originalBoard, 'Selecting a person or pair never rewrites saved layout or relationships');

        // Select a line, then move its own handle; canvas and character positions stay fixed.
        const chosen = originalBoard.edges.find(edge => edge.label === '共同调查'), otherIds = originalBoard.edges.filter(edge => edge.source === first.id && edge.target === second.id || edge.source === second.id && edge.target === first.id).filter(edge => edge.id !== chosen.id).map(edge => edge.id);
        const selectLine = async () => {
          const point = await page.locator(attribute('data-edge-drag', chosen.id)).evaluate(element => {
            const matrix = element.getScreenCTM();
            for (const fraction of [.25, .75, .15, .85, .4, .6]) {
              const local = element.getPointAtLength(element.getTotalLength() * fraction), world = new DOMPoint(local.x, local.y).matrixTransform(matrix);
              if (document.elementFromPoint(world.x, world.y)?.closest('[data-edge-drag]') === element) return { x: world.x, y: world.y };
            }
            throw Error('No unobstructed point on selected relationship line');
          });
          await page.mouse.click(point.x, point.y);
        };
        const handle = () => page.locator(attribute('data-edge-handle', chosen.id));
        await selectLine(); await handle().waitFor();
        const label = page.locator(attribute('data-edge-label', chosen.id));
        await label.focus(); await label.press('Space'); await frames();
        assert.equal(await handle().evaluate(element => document.activeElement === element), true, 'Space selects a relation and focuses its move handle');
        const beforeKeyboardView = await transform(), beforeKeyboardNodes = await nodeStyles(), beforeKeyboardPaths = await paths();
        await handle().press('ArrowDown'); await ready(); await frames();
        await until(async () => JSON.stringify((await readBoard()).edges.find(edge => edge.id === chosen.id)) !== JSON.stringify(chosen), 'Keyboard adjustment did not persist');
        assert.notEqual(await path(chosen.id).getAttribute('d'), beforeKeyboardPaths[chosen.id]);
        assert.deepEqual(await nodeStyles(), beforeKeyboardNodes); assert.deepEqual(await transform(), beforeKeyboardView);
        for (const id of otherIds) assert.equal(await path(id).getAttribute('d'), beforeKeyboardPaths[id], 'Keyboard movement only adjusts the selected line');
        await button('恢复连线自动位置').click(); await ready(); await frames();
        await until(async () => JSON.stringify(await readBoard()) === JSON.stringify(originalBoard), 'Restoring automatic curve position did not remove the manual adjustment');
        await button('放大画布').click(); await frames();
        const beforeDragView = await transform(), beforeNodes = await nodeStyles(), beforePaths = await paths(), beforeHandle = await handle().boundingBox();
        assert.ok(beforeHandle && beforeHandle.width >= 20, 'The selected line has a touchable handle');
        const start = { x: beforeHandle.x + beforeHandle.width / 2, y: beforeHandle.y + beforeHandle.height / 2 };
        const target = { x: start.x + 9, y: start.y + 28 };
        if (width < 1280) {
          cdp = await context.newCDPSession(page);
          const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ ...point, radiusX: 1, radiusY: 1, force: 1 })) });
          await touch('touchStart', [{ id: 1, ...start }]); await touch('touchMove', [{ id: 1, ...target }]); await touch('touchEnd', []);
        } else {
          await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 6 }); await page.mouse.up();
        }
        await ready(); await frames();
        await until(async () => JSON.stringify((await readBoard()).edges.find(edge => edge.id === chosen.id)) !== JSON.stringify(chosen), 'Line drag did not persist its adjustment');
        const edited = await readBoard(), editedEdge = edited.edges.find(edge => edge.id === chosen.id);
        assert.notDeepEqual(editedEdge, chosen, 'An individual line adjustment persists on its own edge');
        assert.notEqual(await path(chosen.id).getAttribute('d'), beforePaths[chosen.id], 'Dragging the line changes its curve');
        assert.deepEqual(await transform(), beforeDragView, 'Dragging a relation must not pan or zoom the canvas');
        assert.deepEqual(await nodeStyles(), beforeNodes, 'Dragging a relation must not move either character');
        for (const id of otherIds) assert.equal(await path(id).getAttribute('d'), beforePaths[id], 'Adjusting one line leaves parallel lines unchanged');
        assert.deepEqual(edited.nodes, originalBoard.nodes);
        assert.deepEqual(edited.edges.filter(edge => edge.id !== chosen.id), originalBoard.edges.filter(edge => edge.id !== chosen.id));
        await page.screenshot({ path: resolve(screenshotDir, `pair-${mode}-${width}.png`) });

        // A second finger cancels the provisional line drag and hands control to pinch.
        if (width < 1280) {
          const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ ...point, radiusX: 1, radiusY: 1, force: 1 })) });
          const handleBounds = await handle().boundingBox(), canvasBounds = await canvas.boundingBox();
          const one = { id: 11, x: handleBounds.x + handleBounds.width / 2, y: handleBounds.y + handleBounds.height / 2 };
          const moved = { ...one, y: one.y + 10 }, two = { id: 12, x: Math.min(canvasBounds.x + canvasBounds.width - 12, one.x + 55), y: one.y };
          const savedPaths = await paths(), savedView = await transform();
          await touch('touchStart', [one]); await touch('touchMove', [moved]); await frames();
          assert.notEqual(await path(chosen.id).getAttribute('d'), savedPaths[chosen.id], 'First finger can provisionally bend the selected line');
          await touch('touchStart', [moved, two]); await frames();
          assert.equal(await path(chosen.id).getAttribute('d'), savedPaths[chosen.id], 'Second finger rolls back the provisional curve before pinch');
          const spread = [{ ...moved, x: moved.x - 10 }, { ...two, x: two.x + 10 }];
          await touch('touchMove', spread); await frames();
          assert.ok((await transform()).scale > savedView.scale, 'Second finger starts canvas pinch');
          await touch('touchEnd', [spread[0]]); const afterPinch = await transform();
          await touch('touchMove', [{ ...spread[0], y: spread[0].y + 12 }]); await frames(); assert.deepEqual(await transform(), afterPinch, 'Remaining finger cannot become an accidental line or canvas drag');
          await touch('touchEnd', []); await frames(); await delay(380);
          assert.deepEqual(await readBoard(), edited, 'Pinch cancels the pending line adjustment instead of committing it');
          assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await inspector().count(), 0); assert.equal(await page.locator('[data-link-preview]').count(), 0);
        }

        const download = page.waitForEvent('download'); await button('导出人物关系与状态').click();
        const exported = JSON.parse(readFileSync(await (await download).path(), 'utf8').replace(/^\uFEFF/, ''));
        assert.deepEqual(exported.edges, edited.edges, 'JSON export retains the per-line adjustment');
        await button('返回全部关系').click(); await frames();
        assert.equal(await page.locator('[data-character-node]').count(), 4); assert.equal(await page.locator('[data-character-edge]').count(), 5);
        assert.deepEqual(await transform(), originalView, 'Returning from pair mode restores the original overview transform');
        assert.deepEqual(await readBoard(), edited, 'Returning to the overview preserves every saved node and relationship');
        await page.reload(); await ready(); await frames();
        assert.deepEqual(await readBoard(), edited, 'Adjusted relationship survives reload');
        assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state.chapters, key('novel-agent-storage')), originalManuscripts, 'Relationship inspection does not change chapter manuscripts');
        await page.getByLabel('只看一个人的关系').selectOption(first.id); await frames();
        assert.equal(await page.locator('[data-character-node]').count(), 3); assert.equal(await page.locator('[data-character-edge]').count(), 4);
        await page.getByLabel('只看两个人的关系').selectOption(second.id); await frames();
        assert.equal(await page.locator('[data-character-node]').count(), 2); assert.equal(await page.locator('[data-character-edge]').count(), 3);
        if (width < 1280) {
          await page.setViewportSize({ width: 320, height: 568 }); await frames();
          assert.ok(await canvas.evaluate(element => element.clientHeight >= 150), 'Pair controls leave usable canvas height at 320px');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Pair controls do not overflow horizontally');
          for (const control of [page.getByLabel('只看一个人的关系'), page.getByLabel('只看两个人的关系'), button('适应画布'), button('返回全部关系')]) await fits(control);
          await page.screenshot({ path: resolve(screenshotDir, `pair-${mode}-320.png`) });
          await openDetails(first.id); await inspector().locator(`[data-related-person="${second.id}"]`).click(); await fits(inspector());
          await page.screenshot({ path: resolve(screenshotDir, `inspector-${mode}-320.png`) }); await button('关闭人物详情').click();
        }
        assert.deepEqual(apiWrites, []); if (isDemo) assert.deepEqual(requests, []); assert.deepEqual(errors, []);
        results.push(`${width}px: stable related-person selection/profile back; two-person parallel/opposite edges; keyboard line movement/automatic reset; single-line ${width < 1280 ? 'touch' : 'mouse'} drag at zoom; node/view/other-edge isolation; local export/reload${width < 1280 ? '; native pinch rollback/remaining-finger suppression; 320px pair/inspector bounds' : ''}`);
      } catch (error) {
        await page?.screenshot({ path: resolve(screenshotDir, `failure-${mode}-${width}.png`) }).catch(() => {});
        throw error;
      } finally { await cdp?.detach(); await context.close(); }
    }
    console.log(JSON.stringify({ mode, url: base, results, screenshots: screenshotDir }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
