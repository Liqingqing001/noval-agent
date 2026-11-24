# 山海书房：NovelAgent 课程简化版

这是基于原小说创作系统业务重新整理的独立课堂演示程序，四张表：用户、小说、章节、人物。它不读取原系统数据，不取代原系统，不包含 AI 模型调用。适合数据库课程现场演示增、删、改、查。

## 运行（建议 Node.js 24 LTS）

需要 Node.js 22.13.0 或以上，推荐 24 LTS。使用内置 `node:sqlite`，不需要 npm install、Python、MySQL、API Key 或互联网。第一次安装 Node 本身需要提前完成。

解压后在 `source` 目录打开 PowerShell：

```powershell
node --version
node server.mjs --seed
```

保持窗口运行，浏览器打开 `http://127.0.0.1:4178`。也可以在 PowerShell 运行 `./start.ps1`；若本机禁用脚本，直接使用上面的 node 命令，不必修改执行策略。

教学账号：`demo@example.test`；教学密码：`Demo2026!`。这不是原系统账号。`--seed` 仅在该邮箱不存在时新增初始账号和《山海来信》《春日手记》，不会清空现有库；删掉示例书后重启不会自动补回。可以注册新用户。

## 数据与现场展示

数据写入本目录 `data/course.db`，停止服务后仍保留；服务器重启后要重新登录，因为会话仅保存在内存。停止方法：在启动窗口按 Ctrl+C。

在第二个 PowerShell 窗口，进入相同目录：

```powershell
node inspect-db.mjs
```

可对照前端操作查看四张表，用户表不输出密码散列。SQL 建表源码在 `schema.sql`，课堂查询在 `queries.sql`。可选装 DB Browser for SQLite 用于图形化查看，展示刷新后再检查数据库。不要把原系统数据库复制到这里，也不要在原系统运行本 SQL。

若 4178 被占用：

```powershell
$env:PORT = '4179'
node server.mjs --seed
```

随后打开 `http://127.0.0.1:4179`。仅监听本机，不建议直接暴露到公网。

## 验证

```powershell
node --test test.mjs
```

包含 32 个具体检查，测试框架另计 1 个父测试，汇总为 33 项。测试使用独立内存库与清理后的临时文件，不改动演示库，覆盖 CRUD、持久化、外键/唯一/CHECK 约束、密码错误和跨用户隔离。

## 简化边界

原系统采用 React + Express + Prisma + SQLite，除本材料关注的四类实体，还包括大纲、世界观、伏笔等。课程版改用普通 HTML/CSS/JS + Node HTTP + 内置 SQLite，四张表为独立物理设计。实际使用数据库为 SQLite，不是 MySQL；课程文档推荐 MySQL，如老师明确限定 MySQL，需另行迁移并复测，不能把本版描述成 MySQL 成果。

密码使用带随机盐的 scrypt 散列，会话通过 HttpOnly/SameSite cookie 传递，后台进行归属校验和参数化 SQL。定位为本机课堂演示：无找回密码、登录限流、HTTPS 部署、复杂并发控制及多人协作，不宣称生产安全或支持大规模并发。
