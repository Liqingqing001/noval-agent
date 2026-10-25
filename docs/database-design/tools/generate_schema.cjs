// Shared field metadata generates SQL and the report dictionary, avoiding hand-maintained drift.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const id = () => ['id','uuid','实体主键','PRIMARY KEY DEFAULT gen_random_uuid()'];
const created = () => ['created_at','timestamptz','创建时间','NOT NULL DEFAULT CURRENT_TIMESTAMP'];
const updated = () => ['updated_at','timestamptz','最后更新时间','NOT NULL DEFAULT CURRENT_TIMESTAMP'];
const novel = () => ['novel_id','uuid','所属小说','NOT NULL REFERENCES novel(id) ON DELETE CASCADE'];
const text = (name, label) => [name,'text',label,"NOT NULL DEFAULT ''"];
const seq = () => ['sequence','integer','同级显示顺序 从零开始','NOT NULL CHECK (sequence >= 0)'];
const tables = [];
function table(name,label,fields,constraints=[],note='') { tables.push({name,label,fields,constraints,note}); }
table('app_user','用户账户',[
 id(),['email','varchar(254)','归一化邮箱','NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND position(\'@\' in email) > 1)'],
 ['password_hash','text','应用层生成的密码哈希','NOT NULL CHECK (length(password_hash) >= 20)'],
 ['nickname','varchar(80)','显示昵称',"NOT NULL DEFAULT ''"],
 ['status','varchar(16)','账户状态',"NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))"],created(),updated(),
]);
table('novel','小说',[
 id(),['user_id','uuid','拥有者','NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT'],
 ['title','varchar(200)','小说标题','NOT NULL CHECK (length(btrim(title)) > 0)'],
 ['genre','varchar(80)','题材',"NOT NULL DEFAULT ''"],text('summary','小说简介'),text('cover_url','对象存储图片地址'),text('agent_prompt','本书自定义提示词'),
 ['status','varchar(16)','创作状态',"NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','writing','completed'))"],created(),updated(),
],['UNIQUE (user_id, id)'],'不持久化小说总字数 由章节汇总视图计算 避免冗余计数漂移');
table('chapter','章节正文',[
 id(),novel(),['title','varchar(200)','章节标题','NOT NULL CHECK (length(btrim(title)) > 0)'],text('content','正文 HTML 或纯文本'),
 ['content_format','varchar(8)','正文格式',"NOT NULL DEFAULT 'html' CHECK (content_format IN ('html','text'))"],
 ['word_count','integer','按统一口径统计的正文字符数','NOT NULL DEFAULT 0 CHECK (word_count >= 0)'],seq(),
 ['version','bigint','乐观锁版本号','NOT NULL DEFAULT 1 CHECK (version >= 1)'],created(),updated(),
],['UNIQUE (novel_id, id)','UNIQUE (novel_id, sequence) DEFERRABLE INITIALLY IMMEDIATE']);
table('story_character','角色',[
 id(),novel(),['name','varchar(100)','角色姓名','NOT NULL CHECK (length(btrim(name)) > 0)'],text('description','角色简介'),text('appearance','外貌'),text('personality','性格'),text('background','背景'),
 ['role','varchar(16)','角色类别',"NOT NULL DEFAULT 'supporting' CHECK (role IN ('protagonist','supporting','minor'))"],seq(),
 ['first_chapter_id','uuid','首次出场章节','NULL'],created(),updated(),
],['UNIQUE (novel_id, id)','FOREIGN KEY (novel_id, first_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED']);
table('character_alias','角色别名',[
 ['character_id','uuid','角色主键','NOT NULL REFERENCES story_character(id) ON DELETE CASCADE'],
 ['alias','varchar(100)','单个别名','NOT NULL CHECK (length(btrim(alias)) > 0)'],
],['PRIMARY KEY (character_id, alias)'],'将重复别名拆分为独立关系 不使用逗号拼接列表');
table('world_setting','世界观设定',[
 id(),novel(),['category','varchar(50)','设定分类',"NOT NULL DEFAULT '其他'"],
 ['title','varchar(200)','设定标题','NOT NULL CHECK (length(btrim(title)) > 0)'],text('content','设定内容'),created(),updated(),
]);
table('volume_outline','卷大纲',[
 id(),novel(),['title','varchar(200)','卷标题','NOT NULL CHECK (length(btrim(title)) > 0)'],text('summary','卷概要'),seq(),created(),updated(),
],['UNIQUE (novel_id, id)','UNIQUE (novel_id, sequence) DEFERRABLE INITIALLY IMMEDIATE']);
table('chapter_outline','章节大纲',[
 id(),novel(),['volume_id','uuid','所属卷 可暂不归卷','NULL'],['title','varchar(200)','章纲标题','NOT NULL CHECK (length(btrim(title)) > 0)'],text('summary','章纲情节'),seq(),
 ['status','varchar(16)','章纲进度',"NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed'))"],
 ['chapter_id','uuid','关联正文 可为空','NULL'],created(),updated(),
],['UNIQUE (novel_id, id)','UNIQUE (chapter_id)',
 'UNIQUE NULLS NOT DISTINCT (novel_id, volume_id, sequence) DEFERRABLE INITIALLY IMMEDIATE',
 'FOREIGN KEY (novel_id, volume_id) REFERENCES volume_outline(novel_id, id) DEFERRABLE INITIALLY DEFERRED',
 'FOREIGN KEY (novel_id, chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED',
 "CHECK (status <> 'completed' OR chapter_id IS NOT NULL)",
],'同一小说中 未归卷章纲也不能出现重复顺序 一个正文最多关联一个章纲');
table('foreshadowing','伏笔',[
 id(),novel(),['title','varchar(200)','伏笔标题','NOT NULL CHECK (length(btrim(title)) > 0)'],text('description','伏笔说明'),
 ['status','varchar(16)','伏笔状态',"NOT NULL DEFAULT 'planted' CHECK (status IN ('planted','hinted','resolved'))"],
 ['planted_chapter_id','uuid','埋设正文锚点','NULL'],['resolved_chapter_id','uuid','回收正文锚点','NULL'],
 ['planted_outline_id','uuid','埋设章纲锚点','NULL'],['resolved_outline_id','uuid','回收章纲锚点','NULL'],created(),updated(),
],['FOREIGN KEY (novel_id, planted_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED',
 'FOREIGN KEY (novel_id, resolved_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED',
 'FOREIGN KEY (novel_id, planted_outline_id) REFERENCES chapter_outline(novel_id, id) DEFERRABLE INITIALLY DEFERRED',
 'FOREIGN KEY (novel_id, resolved_outline_id) REFERENCES chapter_outline(novel_id, id) DEFERRABLE INITIALLY DEFERRED',
 "CHECK (status <> 'resolved' OR resolved_chapter_id IS NOT NULL OR resolved_outline_id IS NOT NULL)",
]);
table('model_profile','模型配置',[
 id(),['user_id','uuid','配置拥有者','NOT NULL REFERENCES app_user(id) ON DELETE CASCADE'],
 ['name','varchar(80)','用户自定义配置名','NOT NULL CHECK (length(btrim(name)) > 0)'],['provider','varchar(50)','服务商标识 不限制新增服务商','NOT NULL'],
 ['protocol','varchar(16)','接口协议',"NOT NULL CHECK (protocol IN ('openai','responses','anthropic','gemini'))"],
 ['base_url','text','API 基础地址 不含密钥',"NOT NULL CHECK (base_url ~ '^https?://' AND base_url !~* '[?&](key|api_key|token)=')"],
 ['model_id','varchar(200)','API 模型 ID 或部署名','NOT NULL CHECK (length(btrim(model_id)) > 0)'],
 ['auth_mode','varchar(16)','认证方式',"NOT NULL DEFAULT 'bearer' CHECK (auth_mode IN ('bearer','x-api-key','api-key','none'))"],
 ['temperature','numeric(3,2)','随机性','NOT NULL DEFAULT 0.70 CHECK (temperature BETWEEN 0 AND 2)'],
 ['send_temperature','boolean','是否发送随机性','NOT NULL DEFAULT true'],
 ['max_tokens','integer','最大输出预算','NOT NULL DEFAULT 8192 CHECK (max_tokens > 0)'],
 ['token_parameter','varchar(24)','长度参数选择',"NOT NULL DEFAULT 'auto' CHECK (token_parameter IN ('auto','max_tokens','max_completion_tokens','omit'))"],
 ['stream','boolean','是否流式输出','NOT NULL DEFAULT true'],
 ['timeout_seconds','integer','总超时秒数','NOT NULL DEFAULT 180 CHECK (timeout_seconds BETWEEN 5 AND 1800)'],
 ['extra_body','jsonb','服务商扩展参数',"NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra_body) = 'object')"],
 ['extra_headers','jsonb','不含凭据的扩展请求头',"NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra_headers) = 'object' AND NOT (extra_headers ?| ARRAY['Authorization','authorization','api-key','x-api-key','x-goog-api-key']))"],
 ['is_default','boolean','是否为用户默认配置','NOT NULL DEFAULT false'],created(),updated(),
],['UNIQUE (user_id, name)',"CHECK (protocol <> 'anthropic' OR token_parameter <> 'omit')"],
 'API Key 不属于本表 JSON 扩展仅承载供应商特有参数 核心业务字段仍使用有类型的列');
