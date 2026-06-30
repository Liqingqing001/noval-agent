import { useState, useMemo } from 'react';
import { FileText, GitBranch, Pencil, X, Check } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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
  const [editingNovelInfo, setEditingNovelInfo] = useState(false);
  const [editGenre, setEditGenre] = useState('');
  const [editSummary, setEditSummary] = useState('');

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const currentNovel = useNovelStore((state) => state.getCurrentNovel());
  const allPlotCards = useNovelStore((state) => state.plotCards);
  const addPlotCard = useNovelStore((state) => state.addPlotCard);
  const updateNovel = useNovelStore((state) => state.updateNovel);

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

  const handleEditVolume = (volume: PlotCardType) => {
    setCreateType('volume');
    setEditingCard(volume);
    setIsCreating(false);
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

  // 编辑小说信息
  const handleStartEditNovelInfo = () => {
    setEditGenre(currentNovel?.genre || '');
    setEditSummary(currentNovel?.summary || '');
    setEditingNovelInfo(true);
  };

  const handleSaveNovelInfo = () => {
    if (currentNovelId) {
      updateNovel(currentNovelId, {
        genre: editGenre.trim() || undefined,
        summary: editSummary.trim() || undefined,
      });
    }
    setEditingNovelInfo(false);
  };

  const handleCancelEditNovelInfo = () => {
    setEditingNovelInfo(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 小说信息区 - 可编辑 */}
      <div className="px-4 py-3 border-b bg-muted/20">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="font-semibold text-lg">{currentNovel?.title || '未命名小说'}</h2>

            {editingNovelInfo ? (
              // 编辑模式
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium">题材</label>
                  <input
                    type="text"
                    value={editGenre}
                    onChange={(e) => setEditGenre(e.target.value)}
                    placeholder="例如：都市奇幻、科幻、悬疑..."
                    className="w-full mt-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium">简介</label>
                  <textarea
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    placeholder="小说简介..."
                    rows={3}
                    className="w-full mt-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSaveNovelInfo}>
                    <Check className="h-3 w-3 mr-1" />
                    保存
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEditNovelInfo}>
                    <X className="h-3 w-3 mr-1" />
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              // 显示模式
              <div className="mt-1">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {currentNovel?.genre && <span>题材：{currentNovel.genre}</span>}
                  <span>共 {stats.volumes} 卷，{stats.chapters} 章</span>
                  <span>已完成 {stats.completed} 章</span>
                </div>
                {currentNovel?.summary && (
                  <p className="text-sm text-muted-foreground mt-2">{currentNovel.summary}</p>
                )}
                {!currentNovel?.genre && !currentNovel?.summary && (
                  <p className="text-xs text-muted-foreground mt-2 italic">点击编辑添加题材和简介</p>
                )}
              </div>
            )}
          </div>

          {/* 编辑按钮 */}
          {!editingNovelInfo && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStartEditNovelInfo}
              className="text-muted-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center px-4 py-2 border-b bg-muted/30">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'chapters' && (
          <ChapterOutline
            onEditCard={setEditingCard}
            onCreateCard={handleCreateCard}
            onCreateVolume={handleCreateVolume}
            onEditVolume={handleEditVolume}
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