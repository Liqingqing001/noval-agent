-- NovelAgent 数据库课程设计  PostgreSQL 16 及以上
-- 作者 李晴  学号 202400702062  深圳技术大学
-- 教学独立 schema 不修改应用现有 SQLite 不含生产账号或真实密钥
-- 在空的练习数据库中执行一次 禁止直接对生产库重复初始化
BEGIN;
CREATE SCHEMA novel_agent;
SET search_path TO novel_agent, public;

-- 用户账户
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND position('@' in email) > 1),
  password_hash text NOT NULL CHECK (length(password_hash) >= 20),
  nickname varchar(80) NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 小说 不持久化小说总字数 由章节汇总视图计算 避免冗余计数漂移
CREATE TABLE novel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  genre varchar(80) NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  cover_url text NOT NULL DEFAULT '',
  agent_prompt text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','writing','completed')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, id)
);

-- 章节正文
CREATE TABLE chapter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  content text NOT NULL DEFAULT '',
  content_format varchar(8) NOT NULL DEFAULT 'html' CHECK (content_format IN ('html','text')),
  word_count integer NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  sequence integer NOT NULL CHECK (sequence >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (novel_id, id),
  UNIQUE (novel_id, sequence) DEFERRABLE INITIALLY IMMEDIATE
);

-- 角色
CREATE TABLE story_character (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  description text NOT NULL DEFAULT '',
  appearance text NOT NULL DEFAULT '',
  personality text NOT NULL DEFAULT '',
  background text NOT NULL DEFAULT '',
  role varchar(16) NOT NULL DEFAULT 'supporting' CHECK (role IN ('protagonist','supporting','minor')),
  sequence integer NOT NULL CHECK (sequence >= 0),
  first_chapter_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (novel_id, id),
  FOREIGN KEY (novel_id, first_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED
);

-- 角色别名 将重复别名拆分为独立关系 不使用逗号拼接列表
CREATE TABLE character_alias (
  character_id uuid NOT NULL REFERENCES story_character(id) ON DELETE CASCADE,
  alias varchar(100) NOT NULL CHECK (length(btrim(alias)) > 0),
  PRIMARY KEY (character_id, alias)
);

-- 世界观设定
CREATE TABLE world_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  category varchar(50) NOT NULL DEFAULT '其他',
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 卷大纲
CREATE TABLE volume_outline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  summary text NOT NULL DEFAULT '',
  sequence integer NOT NULL CHECK (sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (novel_id, id),
  UNIQUE (novel_id, sequence) DEFERRABLE INITIALLY IMMEDIATE
);

-- 章节大纲 同一小说中 未归卷章纲也不能出现重复顺序 一个正文最多关联一个章纲
CREATE TABLE chapter_outline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  volume_id uuid NULL,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  summary text NOT NULL DEFAULT '',
  sequence integer NOT NULL CHECK (sequence >= 0),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  chapter_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (novel_id, id),
  UNIQUE (chapter_id),
  UNIQUE NULLS NOT DISTINCT (novel_id, volume_id, sequence) DEFERRABLE INITIALLY IMMEDIATE,
  FOREIGN KEY (novel_id, volume_id) REFERENCES volume_outline(novel_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (novel_id, chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (status <> 'completed' OR chapter_id IS NOT NULL)
);

-- 伏笔
CREATE TABLE foreshadowing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'planted' CHECK (status IN ('planted','hinted','resolved')),
  planted_chapter_id uuid NULL,
  resolved_chapter_id uuid NULL,
  planted_outline_id uuid NULL,
  resolved_outline_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id, planted_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (novel_id, resolved_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (novel_id, planted_outline_id) REFERENCES chapter_outline(novel_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (novel_id, resolved_outline_id) REFERENCES chapter_outline(novel_id, id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (status <> 'resolved' OR resolved_chapter_id IS NOT NULL OR resolved_outline_id IS NOT NULL)
);

-- 模型配置 API Key 不属于本表 JSON 扩展仅承载供应商特有参数 核心业务字段仍使用有类型的列
CREATE TABLE model_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL CHECK (length(btrim(name)) > 0),
  provider varchar(50) NOT NULL,
  protocol varchar(16) NOT NULL CHECK (protocol IN ('openai','responses','anthropic','gemini')),
  base_url text NOT NULL CHECK (base_url ~ '^https?://' AND base_url !~* '[?&](key|api_key|token)='),
  model_id varchar(200) NOT NULL CHECK (length(btrim(model_id)) > 0),
  auth_mode varchar(16) NOT NULL DEFAULT 'bearer' CHECK (auth_mode IN ('bearer','x-api-key','api-key','none')),
  temperature numeric(3,2) NOT NULL DEFAULT 0.70 CHECK (temperature BETWEEN 0 AND 2),
  send_temperature boolean NOT NULL DEFAULT true,
  max_tokens integer NOT NULL DEFAULT 8192 CHECK (max_tokens > 0),
  token_parameter varchar(24) NOT NULL DEFAULT 'auto' CHECK (token_parameter IN ('auto','max_tokens','max_completion_tokens','omit')),
  stream boolean NOT NULL DEFAULT true,
  timeout_seconds integer NOT NULL DEFAULT 180 CHECK (timeout_seconds BETWEEN 5 AND 1800),
  extra_body jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra_body) = 'object'),
  extra_headers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(extra_headers) = 'object' AND NOT (extra_headers ?| ARRAY['Authorization','authorization','api-key','x-api-key','x-goog-api-key'])),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name),
  CHECK (protocol <> 'anthropic' OR token_parameter <> 'omit')
);

