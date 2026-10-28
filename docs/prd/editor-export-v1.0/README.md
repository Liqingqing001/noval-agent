# 小说编辑与导出 V1.0

- [产品需求正文](requirements.md)
- [Windows Word 版 PRD](NovelAgent小说编辑与导出PRD_V1.0.docx)
- [字体 排版与功能验证记录](validation.json)

本版需求已同步实施：正常段落间距、本机排版偏好、可撤销的空行整理、编辑连续性，以及整本或当前章的 TXT、Markdown、DOCX 导出。详细变更见 [更新记录](../../updates/2026-10-28-editor-export.md)。

Word 文档采用 A4 页面，宋体正文、黑体标题、西文 Times New Roman，明确设置东亚和西文字体并移除主题字体引用。PRD 与应用导出样稿均使用本机 Microsoft Word 渲染，已逐页检查中文、页面边界、表格和分页。

维护时先修改 requirements.md，再生成 Word，保持两者一致。生成依赖 python-docx：

```powershell
py docs/prd/editor-export-v1.0/build_docx.py
```

渲染图片、PDF 中间文件、浏览器测试数据和下载样稿仅用于验证，不作为仓库维护源。
