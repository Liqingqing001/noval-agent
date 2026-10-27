# 参考作品分析与辅助创作产品需求

- [产品需求正文](content-analysis-creation-prd.md)：内容维护源，共 19 个章节，状态为待评审。
- [Word 评审文档](NovelAgent参考作品分析与辅助创作PRD_V1.0.docx)：对应同版正文，中文字体按 Windows Word 设置。
- [交付检查记录](validation.json)：结构、字体与替代渲染检查，以及未完成的 Microsoft Word 验证。

正文基于 NovelAgent 当前模块设计，涵盖书籍拆解、文章分析、文风卡、新稿生成、显式导入、任务恢复、数据权限、评测、成本及灰度发布。本次只提交文档，不实现产品功能。

重建依赖 Python 3、python-docx 与 pandoc。在仓库根目录运行：

```powershell
py docs/prd/build_docx.py
```

Linux 环境可使用 `python3 docs/prd/build_docx.py`。生成脚本不调用模型，不需要密钥。当前云环境无 PowerShell 和 Microsoft Word，采用 Python 3 构建及 LibreOffice 替代渲染；Windows Word 逐页检查仍待完成。PDF 与页面预览仅用于临时检查，不提交为维护源。
