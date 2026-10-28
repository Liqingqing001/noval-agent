import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import HardBreak from '@tiptap/extension-hard-break';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Quote, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useNovelStore } from '@/stores/novelStore';
import { toEditorHtml } from '@/lib/textModification';

interface ChapterEditorProps {
  chapterId: string;
}

export function ChapterEditor({ chapterId }: ChapterEditorProps) {
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

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
      Underline,
      Placeholder.configure({
        placeholder: '开始创作您的章节内容...',
      }),
    ],
    content: '',
    immediatelyRender: false,
  });

  // External changes invalidate any delayed save of an older editor snapshot.
  useEffect(() => {
    if (!chapter || !editor) return;
    const loaded = loadedChapterRef.current;
    if (loaded?.id === chapter.id && loaded.content === chapter.content) return;
    loadedChapterRef.current = { id: chapter.id, content: chapter.content };
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setIsSaving(false);
    const contentToSet = toEditorHtml(chapter.content || '');
    if (editor.getHTML() !== contentToSet) editor.commands.setContent(contentToSet, { emitUpdate: false });
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

    // 防抖保存
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      updateChapter(chapterId, {
        content: html,
        wordCount: count,
      });
      setIsSaving(false);
    }, 500);
  }, [editor, chapter, chapterId, updateChapter]);

  // 监听编辑器更新
  useEffect(() => {
    if (!editor) return;

    editor.on('update', handleContentUpdate);

    return () => {
      editor.off('update', handleContentUpdate);
    };
  }, [editor, handleContentUpdate]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!chapter) {
    return (
      <div className="flex items-center justify-center h-full text-green-600 dark:text-green-400">
        章节不存在
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white/80 dark:bg-background/80">
      {/* Toolbar - 绿色主题 */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-green-100 dark:border-green-900 bg-white/90 dark:bg-background/90 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('bold') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          title="粗体 (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('italic') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          title="斜体 (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('underline') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          title="下划线 (Ctrl+U)"
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
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={editor?.isActive('orderedList') ? 'bg-muted' : ''}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          title="有序列表"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-lg transition-colors ${editor?.isActive('blockquote') ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'hover:bg-green-50 dark:hover:bg-green-900/30'}`}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          title="引用"
        >
          <Quote className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1 bg-green-200 dark:bg-green-800" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-40"
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          title="撤销 (Ctrl+Z)"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-40"
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          title="重做 (Ctrl+Y)"
        >
          <Redo className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <span className={`text-xs font-medium ${isSaving ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
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
            className="w-full text-2xl font-semibold leading-relaxed bg-transparent border-none outline-none placeholder:text-muted-foreground/60 mb-8 text-foreground"
          />

          {/* Editor */}
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none focus:outline-none min-h-[400px]
              [&_.ProseMirror]:outline-none
              [&_.ProseMirror]:text-base
              [&_.ProseMirror]:leading-relaxed
              [&_.ProseMirror_p]:mb-4
              [&_.ProseMirror_p]:text-green-900/90
              [&_.ProseMirror_ul]:list-disc
              [&_.ProseMirror_ul]:pl-6
              [&_.ProseMirror_ul]:mb-4
              [&_.ProseMirror_ol]:list-decimal
              [&_.ProseMirror_ol]:pl-6
              [&_.ProseMirror_ol]:mb-4
              [&_.ProseMirror_li]:mb-1
              [&_.ProseMirror_blockquote]:border-l-4
              [&_.ProseMirror_blockquote]:border-green-400
              [&_.ProseMirror_blockquote]:pl-4
              [&_.ProseMirror_blockquote]:italic
              [&_.ProseMirror_blockquote]:text-green-700
              [&_.ProseMirror_blockquote]:mb-4
              [&_.ProseMirror-focused]:outline-none
              [&_.ProseMirror_h1]:text-xl
              [&_.ProseMirror_h2]:text-lg
              [&_.ProseMirror_h3]:text-base
              dark:[&_.ProseMirror_p]:text-green-100/90
              dark:[&_.ProseMirror_blockquote]:border-green-600
              dark:[&_.ProseMirror_blockquote]:text-green-300"
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