table('model_credential','模型凭据',[
 ['profile_id','uuid','配置主键 一对零或一','PRIMARY KEY REFERENCES model_profile(id) ON DELETE CASCADE'],
 ['ciphertext','bytea','AES GCM 密文 含认证标签','NOT NULL CHECK (octet_length(ciphertext) > 16)'],
 ['nonce','bytea','每次加密重新生成的随机数','NOT NULL CHECK (octet_length(nonce) = 12)'],
 ['key_version','integer','服务端加密密钥版本','NOT NULL CHECK (key_version > 0)'],created(),updated(),
],[],'数据库只存密文和密钥版本 加密主密钥放服务端密钥管理 本 SQL 不实现密码学算法');
table('chat_session','对话会话',[
 id(),novel(),['title','varchar(200)','会话标题',"NOT NULL DEFAULT '新会话'"],created(),updated(),
]);
table('chat_message','对话消息',[
 id(),['session_id','uuid','所属会话','NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE'],
 ['role','varchar(16)','消息角色',"NOT NULL CHECK (role IN ('system','user','assistant'))"],text('content','消息正文 不持久化隐藏推理'),
 ['status','varchar(16)','生成生命周期',"NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','streaming','completed','failed','cancelled'))"],seq(),
 ['model_profile_id','uuid','调用时使用的配置','NULL REFERENCES model_profile(id) ON DELETE SET NULL'],
 ['model_snapshot','varchar(200)','调用时模型 ID 快照','NULL'],['protocol_snapshot','varchar(16)','调用时协议快照','NULL CHECK (protocol_snapshot IS NULL OR protocol_snapshot IN (\'openai\',\'responses\',\'anthropic\',\'gemini\'))'],
 ['request_id','uuid','客户端请求幂等标识','NULL UNIQUE'],
 ['input_tokens','integer','上游返回的输入用量','NULL CHECK (input_tokens >= 0)'],['output_tokens','integer','上游返回的输出用量','NULL CHECK (output_tokens >= 0)'],
 created(),['finished_at','timestamptz','终态完成时间','NULL'],
],['UNIQUE (session_id, sequence)',"CHECK (status NOT IN ('completed','failed','cancelled') OR finished_at IS NOT NULL)"],
 'Token 用量未知时保持 NULL 不虚构为零 配置删除后保留历史模型快照');
