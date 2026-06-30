import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Check, Clock, Filter, BookOpen, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useNovelStore } from '@/stores/novelStore';
import { cn } from '@/lib/utils';
import type { PlotCard as PlotCardType } from '@/types';

interface ChapterOutlineProps {
  onEditCard: (card: PlotCardType) => void;
  onCreateCard: () => void;
  onCreateVolume?: () => void;
  onEditVolume?: (volume: PlotCardType) => void;
}

const statusConfig = {
  pending: { label: '待写作', icon: Clock, color: 'bg-slate-100 text-slate-600 border-slate-200' },
  completed: { label: '已完成', icon: Check, color: 'bg-green-100 text-green-700 border-green-200' },
};

type StatusFilter = 'all' | 'pending' | 'completed';

export function ChapterOutline({ onEditCard, onCreateCard, onCreateVolume, onEditVolume }: ChapterOutlineProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [deleteVolume, setDeleteVolume] = useState<PlotCardType | null>(null);
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set());

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const allPlotCards = useNovelStore((state) => state.plotCards);
  const allChapters = useNovelStore((state) => state.chapters);
  const updatePlotCard = useNovelStore((state) => state.updatePlotCard);
  const deletePlotCard = useNovelStore((state) => state.deletePlotCard);
  const setCurrentChapter = useNovelStore((state) => state.setCurrentChapter);

  // 获取卷和章节大纲
  const volumes = useMemo(() => {
    if (!currentNovelId) return [];
    return allPlotCards
      .filter((card) => card.novelId === currentNovelId && card.type === 'volume')
      .sort((a, b) => a.sequence - b.sequence);
  }, [allPlotCards, currentNovelId]);

  const chapterOutlines = useMemo(() => {
    if (!currentNovelId) return [];
    return allPlotCards
      .filter((card) => card.novelId === currentNovelId && card.type === 'chapter')
      .sort((a, b) => a.sequence - b.sequence);
  }, [allPlotCards, currentNovelId]);

  // 根据筛选条件过滤章节大纲
  const filteredCards = useMemo(() => {
    if (statusFilter === 'all') return chapterOutlines;
    return chapterOutlines.filter((card) => card.status === statusFilter);
  }, [chapterOutlines, statusFilter]);

  const chapters = useMemo(() => {
    if (!currentNovelId) return [];
    return allChapters
      .filter((c) => c.novelId === currentNovelId)
      .sort((a, b) => a.sequence - b.sequence);
  }, [allChapters, currentNovelId]);

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex || statusFilter !== 'all') {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newCards = [...chapterOutlines];
    const [draggedCard] = newCards.splice(draggedIndex, 1);
    newCards.splice(dropIndex, 0, draggedCard);

    newCards.forEach((card, index) => {
      if (card.sequence !== index) {
        updatePlotCard(card.id, { sequence: index });
      }
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDeleteCard = (id: string) => {
    if (confirm('确定要删除这个大纲吗？')) {
      deletePlotCard(id);
    }
  };

  // 删除卷
  const handleDeleteVolume = (volume: PlotCardType) => {
    setDeleteVolume(volume);
  };

  const confirmDeleteVolume = () => {
    if (!deleteVolume) return;
    const volChapters = chapterOutlines.filter(c => c.volumeId === deleteVolume.id);
    // 删除卷下的所有章节大纲
    volChapters.forEach(ch => deletePlotCard(ch.id));
    // 删除卷
    deletePlotCard(deleteVolume.id);
    setDeleteVolume(null);
  };

  // 切换卷的收缩状态
  const toggleVolumeCollapse = (volumeId: string) => {
    setCollapsedVolumes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(volumeId)) {
        newSet.delete(volumeId);
      } else {
        newSet.add(volumeId);
      }
      return newSet;
    });
  };

  const handleJumpToChapter = (chapterId: string) => {
    setCurrentChapter(chapterId);
    useNovelStore.getState().setCurrentView('chapters');
  };

  // 统计数据
  const stats = {
    total: chapterOutlines.length,
    pending: chapterOutlines.filter((c) => c.status === 'pending').length,
    completed: chapterOutlines.filter((c) => c.status === 'completed').length,
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-4xl mx-auto">
        {/* 操作按钮区 */}
        <div className="flex items-center justify-end mb-4 gap-2">
          {onCreateVolume && (
            <button
              onClick={onCreateVolume}
              className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-muted"
            >
              <BookOpen className="h-4 w-4" />
              新建卷
            </button>
          )}
          <button
            onClick={onCreateCard}
            className="flex items-center gap-2 px-4 py-2 border rounded-md text-sm hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            新建章节大纲
          </button>
        </div>

        {/* 状态筛选 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'p-3 rounded-lg border transition-all text-left',
              statusFilter === 'all'
                ? 'bg-primary/10 border-primary ring-2 ring-primary/20'
                : 'bg-muted/50 hover:bg-muted'
            )}
          >
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">全部</div>
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={cn(
              'p-3 rounded-lg border transition-all text-left',
              statusFilter === 'pending'
                ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400/20 dark:bg-slate-900'
                : 'bg-muted/50 hover:bg-muted'
            )}
          >
            <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">待写作</div>
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={cn(
              'p-3 rounded-lg border transition-all text-left',
              statusFilter === 'completed'
                ? 'bg-green-100 border-green-400 ring-2 ring-green-400/20 dark:bg-green-900'
                : 'bg-muted/50 hover:bg-muted'
            )}
          >
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">已完成</div>
          </button>
        </div>

        {/* Filter indicator */}
        {statusFilter !== 'all' && (
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>正在筛选：{statusConfig[statusFilter].label}</span>
            <button onClick={() => setStatusFilter('all')} className="text-primary hover:underline">
              显示全部
            </button>
          </div>
        )}

        {/* 卷分组显示 */}
        {volumes.length > 0 && statusFilter === 'all' ? (
          // 按卷分组显示
          <div className="space-y-4">
            {volumes.map((vol) => {
              const volChapters = chapterOutlines.filter(c => c.volumeId === vol.id);
              const isCollapsed = collapsedVolumes.has(vol.id);
              return (
                <div key={vol.id} className="border rounded-lg overflow-hidden">
                  {/* 卷标题 - 可点击收缩 */}
                  <div
                    className="bg-muted/30 p-3 border-b group/vol cursor-pointer select-none"
                    onClick={() => toggleVolumeCollapse(vol.id)}
                  >
                    <div className="flex items-center gap-3">
                      {/* 收缩图标 */}
                      {isCollapsed ? (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{vol.title}</h3>
                        {vol.summary && !isCollapsed && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{vol.summary}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{volChapters.length} 章</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover/vol:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {onEditVolume && (
                          <button onClick={() => onEditVolume(vol)} className="p-1 hover:bg-muted rounded">
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </button>
                        )}
                        <button onClick={() => handleDeleteVolume(vol)} className="p-1 hover:bg-muted rounded">
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* 章节列表 - 收缩时隐藏 */}
                  {!isCollapsed && (
                    <div className="divide-y">
                      {volChapters.map((card, idx) => {
                        const StatusIcon = statusConfig[card.status].icon;

                        return (
                          <div
                            key={card.id}
                            className="group p-3 hover:bg-muted/30 flex items-start gap-3"
                          >
                            <span className="text-sm font-bold text-muted-foreground w-8">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium truncate">{card.title}</h4>
                                <span className={cn(
                                  'text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0',
                                  statusConfig[card.status].color
                                )}>
                                  <StatusIcon className="h-3 w-3" />
                                  {statusConfig[card.status].label}
                                </span>
                              </div>
                              {card.summary && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{card.summary}</p>
                              )}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => onEditCard(card)} className="p-1 hover:bg-muted rounded">
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </button>
                              <button onClick={() => handleDeleteCard(card.id)} className="p-1 hover:bg-muted rounded">
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {volChapters.length === 0 && (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          该卷暂无章节大纲
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {/* 未分卷的章节 */}
            {(() => {
              const unassigned = chapterOutlines.filter(c => !c.volumeId);
              if (unassigned.length === 0) return null;
              return (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 p-3 border-b">
                    <h3 className="font-medium">未分卷</h3>
                    <p className="text-xs text-muted-foreground">{unassigned.length} 章</p>
                  </div>
                  <div className="divide-y">
                    {unassigned.map((card, idx) => {
                      const StatusIcon = statusConfig[card.status].icon;
                      return (
                        <div key={card.id} className="group p-3 hover:bg-muted/30 flex items-start gap-3">
                          <span className="text-sm font-bold text-muted-foreground w-8">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium truncate">{card.title}</h4>
                              <span className={cn(
                                'text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0',
                                statusConfig[card.status].color
                              )}>
                                <StatusIcon className="h-3 w-3" />
                                {statusConfig[card.status].label}
                              </span>
                            </div>
                            {card.summary && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{card.summary}</p>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                            <button onClick={() => onEditCard(card)} className="p-1 hover:bg-muted rounded">
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDeleteCard(card.id)} className="p-1 hover:bg-muted rounded">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          // 平铺显示（筛选模式或无卷）
          <div className="space-y-3">
            {filteredCards.map((card) => {
              const originalIndex = chapterOutlines.findIndex(c => c.id === card.id);
              const StatusIcon = statusConfig[card.status].icon;
              const linkedChapter = card.chapterId
                ? chapters.find((c) => c.id === card.chapterId)
                : null;

              return (
                <div
                  key={card.id}
                  draggable={statusFilter === 'all'}
                  onDragStart={(e) => handleDragStart(e, originalIndex)}
                  onDragOver={(e) => handleDragOver(e, originalIndex)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, originalIndex)}
                  className={cn(
                    'group bg-card border rounded-lg p-4 shadow-sm hover:shadow-md transition-all',
                    statusFilter === 'all' && 'cursor-grab active:cursor-grabbing',
                    draggedIndex === originalIndex && 'opacity-50 scale-[0.98]',
                    dragOverIndex === originalIndex && draggedIndex !== originalIndex && 'border-primary border-2'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-8">{originalIndex + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium truncate">{card.title}</h3>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0',
                          statusConfig[card.status].color
                        )}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig[card.status].label}
                        </span>
                      </div>
                      {card.summary && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{card.summary}</p>
                      )}
                      {linkedChapter && (
                        <button
                          onClick={() => handleJumpToChapter(linkedChapter.id)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          已关联：{linkedChapter.title}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => onEditCard(card)} className="p-2 hover:bg-muted rounded-md">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDeleteCard(card.id)} className="p-2 hover:bg-muted rounded-md">
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {filteredCards.length === 0 && volumes.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">
              {statusFilter === 'all' ? '暂无大纲' : `暂无"${statusConfig[statusFilter].label}"的章节`}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              建议先创建卷，再添加章节大纲
            </p>
            {statusFilter === 'all' && (
              <div className="flex gap-2 justify-center">
                {onCreateVolume && (
                  <button onClick={onCreateVolume} className="px-4 py-2 border rounded-md text-sm">
                    新建卷
                  </button>
                )}
                <button onClick={onCreateCard} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
                  新建章节大纲
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 删除卷确认弹窗 */}
      {deleteVolume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <h3 className="text-lg font-semibold">删除卷</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              确定要删除卷「{deleteVolume.title}」吗？
            </p>
            {chapterOutlines.filter(c => c.volumeId === deleteVolume.id).length > 0 && (
              <p className="text-sm text-destructive mb-4">
                该卷下有 {chapterOutlines.filter(c => c.volumeId === deleteVolume.id).length} 个章节大纲，删除卷将同时删除这些章节大纲，此操作不可撤销。
              </p>
            )}
            {chapterOutlines.filter(c => c.volumeId === deleteVolume.id).length === 0 && (
              <p className="text-sm text-muted-foreground mb-4">此操作不可撤销。</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteVolume(null)}
                className="px-4 py-2 border rounded-md text-sm hover:bg-muted"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteVolume}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm hover:bg-destructive/90"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}