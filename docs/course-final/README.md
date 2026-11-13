> **版本提醒：课堂展示现有 GitHub Pages，请使用 [最新原系统版 PPT 与报告](../course-final-pages/README.md)。本目录是此前另建的四表课堂程序，已不作为本次汇报方案。**

# 数据库 Web 应用期末大作业 · NovelAgent 课程简化版

按本次上传任务书组织；为课堂演讲重新缩小范围，独立实现用户、小说、章节、人物四表，不替换原系统，不读取原系统账号或数据库。

## 先看交付文件

`deliverables/` 中包含：

- `01_实验报告.docx / .pdf`：16 页，需求、中文 ER、转表、24 字段字典、前后端设计、32 项检查、结果与结论。
- `02_答辩演示.pptx / .pdf`：12 页，已添加逐页备注讲稿。
- `03_讲稿与演示手册.docx / .pdf`：9 页，8 分钟节奏、现场点击步骤、常见问答与故障预案。

`source/` 是无第三方依赖的可运行课堂版；`assets/` 是真实运行截图、中文 ER 和架构图；`evidence/` 是实际测试结果；`tools/` 是复核与文档生成工具。

## 最短演示启动

先安装 Node.js 24 LTS，在 `source` 目录执行：

```powershell
node server.mjs --seed
```

浏览器打开 `http://127.0.0.1:4178`，登录 `demo@example.test` / `Demo2026!`。完整说明见 `source/README.md`。运行时新建 `source/data/course.db`，不会清理或覆盖原系统数据。

## 演讲怎么准备

先读《讲稿与演示手册》第一页，再跟第 6 页现场操作卡亲自做一次。第 9 张 PPT 暂停、切换浏览器演示。主线只讲：用户拥有小说，小说包含章节和人物；保存后刷新证明落库；删除小说解释外键级联。无需现场调用 AI。

封面姓名学号班级、PPT 汇报人、组员与实际分工留空，提交前自行核实填写。

## 数据库选择与验证边界

任务书推荐 MySQL，本交付实际是 SQLite 关系数据库，不是 MySQL / PostgreSQL。本机课堂使用省去数据库服务安装。若教师明确限定数据库品种，须迁移驱动和 DDL 并复测，不能直接把文档改成指定数据库名称。

32 个具体集成检查通过；测试框架另计父测试，汇总为 33。浏览器直接操作真实 HTTP 和隔离 SQLite，增改删、刷新回读通过。Word 文档显式设置宋体/黑体，PPT 设置微软雅黑；PDF 用 Linux LibreOffice 和 Noto CJK 替代字体逐页检查。未在 Windows Microsoft Word / PowerPoint 实机验证。PDF 可作为排版备用，不等同于 Windows 验证。

本任务只增加课程成果，不改变普通应用与 Pages 的创作代码，也不部署或发布站点。

## 重建材料（开发者可选）

Python 需 `python-docx`、`python-pptx`、`Pillow`、`lxml`，构图字体路径在 `tools/build_materials.py` 中；该脚本面向当前 Linux 生成环境，不是课堂程序的依赖。Windows 演示仅需 Node。

```powershell
node --test source/test.mjs
```

在相应字体环境运行生成工具可重建 Office 文档；`COURSE_OUTPUT_DIR` 可覆盖默认 `output/`。浏览器检查使用 `tools/browser-check.cjs`，需要额外 Playwright/Chromium；只对独立课堂测试库运行。不要将截图自动清理逻辑指向原系统。
