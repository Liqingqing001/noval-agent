import { useState, useMemo } from 'react';
import { Plus, FileText, GitBranch, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNovelStore } from '@/stores/novelStore';
import { ChapterOutline } from './ChapterOutline';
import { ForeshadowingPanel } from './ForeshadowingPanel';
import { PlotCardEditor } from './PlotCardEditor';
import type { PlotCard as PlotCardType } from '@/types';

type ViewMode = 'chapters' | 'foreshadowing';

export function OutlineView() {
  const [viewMode, setViewMode] = useState<ViewMode>('chapters');
  const [editingCard, setEditingCard] = useState<PlotCardType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createType, setCreateType] = useState<'volume' | 'chapter'>('chapter');

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const currentNovel = useNovelStore((state) => state.getCurrentNovel());
  const allPlotCards = useNovelStore((state) => state.plotCards);
  const addPlotCard = useNovelStore((state) => state.addPlotCard);

  // 统计数据
  const stats = useMemo(() => {
    if (!currentNovelId) return { volumes: 0, chapters: 0, completed: 0 };
    const cards = allPlotCards.filter(c => c.novelId === currentNovelId);
    return {
      volumes: cards.filter(c => c.type === 'volume').length,
      chapters: cards.filter(c => c.type === 'chapter').length,
      completed: cards.filter(c => c.type === 'chapter' && c.status === 'completed').length,
    };
  }, [allPlotCards, currentNovelId]);

  if (!currentNovelId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请先选择一本小说
      </div>
    );
  }

  const handleCreateCard = () => {
    setCreateType('chapter');
    setIsCreating(true);
    setEditingCard(null);
  };

  const handleCreateVolume = () => {
    setCreateType('volume');
    setIsCreating(true);
    setEditingCard(null);
  };

  const handleSaveCard = (data: Omit<PlotCardType, 'id' | 'createdAt' | 'updatedAt'>) => {
    addPlotCard(data);
    setEditingCard(null);
    setIsCreating(false);
  };

  const handleCloseEditor = () => {
    setEditingCard(null);
    setIsCreating(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 小说信息区 */}
      <div className="px-4 py-3 border-b bg-muted/20">
        <h2 className="font-semibold text-lg">{currentNovel?.title || '未命名小说'}</h2>
        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
          {currentNovel?.genre && <span>题材：{currentNovel.genre}</span>}
          <span>共 {stats.volumes} 卷，{stats.chapters} 章</span>
          <span>已完成 {stats.completed} 章</span>
        </div>
        {currentNovel?.summary && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{currentNovel.summary}</p>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-auto">
          <TabsList className="h-8">
            <TabsTrigger value="chapters" className="px-3 text-xs">
              <FileText className="h-3.5 w-3.5 mr-1" />
              章节大纲
            </TabsTrigger>
            <TabsTrigger value="foreshadowing" className="px-3 text-xs">
              <GitBranch className="h-3.5 w-3.5 mr-1" />
              伏笔管理
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {viewMode === 'chapters' && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleCreateVolume}>
              <BookOpen className="h-3.5 w-3.5 mr-1" />
              新建卷
            </Button>
            <Button size="sm" onClick={handleCreateCard}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              新建章节大纲
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'chapters' && (
          <ChapterOutline
            onEditCard={setEditingCard}
            onCreateCard={handleCreateCard}
            onCreateVolume={handleCreateVolume}
          />
        )}
        {viewMode === 'foreshadowing' && <ForeshadowingPanel />}
      </div>

      {/* Edit Dialog */}
      <PlotCardEditor
        card={isCreating ? null : editingCard}
        defaultType={createType}
        open={!!editingCard || isCreating}
        onOpenChange={(open) => {
          if (!open) handleCloseEditor();
        }}
        onSave={handleSaveCard}
      />
    </div>
  );
}