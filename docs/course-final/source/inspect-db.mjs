import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const path = fileURLToPath(new URL('./data/course.db', import.meta.url));
if (!existsSync(path))
    throw new Error('请先运行 node server.mjs --seed 初始化演示数据库');
const db = new DatabaseSync(path, { readOnly: true });
for (const [label, sql] of [
    ['用户（不展示密码散列）', 'SELECT id,email,nickname FROM app_user'],
    ['小说', 'SELECT id,user_id,title,status FROM novel'],
    ['章节', 'SELECT id,novel_id,sequence,title FROM chapter ORDER BY novel_id,sequence'],
    ['人物', 'SELECT id,novel_id,name,role FROM story_character']
]) {
    console.log('\n' + label);
    console.table(db.prepare(sql).all());
}
db.close();
