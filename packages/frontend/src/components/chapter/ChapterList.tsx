import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Trash2, Edit3, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNovelStore } from '@/stores/novelStore';

interface ChapterListProps {
  onSelectChapter: (id: string) => void;
  selectedChapterId: string | null;
  width?: number;
}

const CHINESE_NUMBERS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function toChineseChapterNumber(num: number): string {
  if (num <= 0) return String(num);
  if (num < 10) return CHINESE_NUMBERS[num];
  if (num === 10) return '十';
  if (num < 20) return `十${CHINESE_NUMBERS[num % 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${CHINESE_NUMBERS[tens]}十${ones ? CHINESE_NUMBERS[ones] : ''}`;
  }
  return String(num);
}

function getChapterLabel(index: number): string {
  return `第${toChineseChapterNumber(index + 1)}章`;
}

export function ChapterList({ onSelectChapter, selectedChapterId, width = 288 }: ChapterListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const allChapters = useNovelStore((state) => state.chapters);
  const addChapter = useNovelStore((state) => state.addChapter);
  const updateChapter = useNovelStore((state) => state.updateChapter);
  const deleteChapter = useNovelStore((state) => state.deleteChapter);

  const chapters = useMemo(() => {
    if (!currentNovelId) return [];
    return allChapters.filter((c) => c.novelId === currentNovelId).sort((a, b) => a.sequence - b.sequence);
  }, [allChapters, currentNovelId]);

  useEffect(() => {
    if (isCreating && inputRef.current) inputRef.current.focus();
  }, [isCreating]);

  const handleCreateChapter = () => {
    if (currentNovelId && newChapterTitle.trim()) {
      const chapter = addChapter({
        novelId: currentNovelId,
        title: newChapterTitle.trim(),
        content: '',
        wordCount: 0,
        sequence: chapters.length,
      });
      setNewChapterTitle('');
      setIsCreating(false);
      onSelectChapter(chapter.id);
    } else {
      setIsCreating(false);
      setNewChapterTitle('');
    }
  };

  const handleUpdateTitle = (id: string) => {
    if (editTitle.trim()) updateChapter(id, { title: editTitle.trim() });
    setEditingId(null);
  };

  const handleDeleteChapter = (id: string) => {
    if (confirm('确定删除？')) {
      deleteChapter(id);
      if (selectedChapterId === id && chapters.length > 1) {
        onSelectChapter(chapters.filter(c => c.id !== id)[0].id);
      }
    }
  };

  if (!currentNovelId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        请先选择小说
      </div>
    );
  }

  return (
    <div
      className="chapter-directory flex h-full min-h-0 flex-col shrink-0 border-r border-border/60 bg-background"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg border border-border bg-background flex items-center justify-center">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div><h2 className="text-sm font-semibold">章节目录</h2><p className="mt-0.5 text-[11px] text-muted-foreground">共 {chapters.length} 章</p></div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="新建章节" title="新建章节" className="h-8 w-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          onClick={() => { setIsCreating(true); setNewChapterTitle(''); }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Chapter List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
        {chapters.map((chapter, index) => (
          <div key={chapter.id} className={`chapter-entry group relative rounded-lg border transition-colors ${selectedChapterId === chapter.id ? 'border-primary/20 bg-primary/[0.07]' : 'border-transparent hover:bg-muted/50'}`}>
            {editingId === chapter.id ? (
              <div className="p-3">
                <label className="mb-2 block text-[11px] text-muted-foreground">{getChapterLabel(index)} · 重命名</label>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateTitle(chapter.id); if (e.key === 'Escape') setEditingId(null); }}
                  onBlur={() => handleUpdateTitle(chapter.id)} autoFocus aria-label="章节标题"
                  className="w-full min-w-0 rounded-md border border-primary/40 bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            ) : (
              <>
                <button type="button" onClick={() => onSelectChapter(chapter.id)} aria-current={selectedChapterId === chapter.id ? 'page' : undefined}
                  className="block w-full rounded-lg px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className={selectedChapterId === chapter.id ? 'font-medium text-primary' : ''}>{getChapterLabel(index)}</span>
                    <span className="tabular-nums">{chapter.wordCount.toLocaleString()} 字</span>
                  </span>
                  <span className="block break-words pr-12 text-sm font-medium leading-6">{chapter.title}</span>
                </button>
                <div className="chapter-actions absolute bottom-3 right-2 flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md text-muted-foreground hover:text-primary" aria-label={`重命名章节：${chapter.title}`} title="重命名章节"
                    onClick={() => { setEditingId(chapter.id); setEditTitle(chapter.title); }}><Edit3 className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`删除章节：${chapter.title}`} title="删除章节"
                    onClick={() => handleDeleteChapter(chapter.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* 添加新章节 */}
        {isCreating && (
          <div className="p-4 rounded-xl bg-card border-2 border-dashed border-border animate-slide-up">
            <input
              ref={inputRef}
              type="text"
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateChapter();
                if (e.key === 'Escape') { setIsCreating(false); setNewChapterTitle(''); }
              }}
              onBlur={handleCreateChapter}
              placeholder="输入章节标题..."
              autoFocus
              className="w-full px-4 py-2.5 text-sm bg-background border-2 border-border rounded-xl input-creative"
            />
            <p className="text-xs text-muted-foreground mt-2">Enter 保存 · Esc 取消</p>
          </div>
        )}

        {/* 空状态 */}
        {chapters.length === 0 && !isCreating && (
          <div className="flex flex-col items-center justify-center py-12 animate-fade-scale">
            <div className="w-16 h-16 rounded-2xl border border-border bg-background flex items-center justify-center mb-3">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">暂无章节</p>
            <p className="text-xs text-muted-foreground mt-1">点击右上角 + 开始创作</p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="p-4 border-t border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary/60" />
            <span className="text-xs font-medium text-muted-foreground">
              共 {chapters.length} 章
            </span>
          </div>
          <span className="text-xs font-bold text-foreground">
            {chapters.reduce((acc, c) => acc + c.wordCount, 0).toLocaleString()} 字
          </span>
        </div>
      </div>
    </div>
  );
}