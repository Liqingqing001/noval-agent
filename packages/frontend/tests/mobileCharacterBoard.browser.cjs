// Native Chromium touch regression: CDP emits real multi-contact touch/pointer streams.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');
const source = require('../src/demo/tideMemory.json');
const mode = process.env.PARITY_MODE || 'demo';
const isDemo = mode === 'demo';
const base = process.env.MOBILE_BOARD_URL || `http://127.0.0.1:5208${isDemo ? '/noval-agent/' : '/'}`;
const storageKey = name => isDemo ? `${name}-demo-v1` : name;
const fixture = structuredClone(source);
fixture.characters = fixture.characters.map(character => ({ ...character, relationships: [] }));
fixture.characters[0].relationships = [{ targetId: fixture.characters[1].id, kind: 'ally', label: '保持原有关系', notes: '缩放仅改变视图，不改写人物或关系。', directed: false }];
const boardKey = `${storageKey('novel-agent-character-board')}:${isDemo ? 'browser' : 'test-user'}:${fixture.novels[0].id}`;
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);

(async () => {
  const server = process.env.MOBILE_BOARD_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5208', '--strictPort'], { cwd: resolve(__dirname, '..'), stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' } });
  let browser;
  try {
    if (server) for (let attempt = 0; ; attempt++) { try { if ((await fetch(base)).ok) break; } catch {} if (attempt > 60) throw Error('Mobile board preview did not start'); await new Promise(resolve => setTimeout(resolve, 200)); }
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    mkdirSync('/tmp/mobile-character-board', { recursive: true });
    const results = [];
    for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
      let cdp;
      try {
        const data = structuredClone(fixture), page = await context.newPage(), errors = [], writes = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.addInitScript(({ fixture, isDemo }) => {
          const key = name => isDemo ? `${name}-demo-v1` : name;
          localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, sessions: [], currentNovelId: fixture.novels[0].id, currentChapterId: fixture.chapters[0].id, currentView: 'characters' } }));
          if (!isDemo) {
            localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER');
            localStorage.setItem('novel-agent-migrated', 'true');
            localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
          }
        }, { fixture, isDemo });
        await page.route('**/api/**', async route => {
          const request = route.request(), path = new URL(request.url()).pathname, parts = path.split('/').filter(Boolean), resource = parts.at(-1);
          if (request.method() !== 'GET') { writes.push({ path, method: request.method() }); throw Error(`Touch/view inspection must not mutate API data: ${request.method()} ${path}`); }
          const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
          let body;
          if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
          else if (resources[resource]) {
            const collection = resources[resource], novelId = parts[1] === 'novels' && parts.length > 3 ? parts[2] : null;
            body = { [collection]: novelId ? data[collection].filter(row => row.novelId === novelId) : data[collection] };
          } else throw Error(`Unexpected mocked GET ${path}`);
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const button = name => page.getByRole('button', { name, exact: true });
        const frames = () => page.evaluate(async () => { for (let count = 0; count < 3; count++) await new Promise(requestAnimationFrame); });
        const readBoard = () => page.evaluate(async key => {
          const db = await new Promise((resolve, reject) => { const request = indexedDB.open('novel-agent-reference-library-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
          try { return await new Promise((resolve, reject) => { const tx = db.transaction('workspaces'), request = tx.objectStore('workspaces').get(key); tx.oncomplete = () => resolve(request.result); tx.onerror = reject; }); } finally { db.close(); }
        }, boardKey);
        const transform = () => page.locator('.character-board-world').evaluate(element => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
          return { scale: matrix.a, x: matrix.e, y: matrix.f };
        });
        const canvas = page.getByLabel('人物关系画布', { exact: true });
        const assertNoAccidentalAction = async baseline => {
          // Taps are deferred to distinguish double taps; wait past that user gesture window.
          await page.waitForTimeout(380);
          assert.equal(await page.locator('[data-link-preview]').count(), 0, 'Pinch must not start a connection');
          assert.equal(await page.getByRole('dialog').count(), 0, 'Pinch must not open a relationship/profile dialog');
          assert.equal(await page.getByRole('complementary', { name: '人物详情' }).count(), 0, 'Pinch must not open a profile drawer');
          assert.deepEqual(await readBoard(), baseline, 'Pinch must not save provisional node positions or alter relationships');
        };
        const blankPoint = () => canvas.evaluate(element => {
          const box = element.getBoundingClientRect();
          for (const y of [18, box.height - 18, box.height * .5, box.height * .7]) for (const x of [18, box.width - 45, box.width * .5]) {
            const point = { x: box.x + x, y: box.y + y };
            const hit = document.elementFromPoint(point.x, point.y);
            if (element.contains(hit) && !hit.closest('[data-character-node],[data-board-control]')) return point;
          }
          throw Error('No blank canvas region available for single-finger pan');
        });
        const pinchPoints = () => canvas.evaluate(element => {
          const box = element.getBoundingClientRect(), half = Math.min(45, box.width * .13);
          for (const localY of [18, box.height - 30, box.height * .5, box.height * .7]) {
            const center = { x: box.x + box.width / 2, y: box.y + localY };
            const points = [{ id: 1, x: center.x - half, y: center.y }, { id: 2, x: center.x + half, y: center.y }];
            if (points.every(point => { const hit = document.elementFromPoint(point.x, point.y); return element.contains(hit) && !hit.closest('[data-character-node],[data-board-control]'); })) return { points, center };
          }
          throw Error('No pair of blank points for native pinch');
        });
        await page.goto(base);
        await page.getByRole('status').filter({ hasText: '画布已就绪' }).waitFor();
        await frames();
        assert.equal(await page.locator('[data-character-node]').count(), fixture.characters.length);
        const toolbar = page.locator('.character-board-toolbar'), board = page.locator('.character-board');
        const toolbarBox = await toolbar.boundingBox(), boardBox = await board.boundingBox(), canvasBox = await canvas.boundingBox();
        assert.ok(canvasBox.height >= Math.min(200, boardBox.height * .5), `${width}×${height}: canvas squeezed to ${canvasBox.height}px of ${boardBox.height}px`);
        assert.ok(canvasBox.height >= Math.min(180, height * .3), `${width}×${height}: insufficient touch canvas height`);
        assert.ok(await toolbar.evaluate(element => element.scrollHeight <= element.clientHeight + 1 && !['auto', 'scroll'].includes(getComputedStyle(element).overflowY)), 'Primary toolbar must not be hidden inside an independently scrolling header');
        for (const locator of [page.getByLabel('搜索画布人物'), page.getByLabel('只看一个人的关系'), button('适应画布'), button('放大画布'), button('缩小画布'), button('添加人物'), button('添加关系'), button('更多工具'), button('导出人物关系与状态'), button('展开人物画布')]) {
          const box = await locator.boundingBox();
          assert.ok(box && box.y >= toolbarBox.y - 1 && box.y + box.height <= toolbarBox.y + toolbarBox.height + 1 && box.x >= 0 && box.x + box.width <= width + 1, `Primary control outside toolbar at ${width}×${height}`);
        }
        assert.equal(await page.getByRole('dialog', { name: '画布操作说明', exact: true }).count(), 0, 'Long instructions start collapsed');
        await button('更多工具').click();
        await page.getByRole('menuitem', { name: '自动排布', exact: true }).waitFor();
        await page.getByRole('menuitem', { name: '操作说明', exact: true }).click();
        await page.getByRole('dialog', { name: '画布操作说明', exact: true }).waitFor();
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await frames();
        await page.screenshot({ path: `/tmp/mobile-character-board/toolbar-${mode}-${width}x${height}.png` });
        let baseline;
        for (let attempt = 0; ; attempt++) { baseline = await readBoard(); if (baseline?.edges?.length === 1) break; if (attempt > 30) throw Error('Initial saved relationship did not load'); await new Promise(resolve => setTimeout(resolve, 50)); }
        const documentScale = await page.evaluate(() => visualViewport.scale);
        cdp = await context.newCDPSession(page);
        const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ ...point, radiusX: 1, radiusY: 1, force: 1 })) });
        const initial = await transform(), rect = await canvas.boundingBox();
        const { points, center } = await pinchPoints();
        const worldAnchor = { x: (center.x - rect.x - initial.x) / initial.scale, y: (center.y - rect.y - initial.y) / initial.scale };
        await touch('touchStart', [points[0]]); await touch('touchStart', points);
        const spread = points.map(point => ({ ...point, x: center.x + (point.x - center.x) * 1.6 }));
        await touch('touchMove', spread); await frames();
        const enlarged = await transform();
        near(enlarged.scale, Math.min(2.2, initial.scale * 1.6), .003, 'Native two-finger spread changes canvas scale');
        near((center.x - rect.x - enlarged.x) / enlarged.scale, worldAnchor.x, .5, 'Pinch preserves the world point under its horizontal centroid');
        near((center.y - rect.y - enlarged.y) / enlarged.scale, worldAnchor.y, .5, 'Pinch preserves the world point under its vertical centroid');
        const shifted = spread.map(point => ({ ...point, x: point.x + 12, y: point.y + 10 }));
        await touch('touchMove', shifted); await frames();
        const translated = await transform(); near(translated.scale, enlarged.scale, .003, 'Moving both fingers preserves scale'); near(translated.x, enlarged.x + 12, 1, 'Two-finger centroid pans horizontally'); near(translated.y, enlarged.y + 10, 1, 'Two-finger centroid pans vertically');
        const shiftedCenter = { x: center.x + 12, y: center.y + 10 };
        const contracted = shifted.map(point => ({ ...point, x: shiftedCenter.x + (point.x - shiftedCenter.x) * .65 }));
        await touch('touchMove', contracted); await frames();
        const shrunk = await transform(); near(shrunk.scale, Math.max(.05, enlarged.scale * .65), .003, 'Native two-finger pinch reduces canvas scale');
        await touch('touchEnd', [contracted[0]]); await frames();
        const remainingMove = { ...contracted[0], x: contracted[0].x + 20, y: contracted[0].y + 12 };
        await touch('touchMove', [remainingMove]); await frames(); assert.deepEqual(await transform(), shrunk, 'A remaining finger after pinch cannot become an unintended drag');
        await touch('touchEnd', []); await frames();
        near(await page.evaluate(() => visualViewport.scale), documentScale, .001, 'Pinch zooms the canvas, not the browser document');
        await assertNoAccidentalAction(baseline);

        // Pinching may begin on a relationship label, not just unoccupied canvas.
        await button('适应画布').click(); await frames();
        const labelBox = await page.locator('.character-edge-label').first().boundingBox(), labelCanvas = await canvas.boundingBox();
        const labelTouch = { id: 5, x: labelBox.x + labelBox.width / 2, y: labelBox.y + labelBox.height / 2 };
        const labelSecond = { id: 6, x: Math.min(labelCanvas.x + labelCanvas.width - 12, labelTouch.x + 65), y: labelTouch.y };
        await touch('touchStart', [labelTouch]); await touch('touchStart', [labelTouch, labelSecond]);
        await touch('touchMove', [{ ...labelTouch, x: labelTouch.x - 5 }, { ...labelSecond, x: labelSecond.x + 5 }]);
        await touch('touchEnd', []); await frames(); await assertNoAccidentalAction(baseline);

        // Beginning a pinch on a dragged avatar must roll back that provisional move.
        await button('适应画布').click(); await frames();
        const firstNode = page.locator(`[data-character-node="${fixture.characters[0].id}"]`), originalNodeStyle = await firstNode.getAttribute('style');
        const nodeBox = await firstNode.boundingBox(), canvasForNode = await canvas.boundingBox();
        const firstTouch = { id: 11, x: nodeBox.x + nodeBox.width / 2, y: nodeBox.y + Math.min(15, nodeBox.height / 3) };
        const provisional = { ...firstTouch, x: firstTouch.x + 14, y: firstTouch.y + 8 };
        await touch('touchStart', [firstTouch]); await touch('touchMove', [provisional]); await frames();
        assert.notEqual(await firstNode.getAttribute('style'), originalNodeStyle, 'Single-finger node movement remains available before a second finger');
        const secondTouch = { id: 12, x: Math.min(canvasForNode.x + canvasForNode.width - 15, provisional.x + 75), y: provisional.y };
        await touch('touchStart', [provisional, secondTouch]); await frames();
        assert.equal(await firstNode.getAttribute('style'), originalNodeStyle, 'Second finger cancels the unsaved avatar move');
        await touch('touchMove', [{ ...provisional, x: provisional.x - 8 }, { ...secondTouch, x: secondTouch.x + 8 }]);
        await touch('touchEnd', []); await frames(); await assertNoAccidentalAction(baseline);

        // A third contact and a native touchCancel leave no stuck gesture/tap session.
        await button('适应画布').click(); await frames();
        const extra = await pinchPoints();
        await touch('touchStart', [extra.points[0]]); await touch('touchStart', extra.points);
        const thirdTouch = { id: 3, x: extra.center.x, y: extra.center.y + 18 };
        await touch('touchStart', [...extra.points, thirdTouch]);
        await touch('touchMove', [...extra.points.map(point => ({ ...point, x: point.x + 4 })), { ...thirdTouch, y: thirdTouch.y + 8 }]);
        await touch('touchCancel', []); await frames();
        const canceled = await transform(); assert.ok(Object.values(canceled).every(Number.isFinite) && canceled.scale >= .05 && canceled.scale <= 2.2, 'Extra contacts and cancellation leave a finite bounded view');
        await assertNoAccidentalAction(baseline);
        const blank = await blankPoint(), beforeFreshPan = await transform();
        const dy = blank.y + 15 < canvasForNode.y + canvasForNode.height - 5 ? 15 : -15;
        await touch('touchStart', [{ id: 21, ...blank }]); await touch('touchMove', [{ id: 21, x: blank.x + 15, y: blank.y + dy }]); await touch('touchEnd', []); await frames();
        const freshPan = await transform(); near(freshPan.x, beforeFreshPan.x + 15, 1, 'A fresh finger pans after all previous contacts end'); near(freshPan.y, beforeFreshPan.y + dy, 1, 'Fresh pan remains available after cancellation');
        await assertNoAccidentalAction(baseline);

        // A new, intentional avatar drag after the pinch sequence still persists normally.
        await button('适应画布').click(); await frames();
        const freshNodeBox = await firstNode.boundingBox();
        const freshNode = { id: 31, x: freshNodeBox.x + freshNodeBox.width / 2, y: freshNodeBox.y + Math.min(15, freshNodeBox.height / 3) };
        await touch('touchStart', [freshNode]); await touch('touchMove', [{ ...freshNode, x: freshNode.x + 15, y: freshNode.y + 10 }]); await touch('touchEnd', []);
        for (let attempt = 0; ; attempt++) { const value = await readBoard(); if (value.nodes[fixture.characters[0].id]?.position) break; if (attempt > 30) throw Error('Fresh intentional node drag did not persist after pinch'); await new Promise(resolve => setTimeout(resolve, 50)); }
        assert.deepEqual((await readBoard()).edges, baseline.edges);
        await page.getByLabel('只看一个人的关系').selectOption(fixture.characters[0].id); await button('查看关系清单').click();
        await page.getByRole('dialog', { name: `${fixture.characters[0].name}的直接关系`, exact: true }).waitFor();
        await page.getByRole('dialog').getByText('保持原有关系', { exact: true }).waitFor(); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await button('返回全部关系').click(); await frames();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Character page must not overflow horizontally');
        assert.deepEqual(errors, []); assert.deepEqual(writes, []);
        await page.screenshot({ path: `/tmp/mobile-character-board/board-${mode}-${width}x${height}.png` });
        results.push({ viewport: `${width}x${height}`, header: Math.round(toolbarBox.height), canvas: Math.round(canvasBox.height), pinchScale: [initial.scale, enlarged.scale, shrunk.scale], checks: 'native two-finger zoom/centroid pan; provisional avatar rollback; remaining contact suppression; third contact/cancel; fresh pan/drag; readable compact toolbar and focus list' });
      } finally { await cdp?.detach(); await context.close(); }
    }
    console.log(JSON.stringify({ mode, results, screenshots: '/tmp/mobile-character-board' }));
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
