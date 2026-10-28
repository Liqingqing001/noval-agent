import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import HardBreak from '@tiptap/extension-hard-break';
import { closeHistory } from '@tiptap/pm/history';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Quote, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useNovelStore } from '@/stores/novelStore';
import { toEditorHtml } from '@/lib/textModification';
import { compactEditorDocument, EDITOR_PREFERENCES_KEY, readEditorPreferences } from '@/lib/editorPreferences';
import { FLUSH_EDITOR_EVENT } from '@/lib/editorEvents';
import { EditorPreferences } from './EditorPreferences';
import type { CSSProperties } from 'react';
import './editor.css';

interface ChapterEditorProps {
  chapterId: string;
}

export function ChapterEditor({ chapterId }: ChapterEditorProps) {
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState(readEditorPreferences);
  const pendingSaveRef = useRef<{ chapterId: string; content: string; wordCount: number; baseContent: string } | null>(null);

  // 使用 ref 跟踪上次保存的内容，避免循环更新
  const lastSavedContentRef = useRef('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedChapterRef = useRef<{ id: string; content: string } | null>(null);

  const allChapters = useNovelStore((state) => state.chapters);
  const updateChapter = useNovelStore((state) => state.updateChapter);

  // 使用 useMemo 避免无限循环
  const chapter = useMemo(() => allChapters.find((c) => c.id === chapterId), [allChapters, chapterId]);

  // 直接从 chapter 获取标题，确保与章节列表同步
  const title = chapter?.title || '';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        hardBreak: false,
      }),
      HardBreak,
      Placeholder.configure({
        placeholder: '开始创作您的章节内容...',
      }),
    ],
    content: '',
    immediatelyRender: false,
  });
  const toolbar = useEditorState({ editor, selector: ({ editor: current }) => ({ bold: current?.isActive('bold'), italic: current?.isActive('italic'), underline: current?.isActive('underline'), bullet: current?.isActive('bulletList'), ordered: current?.isActive('orderedList'), quote: current?.isActive('blockquote'), undo: current?.can().undo(), redo: current?.can().redo() }) });

  useEffect(() => {
    try { localStorage.setItem(EDITOR_PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Display remains usable when browser storage is unavailable. */ }
  }, [preferences]);

  const flushPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) {
      const latest = useNovelStore.getState().chapters.find(item => item.id === pending.chapterId);
      if (latest?.content === pending.baseContent) {
        loadedChapterRef.current = { id: pending.chapterId, content: pending.content };
        updateChapter(pending.chapterId, { content: pending.content, wordCount: pending.wordCount });
      }
    }
    setIsSaving(false);
  }, [updateChapter]);

  // External changes invalidate any delayed save of an older editor snapshot.
  useEffect(() => {
    if (!chapter || !editor) return;
    const loaded = loadedChapterRef.current;
    if (loaded?.id === chapter.id && loaded.content === chapter.content) return;
    loadedChapterRef.current = { id: chapter.id, content: chapter.content };
    pendingSaveRef.current = null;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setIsSaving(false);
    const contentToSet = toEditorHtml(chapter.content || '');
    if (editor.getHTML() !== contentToSet) editor.chain().setMeta('addToHistory', false).setContent(contentToSet, { emitUpdate: false }).run();
    lastSavedContentRef.current = editor.getHTML();
    setWordCount(chapter.wordCount);
  }, [chapter, editor]);

  // 处理标题变化 - 直接同步到 store
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // 焦点移到编辑器正文
      editor?.commands.focus();
    }
  }, [editor]);

  const handleTitleChange = useCallback((newTitle: string) => {
    if (chapter && newTitle.trim() && newTitle !== chapter.title) {
      updateChapter(chapterId, { title: newTitle.trim() });
    }
  }, [chapter, chapterId, updateChapter]);

  // 处理内容变化和保存
  const handleContentUpdate = useCallback(() => {
    if (!editor || !chapter) return;

    const html = editor.getHTML();
    const text = editor.getText();
    const count = text.length;

    setWordCount(count);

    // 检查内容是否真的改变了
    if (html === lastSavedContentRef.current) return;

    lastSavedContentRef.current = html;
    setIsSaving(true);

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const latest = useNovelStore.getState().chapters.find(item => item.id === chapterId);
    if (!latest) return;
    pendingSaveRef.current = { chapterId, content: html, wordCount: count, baseContent: latest.content };
    saveTimeoutRef.current = setTimeout(flushPendingSave, 500);
  }, [editor, chapter, chapterId, flushPendingSave]);

  // 监听编辑器更新
  useEffect(() => {
    if (!editor) return;

    editor.on('update', handleContentUpdate);

    return () => {
      editor.off('update', handleContentUpdate);
    };
  }, [editor, handleContentUpdate]);

  // Flush while switching chapters or leaving the editor; never replay an obsolete snapshot.
  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); flushPendingSave(); } };
    window.addEventListener(FLUSH_EDITOR_EVENT, flushPendingSave);
    window.addEventListener('beforeunload', flushPendingSave);
    document.addEventListener('keydown', saveShortcut);
    editor?.on('blur', flushPendingSave);
    return () => {
      window.removeEventListener(FLUSH_EDITOR_EVENT, flushPendingSave);
      window.removeEventListener('beforeunload', flushPendingSave);
      document.removeEventListener('keydown', saveShortcut);
      editor?.off('blur', flushPendingSave);
      flushPendingSave();
    };
  }, [chapterId, editor, flushPendingSave]);

  if (!chapter) {
    return (
      <div className="flex items-center justify-center h-full text-green-600 dark:text-green-400">
        章节不存在
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col h-full bg-white/80 dark:bg-background/80">
      {/* Toolbar - 绿色主题 */}
      <div className="editor-toolbar shrink-0 px-3 py-2 border-b border-green-100 dark:border-green-900 bg-white/90 dark:bg-background/90 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('bold') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="粗体 (Ctrl+B)"
          aria-label="粗体" aria-pressed={!!toolbar?.bold}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('italic') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          title="斜体 (Ctrl+I)"
          aria-label="斜体" aria-pressed={!!toolbar?.italic}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('underline') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          title="下划线 (Ctrl+U)"
          aria-label="下划线" aria-pressed={!!toolbar?.underline}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1 bg-green-200 dark:bg-green-800" />
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('bulletList') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          title="无序列表"
          aria-label="无序列表" aria-pressed={!!toolbar?.bullet}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={editor?.isActive('orderedList') ? 'bg-muted' : ''}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          title="有序列表"
          aria-label="有序列表" aria-pressed={!!toolbar?.ordered}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('blockquote') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          title="引用"
          aria-label="引用" aria-pressed={!!toolbar?.quote}
        >
          <Quote className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1 bg-green-200 dark:bg-green-800" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-40"
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!toolbar?.undo}
          title="撤销 (Ctrl+Z)"
          aria-label="撤销"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-40"
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!toolbar?.redo}
          title="重做 (Ctrl+Y)"
          aria-label="重做"
        >
          <Redo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={!editor} title="去掉多余的空白段落，可用 Ctrl+Z 撤销" onClick={() => {
          if (!editor) return;
          const current = editor.getJSON();
          const compact = compactEditorDocument(current);
          if (JSON.stringify(current) === JSON.stringify(compact)) return;
          editor.view.dispatch(closeHistory(editor.state.tr));
          editor.commands.setContent(compact, { emitUpdate: true });
          editor.view.dispatch(closeHistory(editor.state.tr));
        }}>整理空行</Button>
        <div className="min-w-1 flex-1" />
        <EditorPreferences value={preferences} onChange={setPreferences} />
        <span title="正文自动保存到本机，Ctrl+S 可立即保存" role="status" className={`whitespace-nowrap px-1 text-xs font-medium ${isSaving ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
          {isSaving ? '保存中...' : '已保存'}
        </span>
      </div>

      {/* Editor Content - 带渐变绿色背景 */}
      <div className="min-h-0 flex-1 overflow-y-auto manuscript-background px-4 scrollbar-thin">
        <div className="manuscript-page">
          {/* Chapter Title - 按回车会跳转到正文 */}
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="章节标题"
            className="w-full text-2xl font-semibold leading-relaxed bg-transparent border-none outline-none placeholder:text-muted-foreground/60 mb-4 text-foreground"
          />

          {/* Editor */}
          <EditorContent
            editor={editor}
            className="novel-editor"
            data-indent={preferences.firstLineIndent}
            style={{ '--manuscript-font-size': `${preferences.fontSize}px`, '--manuscript-line-height': preferences.lineHeight, '--manuscript-paragraph-gap': `${preferences.paragraphGap}px` } as CSSProperties}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-green-100 dark:border-green-900 bg-white/90 dark:bg-background/90 text-xs">
        <span className="font-medium text-green-700 dark:text-green-400">
          字数：<span className="text-green-600 dark:text-green-300">{wordCount.toLocaleString()}</span>
        </span>
        <span className="text-green-500/70 dark:text-green-400/70">
          最后编辑：{new Date(chapter.updatedAt).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
