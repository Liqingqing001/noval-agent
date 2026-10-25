const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const q = n => `'${uid(n)}'`;
const results = [];
const db = new PGlite();
const seed = `-- 全部为虚构教学数据 密码占位文本不能用于登录\nBEGIN;\nSET search_path TO novel_agent, public;\nINSERT INTO app_user(id,email,password_hash,nickname) VALUES\n(${q(1)},'author_a@example.test','DEMO_HASH_NOT_FOR_LOGIN_0001','作者甲'),\n(${q(2)},'author_b@example.test','DEMO_HASH_NOT_FOR_LOGIN_0002','作者乙');\nINSERT INTO novel(id,user_id,title,status) VALUES\n(${q(101)},${q(1)},'潮汐之城','writing'),(${q(102)},${q(1)},'星港来信','draft'),(${q(103)},${q(2)},'北境手记','draft');\nINSERT INTO chapter(id,novel_id,title,content,content_format,word_count,sequence) VALUES\n(${q(201)},${q(101)},'潮声','潮声初起','text',4,0),\n(${q(202)},${q(101)},'旧港','旧港灯火','text',4,1),\n(${q(203)},${q(103)},'雪原','雪原无声','text',4,0);\nINSERT INTO story_character(id,novel_id,name,role,sequence,first_chapter_id) VALUES(${q(301)},${q(101)},'林澈','protagonist',0,${q(201)});\nINSERT INTO character_alias(character_id,alias) VALUES(${q(301)},'阿澈'),(${q(301)},'小林');\nINSERT INTO world_setting(id,novel_id,category,title,content) VALUES(${q(401)},${q(101)},'地理','旧港','潮汐城的旧港区');\nINSERT INTO volume_outline(id,novel_id,title,sequence) VALUES(${q(501)},${q(101)},'启程',0),(${q(502)},${q(103)},'北境',0);\nINSERT INTO chapter_outline(id,novel_id,volume_id,title,sequence,status,chapter_id) VALUES(${q(601)},${q(101)},${q(501)},'潮声',0,'completed',${q(201)});\nINSERT INTO chapter_outline(id,novel_id,title,sequence) VALUES(${q(602)},${q(101)},'未归卷章纲',0);\nINSERT INTO foreshadowing(id,novel_id,title,status,planted_chapter_id) VALUES(${q(701)},${q(101)},'旧钥匙','planted',${q(201)});\nINSERT INTO model_profile(id,user_id,name,provider,protocol,base_url,model_id,is_default) VALUES\n(${q(801)},${q(1)},'教学模型甲','custom','openai','https://model.example.test/v1','demo-text-model',true),\n(${q(802)},${q(2)},'教学模型乙','custom','responses','https://model.example.test/v1','demo-text-model',true);\n-- 仅验证密文形状 不代表真实加密结果\nINSERT INTO model_credential(profile_id,ciphertext,nonce,key_version) VALUES(${q(801)},decode(repeat('aa',32),'hex'),decode(repeat('bb',12),'hex'),1);\nINSERT INTO chat_session(id,novel_id,title) VALUES(${q(901)},${q(101)},'第一章讨论');\nINSERT INTO chat_message(id,session_id,role,content,status,sequence,finished_at) VALUES(${q(1001)},${q(901)},'user','请分析第一章','completed',0,CURRENT_TIMESTAMP);\nINSERT INTO chat_message(id,session_id,role,content,status,sequence,model_profile_id,model_snapshot,protocol_snapshot,request_id,finished_at)\nVALUES(${q(1002)},${q(901)},'assistant','教学示例回复','completed',1,${q(801)},'demo-text-model','openai',${q(1101)},CURRENT_TIMESTAMP);\nINSERT INTO novel_reading_state(novel_id,last_chapter_id,cursor_offset) VALUES(${q(101)},${q(201)},2);\nCOMMIT;\n`;
fs.writeFileSync(path.join(root,'sql','02_seed.sql'),seed);

