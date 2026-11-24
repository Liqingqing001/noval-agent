import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createApp } from './server.mjs';
const results = [];
await test('课程简化版：HTTP 与数据库集成验证', async (t) => {
    const app = createApp({ dbPath: ':memory:', seed: true });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    let cookie = '', otherCookie = '', nid, cid, pid;
    async function request(path, method = 'GET', body, c = cookie) { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: c }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0], setCookie: r.headers.get('set-cookie') }; }
    const check = async (id, name, fn) => { await t.test(id + ' ' + name, async () => { try {
        await fn();
        results.push({ id, name, result: 'PASS' });
    }
    catch (e) {
        results.push({ id, name, result: 'FAIL', message: e.message });
        throw e;
    } }); };
    try {
        await check('T01', '首页静态页面可访问', async () => { const r = await fetch(base); assert.equal(r.status, 200); assert.match(await r.text(), /山海书房/); });
        await check('T02', '未登录访问小说接口被拒绝', async () => assert.equal((await request('/api/novels')).status, 401));
        await check('T03', '错误密码登录被拒绝', async () => assert.equal((await request('/api/login', 'POST', { email: 'demo@example.test', password: 'wrongpass' })).status, 401));
        await check('T04', '正确账号登录并返回 HttpOnly 会话', async () => { const r = await request('/api/login', 'POST', { email: 'demo@example.test', password: 'Demo2026!' }); assert.equal(r.status, 200); assert.ok(r.cookie); assert.match(r.setCookie, /HttpOnly/); assert.match(r.setCookie, /SameSite=Strict/); cookie = r.cookie; assert.equal(r.data.user.nickname, '课堂演示'); });
        await check('T05', '注册新用户且不返回密码散列', async () => { const r = await request('/api/register', 'POST', { email: 'student@example.test', password: 'Student2026!', nickname: '同学乙' }); assert.equal(r.status, 201); otherCookie = r.cookie; assert.equal(r.data.user.password_hash, undefined); });
        await check('T06', '重复邮箱注册被拒绝', async () => assert.equal((await request('/api/register', 'POST', { email: 'demo@example.test', password: 'Demo2026!', nickname: '重复' })).status, 409));
        await check('T07', '弱密码注册被拒绝', async () => assert.equal((await request('/api/register', 'POST', { email: 'a@example.test', password: '123', nickname: '同学' })).status, 400));
        await check('T08', '新增小说', async () => { const r = await request('/api/novels', 'POST', { title: '课堂演示作品', genre: '校园', summary: '用于演示增删改查。', status: 'draft' }); assert.equal(r.status, 201); nid = r.data.id; });
        await check('T09', '查询新增小说', async () => { const r = await request('/api/novels'); assert.equal(r.status, 200); assert.ok(r.data.novels.some(n => n.id === nid && n.title === '课堂演示作品')); });
        await check('T10', '修改小说并回读数据库', async () => { assert.equal((await request('/api/novels/' + nid, 'PUT', { title: '更新后的作品', genre: '奇幻', summary: '修改后的简介', status: 'writing' })).status, 200); assert.equal(app.db.prepare('SELECT title FROM novel WHERE id=?').get(nid).title, '更新后的作品'); });
        await check('T11', '空小说名被拒绝', async () => assert.equal((await request('/api/novels', 'POST', { title: '   ' })).status, 400));
        await check('T12', '非法小说状态被拒绝', async () => assert.equal((await request('/api/novels', 'POST', { title: '测试', status: 'unknown' })).status, 400));
        await check('T13', '新增章节并自动排序', async () => { const r = await request(`/api/novels/${nid}/chapters`, 'POST', { title: '第一章', content: '你好，世界\n' }); assert.equal(r.status, 201); cid = r.data.id; assert.equal(app.db.prepare('SELECT sequence FROM chapter WHERE id=?').get(cid).sequence, 1); });
        await check('T14', '修改章节并计算字数', async () => { assert.equal((await request(`/api/novels/${nid}/chapters/${cid}`, 'PUT', { title: '初见', content: '山海来信\n' })).status, 200); const r = await request('/api/novels/' + nid); assert.equal(r.data.chapters[0].title, '初见'); assert.equal(r.data.chapters[0].word_count, 4); });
        await check('T15', '空章节名被拒绝', async () => assert.equal((await request(`/api/novels/${nid}/chapters`, 'POST', { title: '' })).status, 400));
        await check('T16', '新增人物', async () => { const r = await request(`/api/novels/${nid}/characters`, 'POST', { name: '林溪', role: 'protagonist', description: '寻找来信的人' }); assert.equal(r.status, 201); pid = r.data.id; });
        await check('T17', '修改人物并回读', async () => { assert.equal((await request(`/api/novels/${nid}/characters/${pid}`, 'PUT', { name: '林溪', role: 'supporting', description: '人物设定已修改' })).status, 200); assert.equal(app.db.prepare('SELECT description FROM story_character WHERE id=?').get(pid).description, '人物设定已修改'); });
        await check('T18', '非法人物定位被拒绝', async () => assert.equal((await request(`/api/novels/${nid}/characters`, 'POST', { name: '测试', role: 'bad' })).status, 400));
        await check('T19', '不同用户的小说列表隔离', async () => assert.deepEqual((await request('/api/novels', 'GET', null, otherCookie)).data.novels, []));
        await check('T20', '跨用户查询小说被拒绝', async () => assert.equal((await request('/api/novels/' + nid, 'GET', null, otherCookie)).status, 404));
        await check('T21', '跨用户修改章节被拒绝', async () => assert.equal((await request(`/api/novels/${nid}/chapters/${cid}`, 'PUT', { title: '越权', content: '' }, otherCookie)).status, 404));
        await check('T22', '跨用户删除小说被拒绝', async () => assert.equal((await request('/api/novels/' + nid, 'DELETE', null, otherCookie)).status, 404));
        await check('T23', '不存在记录返回 404', async () => assert.equal((await request(`/api/novels/${nid}/chapters/99999`, 'DELETE')).status, 404));
        await check('T24', '单引号及 SQL 片段按普通文本保存', async () => { const title = "O'Reilly; DROP TABLE novel;--"; const r = await request('/api/novels', 'POST', { title }); assert.equal(r.status, 201); assert.equal(app.db.prepare('SELECT title FROM novel WHERE id=?').get(r.data.id).title, title); });
        await check('T25', '外键阻止孤立章节', async () => assert.throws(() => app.db.prepare('INSERT INTO chapter(novel_id,title,sequence) VALUES(99999,?,1)').run('孤立'), /FOREIGN KEY/));
        await check('T26', '同一小说重复章节序号被拒绝', async () => assert.throws(() => app.db.prepare('INSERT INTO chapter(novel_id,title,sequence) VALUES(?,?,1)').run(nid, '重复序号'), /UNIQUE/));
        await check('T27', '数据库拒绝非法状态', async () => assert.throws(() => app.db.prepare('UPDATE novel SET status=? WHERE id=?').run('bad', nid), /CHECK/));
        await check('T28', '删除人物后数据库不再存在', async () => { assert.equal((await request(`/api/novels/${nid}/characters/${pid}`, 'DELETE')).status, 200); assert.equal(app.db.prepare('SELECT id FROM story_character WHERE id=?').get(pid), undefined); });
        await check('T29', '删除章节后数据库不再存在', async () => { assert.equal((await request(`/api/novels/${nid}/chapters/${cid}`, 'DELETE')).status, 200); assert.equal(app.db.prepare('SELECT id FROM chapter WHERE id=?').get(cid), undefined); });
        await check('T30', '删除小说级联删除其章节和人物', async () => { await request(`/api/novels/${nid}/chapters`, 'POST', { title: '级联章节' }); await request(`/api/novels/${nid}/characters`, 'POST', { name: '级联人物' }); assert.equal((await request('/api/novels/' + nid, 'DELETE')).status, 200); for (const table of ['chapter', 'story_character'])
            assert.equal(app.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE novel_id=?`).get(nid).n, 0); assert.equal(app.db.prepare('SELECT id FROM novel WHERE id=?').get(nid), undefined); });
        await check('T31', '数据落盘并在重新打开后保留', async () => { const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const dir = mkdtempSync(join(tmpdir(), 'course-db-')); const path = join(dir, 'proof.db'); try {
            const first = createApp({ dbPath: path, seed: true });
            assert.ok(first.db.prepare('SELECT id FROM novel').get());
            first.db.close();
            const second = createApp({ dbPath: path });
            assert.equal(second.db.prepare('SELECT count(*) AS n FROM novel').get().n, 2);
            second.db.close();
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        } });
        await check('T32', '退出后会话失效', async () => { assert.equal((await request('/api/logout', 'POST', {})).status, 200); assert.equal((await request('/api/novels')).status, 401); });
    }
    finally {
        await app.close();
        if (process.env.RESULT_JSON)
            writeFileSync(process.env.RESULT_JSON, JSON.stringify({ executedAt: new Date().toISOString(), node: process.version, database: 'Node内置SQLite ' + process.versions.sqlite, scope: '独立课程简化版，非原系统', passed: results.filter(r => r.result === 'PASS').length, failed: results.filter(r => r.result === 'FAIL').length, results }, null, 2));
    }
});
