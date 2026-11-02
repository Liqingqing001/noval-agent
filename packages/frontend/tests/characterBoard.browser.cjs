const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync, readFileSync } = require('node:fs');
const fixture = require('../src/demo/lingShiOrigin.json');
const isDemo = (process.env.PARITY_MODE || 'demo') === 'demo';
const mode = isDemo ? 'demo' : 'full';
const base = process.env.PARITY_URL || `http://127.0.0.1:5186${isDemo ? '/noval-agent/' : '/'}`;
const storageKey = name => isDemo ? `${name}-demo-v1` : name;
const boardKey = `${storageKey('novel-agent-character-board')}:${isDemo ? 'browser' : 'test-user'}:${fixture.novels[0].id}`;

(async () => {
 const server = process.env.PARITY_URL ? null : spawn(process.execPath, [resolve(require.resolve('vite/package.json'), '..', 'bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], { cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env: { ...process.env, VITE_BASE_PATH: isDemo ? '/noval-agent/' : '/' } });
 let browser;
 try {
  if (server) for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch {} if (i > 60) throw Error('Preview did not start'); await new Promise(resolve => setTimeout(resolve, 200)); }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), ...(process.env.PARITY_URL ? { args: ['--disable-http2'] } : {}) });
  const results = [];
  for (const width of [390, 1680]) {
   const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
   try {
    const page = await context.newPage(), errors = [], requests = [], data = structuredClone(fixture);
    let pendingCreate;
    page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(({ fixture, isDemo }) => {
     if (sessionStorage.getItem('board-test-ready')) return;
     sessionStorage.setItem('board-test-ready', 'yes');
     const key = name => isDemo ? `${name}-demo-v1` : name;
     localStorage.setItem(key('novel-agent-storage'), JSON.stringify({ state: { ...fixture, sessions: [], currentNovelId: fixture.novels[0].id, currentChapterId: fixture.chapters[0].id, currentView: 'characters' } }));
     if (!isDemo) {
      localStorage.setItem('novel-agent-auth-token', 'TEST_PLACEHOLDER'); localStorage.setItem('novel-agent-migrated', 'true');
      localStorage.setItem('novel-agent-auth', JSON.stringify({ state: { isAuthenticated: true, user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } } }));
     }
    }, { fixture, isDemo });
    await page.route('**/api/**', async route => {
     const request = route.request(), path = new URL(request.url()).pathname, resource = path.split('/').at(-1); requests.push({ path, method: request.method() });
     let body;
     const resources = { novels: 'novels', chapters: 'chapters', characters: 'characters', 'world-settings': 'worldSettings', 'plot-cards': 'plotCards', foreshadowings: 'foreshadowings' };
     if (path.endsWith('/auth/me')) body = { user: { id: 'test-user', nickname: '测试用户', email: 'test@example.test' } };
     else if (request.method() === 'GET' && resources[resource]) body = { [resources[resource]]: data[resources[resource]] };
     else if (request.method() === 'POST' && resource === 'characters') { pendingCreate = { route, fields: request.postDataJSON() }; return; }
     else if (request.method() === 'PUT') { const item = Object.values(data).flat().find(item => item.id === resource); Object.assign(item || {}, request.postDataJSON()); body = { character: item, plotCard: item, novel: item }; }
     else if (request.method() === 'DELETE' && path.includes('/characters/')) { data.characters = data.characters.filter(character => character.id !== resource); body = { success: true }; }
     else throw Error(`Unexpected request: ${request.method()} ${path}`);
     await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const saved = () => page.getByRole('status').filter({ hasText: /画布已就绪/ }).waitFor();
    const readBoard = () => page.evaluate(async key => {
     const database = await new Promise((resolve, reject) => { const request = indexedDB.open('novel-agent-reference-library-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
     try { return await new Promise((resolve, reject) => { const transaction = database.transaction('workspaces'); const request = transaction.objectStore('workspaces').get(key); transaction.oncomplete = () => resolve(request.result); transaction.onerror = reject; }); }
     finally { database.close(); }
    }, boardKey);
    await page.goto(base); await saved();
    assert.equal(await page.locator('[data-character-node]').count(), fixture.characters.length);
    const [first, second, third] = fixture.characters;
    await button('添加关系').click();
    await page.getByLabel('关系起点人物').selectOption(first.id); await page.getByLabel('关系终点人物').selectOption(second.id);
    await page.getByLabel('关系名称').fill('同盟'); await page.getByLabel('关系分类').selectOption('ally');
    await page.getByLabel('关系终点人物').selectOption(first.id); await button('保存关系').click(); await page.getByRole('alert').filter({ hasText: '请选择不同人物' }).waitFor(); await page.getByLabel('关系终点人物').selectOption(second.id);
    await button('保存关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await saved();
    assert.equal((await readBoard()).edges.length, 1);
    await page.getByRole('button', { name: /^编辑关系：/ }).click();
    await page.getByLabel('关系名称').fill('相互信任'); await button('保存关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await button('添加关系').click(); await page.getByLabel('关系起点人物').selectOption(second.id); await page.getByLabel('关系终点人物').selectOption(third.id); await page.getByLabel('关系名称').fill('怀疑'); await page.getByLabel('关系分类').selectOption('rival'); await button('保存关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await button('添加关系').click(); await page.getByLabel('关系起点人物').selectOption(first.id); await page.getByLabel('关系终点人物').selectOption(third.id); await page.getByLabel('关系名称').fill('师承'); await page.getByLabel('关系分类').selectOption('family'); await button('保存关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await saved();
    await button('添加关系').click(); await page.getByLabel('关系起点人物').selectOption(third.id); await page.getByLabel('关系终点人物').selectOption(first.id); await page.getByLabel('关系名称').fill('临时关系'); await button('保存关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByRole('button', { name: /编辑关系：.*临时关系/ }).click(); await button('删除关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await saved(); assert.equal((await readBoard()).edges.length, 3);
    const node = button(`查看人物：${first.name}`);
    if (width === 390) { const box = await node.boundingBox(); await page.touchscreen.tap(box.x + box.width / 2, box.y + 25); } else await node.click();
    await page.getByRole('complementary', { name: '人物详情' }).waitFor();
    await page.getByLabel('人物生死状态').selectOption('alive'); await page.getByLabel('当前位置', { exact: true }).fill('旧书院'); await page.getByLabel('伤势与身体状况').fill('右手受伤'); await page.getByLabel('当前目标').fill('找到失踪的同伴'); await page.getByLabel('人物状态截至章节').selectOption(fixture.chapters[0].id);
    await button('保存人物状态').click(); await saved();
    assert.equal((await readBoard()).nodes[first.id].state.location, '旧书院');
    if (process.env.BOARD_ARTIFACT_DIR) { await page.getByRole('complementary', { name: '人物详情' }).evaluate(element => { element.scrollTop = 0; }); mkdirSync(process.env.BOARD_ARTIFACT_DIR, { recursive: true }); await page.screenshot({ path: resolve(process.env.BOARD_ARTIFACT_DIR, `inspector-${mode}-${width}.png`) }); }
    await page.getByLabel('上传人物头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC2kAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('img', { name: '人物头像' }).waitFor(); await saved(); assert.ok((await readBoard()).nodes[first.id].avatar.startsWith('data:image/jpeg;base64,'));
    await button('关闭人物详情').click(); await button('适应画布').click();
    const box = await node.boundingBox();
    if (width === 390) {
     const cdp = await context.newCDPSession(page);
     await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + 20, id: 1 }] });
     await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2 + 55, y: box.y + 50, id: 1 }] });
     await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
    } else { await page.mouse.move(box.x + box.width / 2, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 55, box.y + 50, { steps: 6 }); await page.mouse.up(); }
    await saved();
    assert.ok((await readBoard()).nodes[first.id].position.x > 100);
    assert.equal(await page.getByRole('complementary', { name: '人物详情' }).count(), 0);
    await node.focus(); await node.press('ArrowRight'); await saved();
    const position = (await readBoard()).nodes[first.id].position;
    const beforePan = await node.boundingBox(), canvas = await page.getByLabel('人物关系画布', { exact: true }).boundingBox();
    await page.mouse.move(canvas.x + 6, canvas.y + 6); await page.mouse.down(); await page.mouse.move(canvas.x + 36, canvas.y + 26, { steps: 4 }); await page.mouse.up();
    assert.ok(Math.abs((await node.boundingBox()).x - beforePan.x - 30) < 2); assert.deepEqual((await readBoard()).nodes[first.id].position, position);
    const scale = await page.getByLabel('画布缩放比例').textContent(); await button('放大画布').click(); assert.notEqual(await page.getByLabel('画布缩放比例').textContent(), scale);
    await button('适应画布').click();
    await page.getByLabel('搜索画布人物').fill(first.name); assert.equal(await page.locator('[data-character-node]').count(), 1); await page.getByLabel('搜索画布人物').fill('');
    const download = page.waitForEvent('download'); await button('导出人物关系与状态').click(); const exported = JSON.parse(readFileSync(await (await download).path(), 'utf8').replace(/^\uFEFF/, '')); assert.equal(exported.edges.length, 3); assert.equal(exported.nodes[first.id].state.condition, '右手受伤');
    await page.reload(); await saved(); assert.deepEqual((await readBoard()).nodes[first.id].position, position); assert.equal((await readBoard()).edges.length, 3);
    await button(`查看人物：${first.name}`).click(); assert.equal(await page.getByLabel('当前位置', { exact: true }).inputValue(), '旧书院'); await button('关闭人物详情').click();
    await button('展开人物画布').click(); assert.ok((await page.locator('.character-board-expanded').boundingBox()).width >= width - 1); await page.keyboard.press('Escape'); assert.equal(await page.locator('.character-board-expanded').count(), 0);
    await button(`查看人物：${first.name}`).click(); await page.getByLabel('状态备注').fill('切换列表前的新状态');
    await button('人物列表').click(); await page.getByRole('heading', { name: '人物管理' }).waitFor(); await button('关系画布').click(); await saved();
    await button(`查看人物：${first.name}`).click(); assert.equal(await page.getByLabel('状态备注').inputValue(), '切换列表前的新状态'); await button('关闭人物详情').click();
    const removed = fixture.characters.at(-1);
    await button(`查看人物：${removed.name}`).click(); await page.getByLabel('当前位置', { exact: true }).fill('即将删除的记录'); await button('保存人物状态').click(); await saved();
    await button('添加关系').click(); await page.getByLabel('关系起点人物').selectOption(removed.id); await page.getByLabel('关系终点人物').selectOption(first.id); await page.getByLabel('关系名称').fill('即将删除的关系'); await button('保存关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    page.once('dialog', dialog => dialog.accept()); await button('删除人物').click(); await saved();
    assert.equal((await readBoard()).nodes[removed.id], undefined); assert.ok((await readBoard()).edges.every(edge => edge.source !== removed.id && edge.target !== removed.id));
    if (!isDemo) {
     await button('添加人物').click(); await page.getByPlaceholder('角色姓名').fill('云端新人物'); await page.getByRole('dialog').getByRole('button', { name: '添加', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
     const newNode = button('查看人物：云端新人物'); await newNode.click(); const oldId = await newNode.getAttribute('data-character-node');
     await page.getByLabel('当前位置', { exact: true }).fill('临时营地'); await button('保存人物状态').click(); await saved();
     await page.getByLabel('状态备注').fill('尚未点击保存的草稿');
     await button('添加关系').click(); await page.getByLabel('关系起点人物').selectOption(oldId); await page.getByLabel('关系终点人物').selectOption(first.id); await page.getByLabel('关系名称').fill('保护'); await button('保存关系').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await saved();
     assert.ok(pendingCreate);
     const character = { ...pendingCreate.fields, id: 'server-board-character', novelId: fixture.novels[0].id }; data.characters.push(character);
     await pendingCreate.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ character }) });
     await page.waitForFunction(() => Boolean(document.querySelector('[data-character-node="server-board-character"]')));
     assert.equal(await page.getByLabel('状态备注').inputValue(), '尚未点击保存的草稿'); await button('保存人物状态').click(); await saved();
     const remapped = await readBoard(); assert.equal(remapped.nodes[oldId], undefined); assert.equal(remapped.nodes['server-board-character'].state.location, '临时营地');
     assert.ok(remapped.edges.some(edge => edge.source === 'server-board-character' && edge.label === '保护'));
     await button('关闭人物详情').click();
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    if (isDemo) assert.deepEqual(requests, []);
    if (process.env.BOARD_ARTIFACT_DIR) { mkdirSync(process.env.BOARD_ARTIFACT_DIR, { recursive: true }); await button('适应画布').click(); await page.screenshot({ path: resolve(process.env.BOARD_ARTIFACT_DIR, `${mode}-${width}.png`) }); }
    results.push(`${width}px: graph, relation CRUD, touch/click drawer, editable state, local avatar, pointer drag, keyboard move, zoom/search, export, reload, preserved list${isDemo ? '' : ', server ID remap preserves saved and draft state'}`);
   } finally { await context.close(); }
  }
  console.log(JSON.stringify({ mode, url: base, results }));
 } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
