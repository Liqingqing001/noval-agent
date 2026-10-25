# NovelAgent 数据库课程设计材料

作者：李晴；学号：202400702062；专业：数据科学与大数据技术；年级：2024级；学校：深圳技术大学。

这份材料以现有小说创作项目为案例，规划 PostgreSQL 数据库。它是课程设计和独立 SQL 实验成果，不是已经接入应用的数据库改造。没有修改当前 Prisma schema、SQLite 数据或业务接口。

## 成果

| 文件 | 内容 |
| --- | --- |
| `NovelAgent数据库设计报告_李晴_202400702062.docx` | 25 页报告，含个人信息、需求、ER 图、关系模式、范式分析、15 表 133 字段字典、事务、查询、测试及部署规划 |
| `sql/01_schema.sql` | 15 表、外键、CHECK、唯一性、索引、视图、触发器和正文保存函数 |
| `sql/02_seed.sql` | 虚构教学数据，密码和密文均为不可用于生产的占位内容 |
| `sql/03_queries.sql` | 10 个可执行查询示例 |
| `assets/er-overview.png` | 报告中的主干 ER 图 |
| `assets/er-relations.mmd` | 可编辑的 Mermaid 关系源码，展开额外交叉联系 |
| `assets/save-flow.png` | 正文保存责任与数据流示意 |
| `schema-metadata.json` | 生成 SQL 和字典使用的共同字段元数据 |
| `validation-results.json` | 45 项实际 SQL 验证结果及执行引擎信息 |
| `windows-layout-check.json` | Windows Word 字体和布局检查记录，包括 25 页逐页检查及 10 项自动检查 |
| `tools/` | 可复用的建模生成、验证、Word 构建和排版检查工具 |

## 按数据库课程推进

若老师尚未提供统一模板，可按以下顺序完成和讲解；具体页眉、封面、命名与评分项以课程要求为准。

| 阶段 | 学习与设计任务 | 本材料对应内容 |
| --- | --- | --- |
| 第一阶段 | 明确系统边界、用户角色、业务规则，画 ER 图 | 报告第一至二部分 |
| 第二阶段 | 转换关系模式，找候选键和函数依赖，讨论范式 | 报告第三至五部分 |
| 第三阶段 | 建表、建立约束和索引，写连接、分组与子查询 | SQL 脚本与报告第六至七部分 |
| 第四阶段 | 用反例验证约束，解释事务、恢复和局限 | 报告第八至十部分与验证记录 |

建议先理解三条核心论证：为什么角色别名拆表；为什么需要同小说复合外键；为什么正文保存要比较客户端版本。报告明确说明，物理模式为复合外键保留的部分归属信息是可控冗余，不能仅凭存在主键就声称所有关系严格满足第三范式。

## 在 PostgreSQL 中运行

需要已安装 PostgreSQL 16 或以上版本的服务器和 `psql`。请使用空的专用练习数据库，例如 `novel_agent_course`，不要使用应用生产库。本脚本只初始化一次，不会先删除同名 schema；再次执行会报已存在，便于避免意外覆盖数据。

在仓库根目录的 PowerShell 执行，密码按 psql 提示输入：

```powershell
psql -h localhost -U postgres -d novel_agent_course -v ON_ERROR_STOP=1 -f docs/database-design/sql/01_schema.sql
psql -h localhost -U postgres -d novel_agent_course -v ON_ERROR_STOP=1 -f docs/database-design/sql/02_seed.sql
psql -h localhost -U postgres -d novel_agent_course -v ON_ERROR_STOP=1 -f docs/database-design/sql/03_queries.sql
```

全部业务对象位于 `novel_agent` schema，查询前可执行 `SET search_path TO novel_agent, public;`。使用 pgAdmin 等图形工具时，也按相同顺序执行三个文件。

## 重放自动验证

本次使用 PGlite 0.5.11 内嵌 PostgreSQL 18.6 在内存中验证，而非独立 PostgreSQL 16 服务器。验证器每次创建新的内存库，检查 35 项建模与操作场景及 10 个查询；不会连接或修改任何已存在的数据库。

