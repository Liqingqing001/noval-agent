-- 在课程版专用数据库执行；查询与统计可在 DB Browser for SQLite 中查看。
-- 1. 查询某用户书架（演示账号通常为 1；请先用邮箱查实际 id）。
SELECT id,nickname,email FROM app_user;
SELECT id,title,status FROM novel WHERE user_id=1 ORDER BY updated_at DESC;
-- 2. 连接查询章节与所属小说。
SELECT n.title AS 小说,c.sequence AS 章序,c.title AS 章节
FROM novel n JOIN chapter c ON c.novel_id=n.id
WHERE n.user_id=1 ORDER BY n.id,c.sequence;
-- 3. 分组统计每本小说章节数：LEFT JOIN 保留零章节小说。
SELECT n.id,n.title,count(c.id) AS 章节数
FROM novel n LEFT JOIN chapter c ON c.novel_id=n.id
WHERE n.user_id=1 GROUP BY n.id,n.title;
-- 4. 统计人物数量，避免与章节同时连接造成重复计数。
SELECT n.id,n.title,(SELECT count(*) FROM story_character s WHERE s.novel_id=n.id) AS 人物数
FROM novel n WHERE n.user_id=1;
-- 5. 观察级联删除前后：先新建“演示作品”，不要操作要保留的书。
-- SELECT * FROM chapter WHERE novel_id = 需要检查的小说编号;
-- SELECT * FROM story_character WHERE novel_id = 需要检查的小说编号;
-- 课堂新增、修改、删除由 Web 页面触发，后台使用参数化 SQL。