-- 模型凭据 数据库只存密文和密钥版本 加密主密钥放服务端密钥管理 本 SQL 不实现密码学算法
CREATE TABLE model_credential (
  profile_id uuid PRIMARY KEY REFERENCES model_profile(id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) > 16),
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  key_version integer NOT NULL CHECK (key_version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 对话会话
CREATE TABLE chat_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id uuid NOT NULL REFERENCES novel(id) ON DELETE CASCADE,
  title varchar(200) NOT NULL DEFAULT '新会话',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 对话消息 Token 用量未知时保持 NULL 不虚构为零 配置删除后保留历史模型快照
CREATE TABLE chat_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('system','user','assistant')),
  content text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','streaming','completed','failed','cancelled')),
  sequence integer NOT NULL CHECK (sequence >= 0),
  model_profile_id uuid NULL REFERENCES model_profile(id) ON DELETE SET NULL,
  model_snapshot varchar(200) NULL,
  protocol_snapshot varchar(16) NULL CHECK (protocol_snapshot IS NULL OR protocol_snapshot IN ('openai','responses','anthropic','gemini')),
  request_id uuid NULL UNIQUE,
  input_tokens integer NULL CHECK (input_tokens >= 0),
  output_tokens integer NULL CHECK (output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamptz NULL,
  UNIQUE (session_id, sequence),
  CHECK (status NOT IN ('completed','failed','cancelled') OR finished_at IS NOT NULL)
);

-- 章节历史版本 通过触发器在正文新建和版本递增后自动写快照 历史恢复生成新版本
CREATE TABLE chapter_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
  version bigint NOT NULL CHECK (version >= 1),
  title varchar(200) NOT NULL,
  content text NOT NULL DEFAULT '',
  content_format varchar(8) NOT NULL CHECK (content_format IN ('html','text')),
  word_count integer NOT NULL CHECK (word_count >= 0),
  change_source varchar(16) NOT NULL CHECK (change_source IN ('manual','ai','restore','import')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (chapter_id, version)
);

-- 小说阅读状态 本期一个小说仅有一位拥有者 不重复存储可推导的 user_id 多人协作需另行设计成员表
CREATE TABLE novel_reading_state (
  novel_id uuid PRIMARY KEY REFERENCES novel(id) ON DELETE CASCADE,
  last_chapter_id uuid NULL,
  cursor_offset integer NOT NULL DEFAULT 0 CHECK (cursor_offset >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id, last_chapter_id) REFERENCES chapter(novel_id, id) DEFERRABLE INITIALLY DEFERRED
);

-- 支持拥有者列表 同级排序和消息分页
CREATE INDEX ix_novel_owner_updated ON novel(user_id, updated_at DESC);
CREATE INDEX ix_character_novel_role ON story_character(novel_id, role, sequence);
CREATE INDEX ix_world_novel_category ON world_setting(novel_id, category);
CREATE INDEX ix_outline_novel_status ON chapter_outline(novel_id, status);
CREATE INDEX ix_foreshadow_novel_status ON foreshadowing(novel_id, status);
CREATE INDEX ix_session_novel_updated ON chat_session(novel_id, updated_at DESC);
CREATE INDEX ix_message_profile ON chat_message(model_profile_id) WHERE model_profile_id IS NOT NULL;
CREATE UNIQUE INDEX ux_profile_one_default ON model_profile(user_id) WHERE is_default;

-- 子实体的所属关系建立后不可直接搬家 减少关联归属漂移
CREATE FUNCTION prevent_owner_move() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$
BEGIN
  IF to_jsonb(OLD) -> TG_ARGV[0] IS DISTINCT FROM to_jsonb(NEW) -> TG_ARGV[0] THEN
    RAISE EXCEPTION '所属关系不可修改 请使用明确的复制或迁移流程' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER novel_owner_guard BEFORE UPDATE ON novel FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('user_id');
