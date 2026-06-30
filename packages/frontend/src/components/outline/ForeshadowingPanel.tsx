import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, CheckCircle, Circle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useNovelStore } from '@/stores/novelStore';
import type { Foreshadowing } from '@/types';

const statusConfig = {
  planted: { label: '已埋下', icon: Circle, color: 'text-blue-500' },
  hinted: { label: '已暗示', icon: Eye, color: 'text-amber-500' },
  resolved: { label: '已回收', icon: CheckCircle, color: 'text-green-500' },
};

export function ForeshadowingPanel() {
  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const allForeshadowings = useNovelStore((state) => state.foreshadowings);
  const allChapters = useNovelStore((state) => state.chapters);
  const addForeshadowing = useNovelStore((state) => state.addForeshadowing);
  const updateForeshadowing = useNovelStore((state) => state.updateForeshadowing);
  const deleteForeshadowing = useNovelStore((state) => state.deleteForeshadowing);

  // useMemo 避免无限循环
  const foreshadowings = useMemo(() => {
    if (!currentNovelId) return [];
    return allForeshadowings
      .filter((f) => f.novelId === currentNovelId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [allForeshadowings, currentNovelId]);

  const chapters = useMemo(() => {
    if (!currentNovelId) return [];
    return allChapters
      .filter((c) => c.novelId === currentNovelId)
      .sort((a, b) => a.sequence - b.sequence);
  }, [allChapters, currentNovelId]);

  const [editingForeshadowing, setEditingForeshadowing] = useState<Foreshadowing | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'planted' as Foreshadowing['status'],
    plantedChapterId: '',
    resolvedChapterId: '',
  });

  const handleOpenCreate = () => {
    setFormData({
      title: '',
      description: '',
      status: 'planted',
      plantedChapterId: '',
      resolvedChapterId: '',
    });
    setEditingForeshadowing(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (f: Foreshadowing) => {
    setFormData({
      title: f.title,
      description: f.description,
      status: f.status,
      plantedChapterId: f.plantedChapterId || '',
      resolvedChapterId: f.resolvedChapterId || '',
    });
    setEditingForeshadowing(f);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.title.trim()) {
      alert('请输入伏笔标题');
      return;
    }

    const data = {
      novelId: currentNovelId!,
      title: formData.title.trim(),
      description: formData.description.trim(),
      status: formData.status,
      plantedChapterId: formData.plantedChapterId || undefined,
      resolvedChapterId: formData.resolvedChapterId || undefined,
    };

    if (editingForeshadowing) {
      updateForeshadowing(editingForeshadowing.id, data);
    } else {
      addForeshadowing(data);
    }

    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个伏笔吗？')) {
      deleteForeshadowing(id);
    }
  };

  const getChapterTitle = (chapterId: string | undefined) => {
    if (!chapterId) return null;
    const chapter = chapters.find((c) => c.id === chapterId);
    return chapter ? `第${chapter.sequence}章：${chapter.title}` : null;
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">伏笔管理</h2>
            <p className="text-sm text-muted-foreground">
              追踪小说中的伏笔，确保每个伏笔都得到恰当的回收
            </p>
          </div>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            添加伏笔
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {foreshadowings.filter((f) => f.status === 'planted').length}
            </div>
            <div className="text-sm text-blue-600 dark:text-blue-400">已埋下</div>
          </div>
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {foreshadowings.filter((f) => f.status === 'hinted').length}
            </div>
            <div className="text-sm text-amber-600 dark:text-amber-400">已暗示</div>
          </div>
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {foreshadowings.filter((f) => f.status === 'resolved').length}
            </div>
            <div className="text-sm text-green-600 dark:text-green-400">已回收</div>
          </div>
        </div>

        {/* List */}
        {foreshadowings.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            暂无伏笔，点击上方按钮添加
          </div>
        ) : (
          <div className="space-y-3">
            {foreshadowings.map((f) => {
              const StatusIcon = statusConfig[f.status].icon;
              return (
                <div
                  key={f.id}
                  className="p-4 border rounded-lg hover:shadow-sm transition-shadow bg-card"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className={`h-4 w-4 ${statusConfig[f.status].color}`} />
                        <h3 className="font-medium truncate">{f.title}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          f.status === 'planted' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                          f.status === 'hinted' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' :
                          'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        }`}>
                          {statusConfig[f.status].label}
                        </span>
                      </div>
                      {f.description && (
                        <p className="text-sm text-muted-foreground mb-2">{f.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {f.plantedChapterId && (
                          <span>埋下：{getChapterTitle(f.plantedChapterId)}</span>
                        )}
                        {f.resolvedChapterId && (
                          <span>回收：{getChapterTitle(f.resolvedChapterId)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEdit(f)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(f.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingForeshadowing ? '编辑伏笔' : '添加伏笔'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-medium">标题</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="伏笔名称"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="描述这个伏笔的内容..."
                  className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">状态</label>
                <div className="flex gap-2">
                  {Object.entries(statusConfig).map(([value, config]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormData({ ...formData, status: value as Foreshadowing['status'] })}
                      className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                        formData.status === value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted'
                      }`}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Planted Chapter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">埋下章节</label>
                <select
                  value={formData.plantedChapterId}
                  onChange={(e) => setFormData({ ...formData, plantedChapterId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">选择章节</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      第{chapter.sequence}章：{chapter.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Resolved Chapter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">回收章节</label>
                <select
                  value={formData.resolvedChapterId}
                  onChange={(e) => setFormData({ ...formData, resolvedChapterId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">选择章节</option>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      第{chapter.sequence}章：{chapter.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSave}>
                {editingForeshadowing ? '保存' : '添加'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
