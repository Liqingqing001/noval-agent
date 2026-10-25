-- 全部为虚构教学数据 密码占位文本不能用于登录
BEGIN;
SET search_path TO novel_agent, public;
INSERT INTO app_user(id,email,password_hash,nickname) VALUES
('00000000-0000-0000-0000-000000000001','author_a@example.test','DEMO_HASH_NOT_FOR_LOGIN_0001','作者甲'),
('00000000-0000-0000-0000-000000000002','author_b@example.test','DEMO_HASH_NOT_FOR_LOGIN_0002','作者乙');
INSERT INTO novel(id,user_id,title,status) VALUES
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','潮汐之城','writing'),('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','星港来信','draft'),('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000002','北境手记','draft');
INSERT INTO chapter(id,novel_id,title,content,content_format,word_count,sequence) VALUES
('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','潮声','潮声初起','text',4,0),
('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000101','旧港','旧港灯火','text',4,1),
('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000103','雪原','雪原无声','text',4,0);
INSERT INTO story_character(id,novel_id,name,role,sequence,first_chapter_id) VALUES('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000101','林澈','protagonist',0,'00000000-0000-0000-0000-000000000201');
INSERT INTO character_alias(character_id,alias) VALUES('00000000-0000-0000-0000-000000000301','阿澈'),('00000000-0000-0000-0000-000000000301','小林');
INSERT INTO world_setting(id,novel_id,category,title,content) VALUES('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000101','地理','旧港','潮汐城的旧港区');
INSERT INTO volume_outline(id,novel_id,title,sequence) VALUES('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000101','启程',0),('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000103','北境',0);
INSERT INTO chapter_outline(id,novel_id,volume_id,title,sequence,status,chapter_id) VALUES('00000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000501','潮声',0,'completed','00000000-0000-0000-0000-000000000201');
INSERT INTO chapter_outline(id,novel_id,title,sequence) VALUES('00000000-0000-0000-0000-000000000602','00000000-0000-0000-0000-000000000101','未归卷章纲',0);
INSERT INTO foreshadowing(id,novel_id,title,status,planted_chapter_id) VALUES('00000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000101','旧钥匙','planted','00000000-0000-0000-0000-000000000201');
INSERT INTO model_profile(id,user_id,name,provider,protocol,base_url,model_id,is_default) VALUES
('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000001','教学模型甲','custom','openai','https://model.example.test/v1','demo-text-model',true),
('00000000-0000-0000-0000-000000000802','00000000-0000-0000-0000-000000000002','教学模型乙','custom','responses','https://model.example.test/v1','demo-text-model',true);
-- 仅验证密文形状 不代表真实加密结果
INSERT INTO model_credential(profile_id,ciphertext,nonce,key_version) VALUES('00000000-0000-0000-0000-000000000801',decode(repeat('aa',32),'hex'),decode(repeat('bb',12),'hex'),1);
INSERT INTO chat_session(id,novel_id,title) VALUES('00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000101','第一章讨论');
INSERT INTO chat_message(id,session_id,role,content,status,sequence,finished_at) VALUES('00000000-0000-0000-0000-000000001001','00000000-0000-0000-0000-000000000901','user','请分析第一章','completed',0,CURRENT_TIMESTAMP);
INSERT INTO chat_message(id,session_id,role,content,status,sequence,model_profile_id,model_snapshot,protocol_snapshot,request_id,finished_at)
VALUES('00000000-0000-0000-0000-000000001002','00000000-0000-0000-0000-000000000901','assistant','教学示例回复','completed',1,'00000000-0000-0000-0000-000000000801','demo-text-model','openai','00000000-0000-0000-0000-000000001101',CURRENT_TIMESTAMP);
INSERT INTO novel_reading_state(novel_id,last_chapter_id,cursor_offset) VALUES('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',2);
COMMIT;