table('chapter_revision','章节历史版本',[
 id(),['chapter_id','uuid','所属正文','NOT NULL REFERENCES chapter(id) ON DELETE CASCADE'],
 ['version','bigint','对应正文版本','NOT NULL CHECK (version >= 1)'],['title','varchar(200)','当时的标题','NOT NULL'],text('content','当时的完整正文'),
 ['content_format','varchar(8)','快照格式',"NOT NULL CHECK (content_format IN ('html','text'))"],
 ['word_count','integer','当时统计字数','NOT NULL CHECK (word_count >= 0)'],
 ['change_source','varchar(16)','修改来源',"NOT NULL CHECK (change_source IN ('manual','ai','restore','import'))"],created(),
],['UNIQUE (chapter_id, version)'],'通过触发器在正文新建和版本递增后自动写快照 历史恢复生成新版本');
table('novel_reading_state','小说阅读状态',[
 ['novel_id','uuid','小说主键 拥有者由小说推导','PRIMARY KEY REFERENCES novel(id) ON DELETE CASCADE'],
 ['last_chapter_id','uuid','上次打开的章节','NULL'],['cursor_offset','integer','编辑光标位置','NOT NULL DEFAULT 0 CHECK (cursor_offset >= 0)'],updated(),
],['FOREIGN KEY (novel_id, last_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED'],
 '本期一个小说仅有一位拥有者 不重复存储可推导的 user_id 多人协作需另行设计成员表');