若需在本机重放，可将测试依赖单独安装在临时目录，不修改应用的 package.json：

```powershell
$courseRuntime = Join-Path $env:TEMP 'novel-agent-course-runtime'
npm install --prefix $courseRuntime @electric-sql/pglite@0.5.11 --no-audit --no-fund
$env:PGLITE_MODULE = Join-Path $courseRuntime 'node_modules/@electric-sql/pglite'
node docs/database-design/tools/verify_sql.cjs
```

输出应为 `total: 45`、`passed: 45`、`failed: 0`。工具会重新生成示例数据和验证记录，但不会执行实际模型调用、加密算法或服务器级并发测试。真正部署前仍需验证连接池、权限、网络、备份恢复与应用集成。

## 重新生成报告

`tools/generate_schema.cjs` 内维护实体、字段与约束，生成 `01_schema.sql` 和 `schema-metadata.json`。验证后，再运行 Word 构建器，顺序如下：

```powershell
node docs/database-design/tools/generate_schema.cjs
node docs/database-design/tools/verify_sql.cjs
py docs/database-design/tools/build_report.py
```

Word 构建需 Python、python-docx、Pillow，以及 Windows 已安装的宋体、黑体、微软雅黑。PDF 字体检查另需 pdfplumber。此环境未提供系统 `py` 启动器，制作时仅在任务 PowerShell 中把 `py` 别名指向应用打包的 Python；没有改系统设置。其他电脑请使用自己的 `py` 环境。

最终 Word 已用本机 Microsoft Word 渲染为 25 页，并检查全部页面。因本机未安装 LibreOffice，排版检查使用 `export_word_pdf.ps1` 后台导出 PDF，再以 `render_from_word_pdf.py` 调用 documents 技能的渲染模块生成页面 PNG。PDF 和 PNG 仅用于内部排版检查，不作为必须提交的作业成果。

### Windows 中文排版要求

2026年10月25日重新修复了 Word 报告的字体设置。正文使用 11 磅宋体，表格使用 9.5 磅宋体，标题使用黑体、副标题使用微软雅黑；英文、数字与 SQL 分别设置 Times New Roman、Arial 或 Consolas。文档在文字片段、段落标记、默认样式、表格条件样式、页眉页脚中均明确指定东亚字体，并清除冲突的主题字体引用。

表格行允许自动增高，中文段落关闭文档网格对齐，不使用固定行高或浮动文本框来堆叠正文。图中文字沿用已检查的微软雅黑图像；数据库设计正文与原报告一致。

`tools/windows_word.py` 已接入报告构建器，之后重新生成也会应用上述设置；也可只修复现有报告的字体与行距：

```powershell
py docs/database-design/tools/windows_word.py 'docs/database-design/NovelAgent数据库设计报告_李晴_202400702062.docx'
py docs/database-design/tools/verify_windows_doc.py 'docs/database-design/NovelAgent数据库设计报告_李晴_202400702062.docx'
```

字体引用使用 Windows 字体名及字体表声明，不嵌入或分发商业字体。此次已确认本机安装三种中文字体，Microsoft Word 实际渲染也使用这些字体。全部 25 页已逐页检查，未发现乱码、文字重叠、表格裁切或分页错位；文档及渲染结果的 10 项自动检查全部通过。检查其他环境时仍需实际打开并渲染，不能只凭字体名称判断兼容性。

## 已验证和未验证

已验证：完整建表、教学数据、自动正文快照、空小说字数、唯一与 CHECK、同小说外键、跨用户配置引用、请求幂等、过期或缺失版本、越权保存、旧版恢复、延迟排序、回滚和删除行为，以及 10 个 SQL 查询。

未验证：独立 PostgreSQL 16 实例、多连接真实并发、生产性能、数据迁移全量过程、真实加密与主密钥轮换、用户登录集成、实际模型调用、备份恢复。报告中的容量和恢复目标为规划假设，不是实测结果。