async function good(name, action) {
 try { await action(); results.push({name,passed:true}); }
 catch(error) { results.push({name,passed:false,error:error.message,code:error.code}); }
}
async function expectCode(name,sql,code) {
 await db.exec('BEGIN; SET search_path TO novel_agent, public;');
 try {
  await db.exec(sql); await db.exec('SET CONSTRAINTS ALL IMMEDIATE;');
  results.push({name,passed:false,error:'应拒绝的数据被接受'});
 } catch(error) { results.push({name,passed:error.code===code,expected:code,actual:error.code}); }
 finally { await db.exec('ROLLBACK;'); }
}
async function scalar(sql) { const r=await db.query(sql); return Object.values(r.rows[0])[0]; }
function equal(actual,expected) { if(String(actual)!==String(expected)) throw Error(`Expected ${expected}; actual ${actual}`); }
async function main() {
 await good('T01 完整建表脚本',()=>db.exec(fs.readFileSync(path.join(root,'sql','01_schema.sql'),'utf8')));
 if(!results[0].passed)throw Error(JSON.stringify(results[0]));
 await good('T02 示例数据导入',()=>db.exec(seed));
 await good('T03 表数量为15',async()=>equal(await scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema='novel_agent' AND table_type='BASE TABLE'"),15));
 await good('T04 初始正文自动生成3条快照',async()=>equal(await scalar('SELECT count(*) FROM chapter_revision'),3));
 await good('T05 小说汇总视图无重复累计',async()=>equal(await scalar(`SELECT total_words FROM novel_word_stats WHERE novel_id=${q(101)}`),8));
 await good('T06 无章节小说汇总为零',async()=>equal(await scalar(`SELECT total_words FROM novel_word_stats WHERE novel_id=${q(102)}`),0));
 await expectCode('T07 重复邮箱拒绝',"INSERT INTO app_user(email,password_hash) VALUES('author_a@example.test','DEMO_HASH_NOT_FOR_LOGIN')",'23505');
 await expectCode('T08 非归一化邮箱拒绝',"INSERT INTO app_user(email,password_hash) VALUES('UPPER@example.test','DEMO_HASH_NOT_FOR_LOGIN')",'23514');
 await expectCode('T09 无主小说拒绝',`INSERT INTO novel(user_id,title) VALUES(${q(999)},'不存在的拥有者')`,'23503');
 await expectCode('T10 负字数拒绝',`INSERT INTO chapter(novel_id,title,word_count,sequence) VALUES(${q(101)},'非法',-1,5)`,'23514');
 await expectCode('T11 重复章节顺序拒绝',`INSERT INTO chapter(novel_id,title,sequence) VALUES(${q(101)},'重复',0)`,'23505');
 await expectCode('T12 重复角色别名拒绝',`INSERT INTO character_alias VALUES(${q(301)},'阿澈')`,'23505');
 await expectCode('T13 跨小说关联卷纲拒绝',`INSERT INTO chapter_outline(novel_id,volume_id,title,sequence) VALUES(${q(101)},${q(502)},'非法跨卷',9)`,'23503');
 await expectCode('T14 跨小说关联正文拒绝',`UPDATE story_character SET first_chapter_id=${q(203)} WHERE id=${q(301)}`,'23503');
 await expectCode('T15 未归卷章纲重复顺序拒绝',`INSERT INTO chapter_outline(novel_id,title,sequence) VALUES(${q(101)},'重复根节点',0)`,'23505');
 await expectCode('T16 完成章纲必须关联正文',`INSERT INTO chapter_outline(novel_id,title,sequence,status) VALUES(${q(101)},'未关联',9,'completed')`,'23514');
 await expectCode('T17 回收伏笔必须有回收锚点',`INSERT INTO foreshadowing(novel_id,title,status) VALUES(${q(101)},'无锚点','resolved')`,'23514');
 await expectCode('T18 同用户只能有一个默认模型',`INSERT INTO model_profile(user_id,name,provider,protocol,base_url,model_id,is_default) VALUES(${q(1)},'第二默认','custom','openai','https://example.test/v1','demo',true)`,'23505');
 await expectCode('T19 非对象扩展参数拒绝',`UPDATE model_profile SET extra_body='[]' WHERE id=${q(801)}`,'23514');
 await expectCode('T20 密钥随机数长度错误拒绝',`UPDATE model_credential SET nonce=decode('aa','hex') WHERE profile_id=${q(801)}`,'23514');
 await expectCode('T21 跨用户模型配置引用拒绝',`INSERT INTO chat_message(session_id,role,status,sequence,model_profile_id,finished_at) VALUES(${q(901)},'assistant','completed',9,${q(802)},CURRENT_TIMESTAMP)`,'23514');
 await expectCode('T22 重复请求幂等标识拒绝',`INSERT INTO chat_message(session_id,role,status,sequence,request_id,finished_at) VALUES(${q(901)},'assistant','completed',9,${q(1101)},CURRENT_TIMESTAMP)`,'23505');
 await expectCode('T23 终态消息必须记录完成时间',`INSERT INTO chat_message(session_id,role,status,sequence) VALUES(${q(901)},'assistant','completed',9)`,'23514');
 await good('T24 正文保存递增版本',async()=>equal(await scalar(`SELECT save_chapter(${q(1)},${q(201)},1,'潮声','潮声与灯火','5','text','manual')`),2));
 await good('T25 正文保存自动写快照',async()=>equal(await scalar(`SELECT count(*) FROM chapter_revision WHERE chapter_id=${q(201)}`),2));
 await good('T26 过期及缺失版本保存拒绝',async()=>{
  for(const [version,code] of [[1,'40001'],[null,'23514']]) {
   await db.exec('BEGIN;');let actual='';
   try { await db.exec(`SELECT save_chapter(${q(1)},${q(201)},${version===null?'NULL':version},'旧请求','覆盖内容',4,'text','manual')`); }
   catch(error) { actual=error.code; } finally { await db.exec('ROLLBACK;'); }
   equal(actual,code);
  }
 });
 await expectCode('T27 非拥有者保存拒绝',`SELECT save_chapter(${q(2)},${q(201)},2,'越权','越权正文',4,'text','manual')`,'42501');
 await expectCode('T28 绕过版本递增改正文拒绝',`UPDATE chapter SET content='未递增版本' WHERE id=${q(201)}`,'23514');
 await expectCode('T29 已有小说不能直接更换拥有者',`UPDATE novel SET user_id=${q(2)} WHERE id=${q(101)}`,'23514');
 await good('T30 恢复旧快照生成新版本',async()=>{
  equal(await scalar(`SELECT save_chapter(${q(1)},${q(201)},2,r.title,r.content,r.word_count,r.content_format,'restore') FROM chapter_revision r WHERE r.chapter_id=${q(201)} AND r.version=1`),3);
  equal(await scalar(`SELECT content FROM chapter WHERE id=${q(201)}`),'潮声初起');
  equal(await scalar(`SELECT change_source FROM chapter_revision WHERE chapter_id=${q(201)} AND version=3`),'restore');
 });
 await good('T31 章节换序可延迟唯一性检查',async()=>{
  await db.exec(`BEGIN; SET CONSTRAINTS ALL DEFERRED; UPDATE chapter SET sequence=1 WHERE id=${q(201)}; UPDATE chapter SET sequence=0 WHERE id=${q(202)}; COMMIT;`);
  equal(await scalar(`SELECT sequence FROM chapter WHERE id=${q(201)}`),1);
 });
 await good('T32 事务失败后不残留部分小说',async()=>{
  try { await db.exec(`BEGIN; INSERT INTO novel(id,user_id,title) VALUES(${q(9999)},${q(1)},'应回滚'); INSERT INTO chapter(novel_id,title,sequence) VALUES(${q(9999)},'失败章节',-1); COMMIT;`); } catch { await db.exec('ROLLBACK;'); }
  equal(await scalar(`SELECT count(*) FROM novel WHERE id=${q(9999)}`),0);
 });
 await expectCode('T33 删除仍被引用的章节需先解绑',`DELETE FROM chapter WHERE id=${q(201)}`,'23503');
 await good('T34 删除配置后凭据删除且消息保留快照',async()=>{
  await db.exec(`BEGIN; DELETE FROM model_profile WHERE id=${q(801)};`);
  equal(await scalar(`SELECT count(*) FROM model_credential WHERE profile_id=${q(801)}`),0);
  equal(await scalar(`SELECT count(*) FROM chat_message WHERE id=${q(1002)} AND model_profile_id IS NULL AND model_snapshot='demo-text-model'`),1);
  await db.exec('ROLLBACK;');
 });
 await good('T35 删除小说级联清理完整聚合',async()=>{
  await db.exec(`BEGIN; DELETE FROM novel WHERE id=${q(101)}; SET CONSTRAINTS ALL IMMEDIATE;`);
  equal(await scalar(`SELECT count(*) FROM chapter WHERE novel_id=${q(101)}`),0);
  equal(await scalar(`SELECT count(*) FROM chat_message WHERE session_id=${q(901)}`),0);
  await db.exec('ROLLBACK;');
 });
 const queries=fs.readFileSync(path.join(root,'sql','03_queries.sql'),'utf8').split('-- QUERY ').slice(1);
 for(const query of queries) {
  const name=query.slice(0,query.indexOf('\n')).trim();
  const body=query.slice(query.indexOf('\n')+1);
  await good(`查询示例 ${name}`,()=>db.exec(body));
 }
 const engine=await scalar('SELECT version()');
 const report={engine,environment:'PGlite 内存 PostgreSQL 非独立 PostgreSQL 16 服务器',tables:15,fields:133,total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
 fs.writeFileSync(path.join(root,'validation-results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({engine,total:report.total,passed:report.passed,failed:report.failed,failures:results.filter(r=>!r.passed)},null,2));
 await db.close();
 if(report.failed)process.exitCode=1;
}
main().catch(async error=>{console.error(error);await db.close();process.exitCode=1;});