let sql = `-- NovelAgent 数据库课程设计  PostgreSQL 16 及以上\n-- 作者 李晴  学号 202400702062  深圳技术大学\n-- 教学独立 schema 不修改应用现有 SQLite 不含生产账号或真实密钥\n-- 在空的练习数据库中执行一次 禁止直接对生产库重复初始化\nBEGIN;\nCREATE SCHEMA novel_agent;\nSET search_path TO novel_agent, public;\n\n`;
for(const t of tables) {
 sql += `-- ${t.label}${t.note ? ' '+t.note : ''}\nCREATE TABLE ${t.name} (\n`;
 sql += [...t.fields.map(([n,type,,rules])=>`  ${n} ${type} ${rules}`),...t.constraints.map(c=>'  '+c)].join(',\n')+'\n);\n\n';
}
sql += `-- 支持拥有者列表 同级排序和消息分页\nCREATE INDEX ix_novel_owner_updated ON novel(user_id, updated_at DESC);\nCREATE INDEX ix_character_novel_role ON story_character(novel_id, role, sequence);\nCREATE INDEX ix_world_novel_category ON world_setting(novel_id, category);\nCREATE INDEX ix_outline_novel_status ON chapter_outline(novel_id, status);\nCREATE INDEX ix_foreshadow_novel_status ON foreshadowing(novel_id, status);\nCREATE INDEX ix_session_novel_updated ON chat_session(novel_id, updated_at DESC);\nCREATE INDEX ix_message_profile ON chat_message(model_profile_id) WHERE model_profile_id IS NOT NULL;\nCREATE UNIQUE INDEX ux_profile_one_default ON model_profile(user_id) WHERE is_default;\n\n-- 子实体的所属关系建立后不可直接搬家 减少关联归属漂移\nCREATE FUNCTION prevent_owner_move() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$\nBEGIN\n  IF to_jsonb(OLD) -> TG_ARGV[0] IS DISTINCT FROM to_jsonb(NEW) -> TG_ARGV[0] THEN\n    RAISE EXCEPTION '所属关系不可修改 请使用明确的复制或迁移流程' USING ERRCODE = '23514';\n  END IF;\n  RETURN NEW;\nEND; $$;\n`;
for(const name of ['novel','model_profile']) sql+=`CREATE TRIGGER ${name}_owner_guard BEFORE UPDATE ON ${name} FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('user_id');\n`;
for(const name of ['chapter','story_character','world_setting','volume_outline','chapter_outline','foreshadowing','chat_session']) sql+=`CREATE TRIGGER ${name}_novel_guard BEFORE UPDATE ON ${name} FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');\n`;
sql+=`CREATE TRIGGER message_session_guard BEFORE UPDATE ON chat_message FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('session_id');\n\nCREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$\nBEGIN NEW.updated_at := CURRENT_TIMESTAMP; RETURN NEW; END; $$;\n`;
for(const t of tables.filter(t=>t.fields.some(f=>f[0]==='updated_at'))) sql+=`CREATE TRIGGER ${t.name}_touch BEFORE UPDATE ON ${t.name} FOR EACH ROW EXECUTE FUNCTION touch_updated_at();\n`;
sql+=`\n-- 正文版本控制和自动快照\nCREATE FUNCTION guard_chapter_version() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$\nBEGIN\n  IF (NEW.title, NEW.content, NEW.word_count, NEW.content_format) IS DISTINCT FROM\n     (OLD.title, OLD.content, OLD.word_count, OLD.content_format) THEN\n    IF NEW.version <> OLD.version + 1 THEN\n      RAISE EXCEPTION '正文修改必须递增版本' USING ERRCODE = '23514';\n    END IF;\n  ELSIF NEW.version NOT IN (OLD.version, OLD.version + 1) THEN\n    RAISE EXCEPTION '版本号不连续' USING ERRCODE = '23514';\n  END IF;\n  RETURN NEW;\nEND; $$;\nCREATE TRIGGER chapter_version_guard BEFORE UPDATE ON chapter FOR EACH ROW EXECUTE FUNCTION guard_chapter_version();\n\nCREATE FUNCTION capture_chapter_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$\nDECLARE v_source text;\nBEGIN\n  IF TG_OP = 'UPDATE' THEN\n    IF NEW.version = OLD.version THEN RETURN NEW; END IF;\n  END IF;\n  v_source := COALESCE(NULLIF(current_setting('novel_agent.change_source', true), ''), 'manual');\n  INSERT INTO chapter_revision(chapter_id, version, title, content, content_format, word_count, change_source)\n  VALUES(NEW.id, NEW.version, NEW.title, NEW.content, NEW.content_format, NEW.word_count, v_source);\n  RETURN NEW;\nEND; $$;\nCREATE TRIGGER chapter_revision_capture AFTER INSERT OR UPDATE ON chapter FOR EACH ROW EXECUTE FUNCTION capture_chapter_revision();\n\n-- 行锁和期望版本共同阻止过期客户端覆盖 参数 user 必须来自后端已验证身份\nCREATE FUNCTION save_chapter(p_user uuid, p_chapter uuid, p_expected bigint,\n  p_title text, p_content text, p_word_count integer, p_format text, p_source text DEFAULT 'manual')\nRETURNS bigint LANGUAGE plpgsql SET search_path = novel_agent, public AS $$\nDECLARE v_current bigint; v_new bigint;\nBEGIN\n  IF p_expected IS NULL OR p_expected < 1 THEN\n    RAISE EXCEPTION '必须提交有效的预期版本号' USING ERRCODE = '23514';\n  END IF;\n  IF p_source IS NULL OR p_source NOT IN ('manual','ai','restore','import') THEN\n    RAISE EXCEPTION '非法版本来源' USING ERRCODE = '23514';\n  END IF;\n  SELECT c.version INTO v_current FROM chapter c JOIN novel n ON n.id = c.novel_id\n    WHERE c.id = p_chapter AND n.user_id = p_user FOR UPDATE OF c;\n  IF NOT FOUND THEN RAISE EXCEPTION '章节不存在或无权访问' USING ERRCODE = '42501'; END IF;\n  IF v_current <> p_expected THEN\n    RAISE EXCEPTION '版本冲突 期望 % 实际 %', p_expected, v_current USING ERRCODE = '40001';\n  END IF;\n  PERFORM set_config('novel_agent.change_source', p_source, true);\n  UPDATE chapter SET title=p_title, content=p_content, word_count=p_word_count,\n    content_format=p_format, version=version+1 WHERE id=p_chapter RETURNING version INTO v_new;\n  RETURN v_new;\nEND; $$;\n\n-- 配置引用必须属于会话所在小说的拥有者\nCREATE FUNCTION check_message_profile_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$\nBEGIN\n  IF NEW.model_profile_id IS NOT NULL AND NOT EXISTS (\n    SELECT 1 FROM chat_session s JOIN novel n ON n.id=s.novel_id\n      JOIN model_profile p ON p.user_id=n.user_id\n    WHERE s.id=NEW.session_id AND p.id=NEW.model_profile_id\n  ) THEN RAISE EXCEPTION '消息引用了其他用户的模型配置' USING ERRCODE='23514'; END IF;\n  RETURN NEW;\nEND; $$;\nCREATE TRIGGER message_profile_owner BEFORE INSERT OR UPDATE ON chat_message FOR EACH ROW EXECUTE FUNCTION check_message_profile_owner();\n\nCREATE VIEW novel_word_stats AS\nSELECT n.id AS novel_id, n.user_id, COUNT(c.id) AS chapter_count,\n  COALESCE(SUM(c.word_count),0)::bigint AS total_words\nFROM novel n LEFT JOIN chapter c ON c.novel_id=n.id GROUP BY n.id,n.user_id;\n\nCOMMENT ON SCHEMA novel_agent IS 'NovelAgent 课程数据库设计 独立于当前应用数据库';\nCOMMIT;\n`;
fs.writeFileSync(path.join(root,'sql','01_schema.sql'),sql);
fs.writeFileSync(path.join(root,'schema-metadata.json'),JSON.stringify(tables,null,2)+'\n');
console.log(`${tables.length} tables, ${tables.reduce((n,t)=>n+t.fields.length,0)} fields generated`);