CREATE TRIGGER model_profile_owner_guard BEFORE UPDATE ON model_profile FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('user_id');
CREATE TRIGGER chapter_novel_guard BEFORE UPDATE ON chapter FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');
CREATE TRIGGER story_character_novel_guard BEFORE UPDATE ON story_character FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');
CREATE TRIGGER world_setting_novel_guard BEFORE UPDATE ON world_setting FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');
CREATE TRIGGER volume_outline_novel_guard BEFORE UPDATE ON volume_outline FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');
CREATE TRIGGER chapter_outline_novel_guard BEFORE UPDATE ON chapter_outline FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');
CREATE TRIGGER foreshadowing_novel_guard BEFORE UPDATE ON foreshadowing FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');
CREATE TRIGGER chat_session_novel_guard BEFORE UPDATE ON chat_session FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('novel_id');
CREATE TRIGGER message_session_guard BEFORE UPDATE ON chat_message FOR EACH ROW EXECUTE FUNCTION prevent_owner_move('session_id');

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$
BEGIN NEW.updated_at := CURRENT_TIMESTAMP; RETURN NEW; END; $$;
CREATE TRIGGER app_user_touch BEFORE UPDATE ON app_user FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER novel_touch BEFORE UPDATE ON novel FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER chapter_touch BEFORE UPDATE ON chapter FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER story_character_touch BEFORE UPDATE ON story_character FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER world_setting_touch BEFORE UPDATE ON world_setting FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER volume_outline_touch BEFORE UPDATE ON volume_outline FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER chapter_outline_touch BEFORE UPDATE ON chapter_outline FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER foreshadowing_touch BEFORE UPDATE ON foreshadowing FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER model_profile_touch BEFORE UPDATE ON model_profile FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER model_credential_touch BEFORE UPDATE ON model_credential FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER chat_session_touch BEFORE UPDATE ON chat_session FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER novel_reading_state_touch BEFORE UPDATE ON novel_reading_state FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 正文版本控制和自动快照
CREATE FUNCTION guard_chapter_version() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$
BEGIN
  IF (NEW.title, NEW.content, NEW.word_count, NEW.content_format) IS DISTINCT FROM
     (OLD.title, OLD.content, OLD.word_count, OLD.content_format) THEN
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION '正文修改必须递增版本' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.version NOT IN (OLD.version, OLD.version + 1) THEN
    RAISE EXCEPTION '版本号不连续' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER chapter_version_guard BEFORE UPDATE ON chapter FOR EACH ROW EXECUTE FUNCTION guard_chapter_version();

CREATE FUNCTION capture_chapter_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$
DECLARE v_source text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.version = OLD.version THEN RETURN NEW; END IF;
  END IF;
  v_source := COALESCE(NULLIF(current_setting('novel_agent.change_source', true), ''), 'manual');
  INSERT INTO chapter_revision(chapter_id, version, title, content, content_format, word_count, change_source)
  VALUES(NEW.id, NEW.version, NEW.title, NEW.content, NEW.content_format, NEW.word_count, v_source);
  RETURN NEW;
END; $$;
CREATE TRIGGER chapter_revision_capture AFTER INSERT OR UPDATE ON chapter FOR EACH ROW EXECUTE FUNCTION capture_chapter_revision();

-- 行锁和期望版本共同阻止过期客户端覆盖 参数 user 必须来自后端已验证身份
CREATE FUNCTION save_chapter(p_user uuid, p_chapter uuid, p_expected bigint,
  p_title text, p_content text, p_word_count integer, p_format text, p_source text DEFAULT 'manual')
RETURNS bigint LANGUAGE plpgsql SET search_path = novel_agent, public AS $$
DECLARE v_current bigint; v_new bigint;
BEGIN
  IF p_expected IS NULL OR p_expected < 1 THEN
    RAISE EXCEPTION '必须提交有效的预期版本号' USING ERRCODE = '23514';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual','ai','restore','import') THEN
    RAISE EXCEPTION '非法版本来源' USING ERRCODE = '23514';
  END IF;
  SELECT c.version INTO v_current FROM chapter c JOIN novel n ON n.id = c.novel_id
    WHERE c.id = p_chapter AND n.user_id = p_user FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION '章节不存在或无权访问' USING ERRCODE = '42501'; END IF;
  IF v_current <> p_expected THEN
    RAISE EXCEPTION '版本冲突 期望 % 实际 %', p_expected, v_current USING ERRCODE = '40001';
  END IF;
  PERFORM set_config('novel_agent.change_source', p_source, true);
  UPDATE chapter SET title=p_title, content=p_content, word_count=p_word_count,
    content_format=p_format, version=version+1 WHERE id=p_chapter RETURNING version INTO v_new;
  RETURN v_new;
END; $$;

-- 配置引用必须属于会话所在小说的拥有者
CREATE FUNCTION check_message_profile_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = novel_agent, public AS $$
BEGIN
  IF NEW.model_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM chat_session s JOIN novel n ON n.id=s.novel_id
      JOIN model_profile p ON p.user_id=n.user_id
    WHERE s.id=NEW.session_id AND p.id=NEW.model_profile_id
  ) THEN RAISE EXCEPTION '消息引用了其他用户的模型配置' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER message_profile_owner BEFORE INSERT OR UPDATE ON chat_message FOR EACH ROW EXECUTE FUNCTION check_message_profile_owner();

CREATE VIEW novel_word_stats AS
SELECT n.id AS novel_id, n.user_id, COUNT(c.id) AS chapter_count,
  COALESCE(SUM(c.word_count),0)::bigint AS total_words
FROM novel n LEFT JOIN chapter c ON c.novel_id=n.id GROUP BY n.id,n.user_id;

COMMENT ON SCHEMA novel_agent IS 'NovelAgent 课程数据库设计 独立于当前应用数据库';
COMMIT;
