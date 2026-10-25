-- 先执行 01_schema.sql 和 02_seed.sql 后运行本文件
SET search_path TO novel_agent, public;

-- QUERY Q01 用户小说列表及总字数
SELECT n.id, n.title, s.chapter_count, s.total_words
FROM novel n JOIN novel_word_stats s ON s.novel_id=n.id
WHERE n.user_id='00000000-0000-0000-0000-000000000001'
ORDER BY n.updated_at DESC, n.id;

-- QUERY Q02 卷纲与章纲层级 左连接保留未归卷大纲
SELECT COALESCE(v.title,'未归卷') AS volume_title, o.title, o.status, c.title AS chapter_title
FROM chapter_outline o
LEFT JOIN volume_outline v ON v.id=o.volume_id
LEFT JOIN chapter c ON c.id=o.chapter_id
WHERE o.novel_id='00000000-0000-0000-0000-000000000101'
ORDER BY v.sequence NULLS LAST, o.sequence;

-- QUERY Q03 尚未回收的伏笔
SELECT f.title, f.status, c.title AS planted_at
FROM foreshadowing f LEFT JOIN chapter c ON c.id=f.planted_chapter_id
WHERE f.novel_id='00000000-0000-0000-0000-000000000101'
AND f.status IN ('planted','hinted') ORDER BY f.created_at,f.id;

-- QUERY Q04 消息游标分页 以 sequence 大于游标替代深 OFFSET
SELECT id,role,content,status,sequence,model_snapshot
FROM chat_message
WHERE session_id='00000000-0000-0000-0000-000000000901' AND sequence > -1
ORDER BY sequence LIMIT 20;

-- QUERY Q05 GROUP BY 与 HAVING 查询至少有两章的小说
SELECT n.title,COUNT(c.id) AS chapters,SUM(c.word_count) AS words
FROM novel n JOIN chapter c ON c.novel_id=n.id
WHERE n.user_id='00000000-0000-0000-0000-000000000001'
GROUP BY n.id,n.title HAVING COUNT(c.id)>=2;

-- QUERY Q06 NOT EXISTS 查询没有章节的小说
SELECT n.id,n.title FROM novel n
WHERE n.user_id='00000000-0000-0000-0000-000000000001'
AND NOT EXISTS(SELECT 1 FROM chapter c WHERE c.novel_id=n.id);

-- QUERY Q07 窗口函数 每章字数与本书累计字数
SELECT title,word_count,
SUM(word_count) OVER (PARTITION BY novel_id ORDER BY sequence ROWS UNBOUNDED PRECEDING) AS cumulative_words
FROM chapter WHERE novel_id='00000000-0000-0000-0000-000000000101'
ORDER BY sequence;

-- QUERY Q08 查询角色与其多个别名
SELECT c.name,COALESCE(string_agg(a.alias,'、' ORDER BY a.alias),'') AS aliases
FROM story_character c LEFT JOIN character_alias a ON a.character_id=c.id
WHERE c.novel_id='00000000-0000-0000-0000-000000000101'
GROUP BY c.id,c.name;

-- QUERY Q09 查询特定章节的所有历史版本
SELECT version,title,word_count,change_source,created_at
FROM chapter_revision WHERE chapter_id='00000000-0000-0000-0000-000000000201'
ORDER BY version DESC;

-- QUERY Q10 使用关联子查询查询每本小说的最近章节
SELECT n.title,c.title AS latest_chapter
FROM novel n LEFT JOIN LATERAL (
 SELECT title FROM chapter WHERE novel_id=n.id ORDER BY sequence DESC LIMIT 1
) c ON true
WHERE n.user_id='00000000-0000-0000-0000-000000000001';
