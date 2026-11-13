// Node.js 22.13+。使用内置 HTTP、SQLite 与密码散列；不连接原系统数据库。
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
export function passwordHash(password) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 32).toString('hex'); }
function passwordMatches(password, stored) { const [salt, hash] = stored.split(':'); return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(hash, 'hex')); }
export function createApp({ dbPath = join(root, 'data', 'course.db'), seed = false } = {}) {
    if (dbPath !== ':memory:')
        mkdirSync(dirname(resolve(dbPath)), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));
    db.exec('PRAGMA busy_timeout=3000');
    if (seed && !db.prepare('SELECT id FROM app_user WHERE email=?').get('demo@example.test')) {
        db.exec('BEGIN');
        try {
            const uid = db.prepare('INSERT INTO app_user(email,password_hash,nickname) VALUES(?,?,?)').run('demo@example.test', passwordHash('Demo2026!'), '课堂演示').lastInsertRowid;
            const nid = db.prepare('INSERT INTO novel(user_id,title,genre,summary,status) VALUES(?,?,?,?,?)').run(uid, '山海来信', '治愈奇幻', '一封没有寄件人的信，让林溪踏上寻找山海小镇的旅途。', 'writing').lastInsertRowid;
            db.prepare('INSERT INTO chapter(novel_id,title,content,sequence) VALUES(?,?,?,?)').run(nid, '风从山谷来', '清晨，林溪在窗前发现了一封信。信封上只有一行字：\n\n“当风吹过山谷，沿着旧铁路来找我。”\n\n她抬起头，远处的群山笼罩在薄雾中。', 1);
            db.prepare('INSERT INTO chapter(novel_id,title,content,sequence) VALUES(?,?,?,?)').run(nid, '小镇的旧书店', '旧书店的门铃响了。老人放下手中的书，像是早已知道她会到来。', 2);
            db.prepare('INSERT INTO story_character(novel_id,name,role,description) VALUES(?,?,?,?)').run(nid, '林溪', 'protagonist', '十九岁，喜欢写信，性格安静而坚定。');
            db.prepare('INSERT INTO novel(user_id,title,genre,summary,status) VALUES(?,?,?,?,?)').run(uid, '春日手记', '校园', '把平凡的日子写成温柔的故事。', 'draft');
            db.exec('COMMIT');
        }
        catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }
    const sessions = new Map();
    const listNovels = uid => db.prepare(`SELECT n.*, (SELECT count(*) FROM chapter c WHERE c.novel_id=n.id) AS chapter_count,
 (SELECT coalesce(sum(length(replace(replace(content,char(10),''),char(13),''))),0) FROM chapter c WHERE c.novel_id=n.id) AS word_count
 FROM novel n WHERE user_id=? ORDER BY n.updated_at DESC,n.id DESC`).all(uid);
    const fail = (status, message) => Object.assign(new Error(message), { status });
    const text = (body, key, max, required = false) => { const v = body[key] ?? ''; if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
        throw fail(400, `${key} 不能为空或超出长度限制`); return v.trim(); };
    const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    const touch = nid => db.prepare("UPDATE novel SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(nid);
    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const path = url.pathname;
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            if (!path.startsWith('/api/')) {
                const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
                if (req.method !== 'GET' || !files[path])
                    throw fail(404, '页面不存在');
                const [file, type] = files[path];
                res.writeHead(200, { 'Content-Type': type });
                res.end(readFileSync(join(root, 'public', file)));
                return;
            }
            if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)
                throw fail(403, '不允许跨站修改');
            let body = {};
            if (['POST', 'PUT'].includes(req.method)) {
                if (!req.headers['content-type']?.startsWith('application/json'))
                    throw fail(415, '请使用 JSON');
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > 256000)
                        throw fail(413, '请求过大');
                    chunks.push(chunk);
                }
                try {
                    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                }
                catch {
                    throw fail(400, 'JSON 格式错误');
                }
                if (!body || Array.isArray(body) || typeof body !== 'object')
                    throw fail(400, 'JSON 必须为对象');
            }
            if (path === '/api/health' && req.method === 'GET') {
                send(res, 200, { status: 'ok' });
                return;
            }
            if ((path === '/api/register' || path === '/api/login') && req.method === 'POST') {
                const email = text(body, 'email', 120, true).toLowerCase(), password = text(body, 'password', 128, true);
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                    throw fail(400, '邮箱格式不正确');
                if (password.length < 8)
                    throw fail(400, '密码至少 8 位');
                if (path === '/api/register') {
                    const nickname = text(body, 'nickname', 30, true);
                    if (db.prepare('SELECT id FROM app_user WHERE email=?').get(email))
                        throw fail(409, '邮箱已注册');
                    db.prepare('INSERT INTO app_user(email,password_hash,nickname) VALUES(?,?,?)').run(email, passwordHash(password), nickname);
                }
                const user = db.prepare('SELECT * FROM app_user WHERE email=?').get(email);
                if (!user || !passwordMatches(password, user.password_hash))
                    throw fail(401, '邮箱或密码错误');
                const token = randomBytes(32).toString('hex');
                sessions.set(token, { userId: user.id, expires: Date.now() + 8 * 3600000 });
                res.setHeader('Set-Cookie', `course_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
                send(res, path === '/api/register' ? 201 : 200, { user: { id: user.id, email: user.email, nickname: user.nickname } });
                return;
            }
            const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('course_session='))?.slice(15);
            const session = sessions.get(token);
            if (!session || session.expires < Date.now()) {
                if (token)
                    sessions.delete(token);
                throw fail(401, '请先登录');
            }
            const uid = session.userId;
            if (path === '/api/me' && req.method === 'GET') {
                send(res, 200, { user: db.prepare('SELECT id,email,nickname FROM app_user WHERE id=?').get(uid) });
                return;
            }
            if (path === '/api/logout' && req.method === 'POST') {
                sessions.delete(token);
                res.setHeader('Set-Cookie', 'course_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
                send(res, 200, { ok: true });
                return;
            }
            const ownedNovel = nid => { const n = db.prepare('SELECT * FROM novel WHERE id=? AND user_id=?').get(nid, uid); if (!n)
                throw fail(404, '小说不存在'); return n; };
            const novelData = () => { const d = { title: text(body, 'title', 100, true), genre: text(body, 'genre', 30), summary: text(body, 'summary', 2000), status: body.status || 'draft' }; if (!['draft', 'writing', 'completed'].includes(d.status))
                throw fail(400, '小说状态无效'); return d; };
            if (path === '/api/novels') {
                if (req.method === 'GET') {
                    send(res, 200, { novels: listNovels(uid) });
                    return;
                }
                if (req.method === 'POST') {
                    const d = novelData();
                    const r = db.prepare('INSERT INTO novel(user_id,title,genre,summary,status) VALUES(?,?,?,?,?)').run(uid, d.title, d.genre, d.summary, d.status);
                    send(res, 201, { id: Number(r.lastInsertRowid) });
                    return;
                }
            }
            const m = path.match(/^\/api\/novels\/(\d+)(?:\/(chapters|characters))?(?:\/(\d+))?$/);
            if (!m)
                throw fail(404, '接口不存在');
            const nid = Number(m[1]);
            const novel = ownedNovel(nid), kind = m[2], id = m[3] ? Number(m[3]) : null;
            if (!kind) {
                if (req.method === 'GET') {
                    send(res, 200, { novel, chapters: db.prepare('SELECT *,length(replace(replace(content,char(10),\'\'),char(13),\'\')) AS word_count FROM chapter WHERE novel_id=? ORDER BY sequence').all(nid), characters: db.prepare('SELECT * FROM story_character WHERE novel_id=? ORDER BY id').all(nid) });
                    return;
                }
                if (req.method === 'PUT') {
                    const d = novelData();
                    db.prepare('UPDATE novel SET title=?,genre=?,summary=?,status=? WHERE id=?').run(d.title, d.genre, d.summary, d.status, nid);
                    touch(nid);
                    send(res, 200, { ok: true });
                    return;
                }
                if (req.method === 'DELETE') {
                    db.prepare('DELETE FROM novel WHERE id=?').run(nid);
                    send(res, 200, { ok: true });
                    return;
                }
            }
            else {
                const table = kind === 'chapters' ? 'chapter' : 'story_character';
                if (id && !db.prepare(`SELECT id FROM ${table} WHERE id=? AND novel_id=?`).get(id, nid))
                    throw fail(404, '记录不存在');
                if (req.method === 'DELETE' && id) {
                    db.prepare(`DELETE FROM ${table} WHERE id=? AND novel_id=?`).run(id, nid);
                    touch(nid);
                    send(res, 200, { ok: true });
                    return;
                }
                if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)) {
                    let r;
                    if (kind === 'chapters') {
                        const title = text(body, 'title', 100, true), content = text(body, 'content', 50000);
                        if (id)
                            r = db.prepare("UPDATE chapter SET title=?,content=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND novel_id=?").run(title, content, id, nid);
                        else
                            r = db.prepare('INSERT INTO chapter(novel_id,title,content,sequence) SELECT ?,?,?,coalesce(max(sequence),0)+1 FROM chapter WHERE novel_id=?').run(nid, title, content, nid);
                    }
                    else {
                        const name = text(body, 'name', 30, true), description = text(body, 'description', 2000), role = body.role || 'supporting';
                        if (!['protagonist', 'supporting', 'minor'].includes(role))
                            throw fail(400, '人物定位无效');
                        if (id)
                            r = db.prepare('UPDATE story_character SET name=?,role=?,description=? WHERE id=? AND novel_id=?').run(name, role, description, id, nid);
                        else
                            r = db.prepare('INSERT INTO story_character(novel_id,name,role,description) VALUES(?,?,?,?)').run(nid, name, role, description);
                    }
                    touch(nid);
                    send(res, id ? 200 : 201, id ? { ok: true } : { id: Number(r.lastInsertRowid) });
                    return;
                }
            }
            throw fail(405, '不支持该操作');
        }
        catch (e) {
            if (!res.headersSent)
                send(res, e.status || 500, { error: e.status ? e.message : '服务器错误' });
            else
                res.end();
        }
    });
    return { server, db, close: () => new Promise((resolve, reject) => server.close(err => { db.close(); err ? reject(err) : resolve(); })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT || 4178), app = createApp({ dbPath: process.env.COURSE_DB || join(root, 'data', 'course.db'), seed: process.argv.includes('--seed') });
    app.server.listen(port, '127.0.0.1', () => console.log(`课程演示已启动：http://127.0.0.1:${port}\n测试账号 demo@example.test / Demo2026!（仅 --seed 初始化）`));
}
