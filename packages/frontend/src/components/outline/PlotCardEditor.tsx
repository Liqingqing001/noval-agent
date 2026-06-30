import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNovelStore } from '@/stores/novelStore';
import type { PlotCard } from '@/types';

interface PlotCardEditorProps {
  card: PlotCard | null;
  defaultType?: 'volume' | 'chapter';
  defaultVolumeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Omit<PlotCard, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export function PlotCardEditor({
  card,
  defaultType = 'chapter',
  defaultVolumeId,
  open,
  onOpenChange,
  onSave,
}: PlotCardEditorProps) {
  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const allChapters = useNovelStore((state) => state.chapters);
  const allPlotCards = useNovelStore((state) => state.plotCards);
  const updatePlotCard = useNovelStore((state) => state.updatePlotCard);

  const chapters = useMemo(() => {
    if (!currentNovelId) return [];
    return allChapters
      .filter((c) => c.novelId === currentNovelId)
      .sort((a, b) => a.sequence - b.sequence);
  }, [allChapters, currentNovelId]);

  const plotCards = useMemo(() => {
    if (!currentNovelId) return [];
    return allPlotCards.filter((c) => c.novelId === currentNovelId);
  }, [allPlotCards, currentNovelId]);

  const volumes = useMemo(() => {
    return plotCards.filter(c => c.type === 'volume').sort((a, b) => a.sequence - b.sequence);
  }, [plotCards]);

  const [type, setType] = useState<'volume' | 'chapter'>(defaultType);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [volumeId, setVolumeId] = useState<string>('');
  const [chapterId, setChapterId] = useState<string>('');

  useEffect(() => {
    if (card) {
      setType(card.type);
      setTitle(card.title);
      setSummary(card.summary);
      setVolumeId(card.volumeId || '');
      setChapterId(card.chapterId || '');
    } else {
      setType(defaultType);
      setTitle('');
      setSummary('');
      setVolumeId(defaultVolumeId || '');
      setChapterId('');
    }
  }, [card, open, defaultType, defaultVolumeId]);

  const handleSave = () => {
    if (!title.trim()) {
      alert('请输入标题');
      return;
    }

    // 计算序号
    let sequence = card ? card.sequence : 0;
    if (!card) {
      if (type === 'volume') {
        sequence = volumes.length;
      } else {
        const volumeChapters = plotCards.filter(c => c.type === 'chapter' && c.volumeId === (volumeId || null));
        sequence = volumeChapters.length;
      }
    }

    const data: Omit<PlotCard, 'id' | 'createdAt' | 'updatedAt'> = {
      novelId: currentNovelId!,
      type,
      title: title.trim(),
      summary: summary.trim(),
      sequence,
      volumeId: type === 'chapter' ? (volumeId || undefined) : undefined,
      chapterId: type === 'chapter' ? (chapterId || undefined) : undefined,
      status: card?.status || 'pending',
    };

    if (card?.id) {
      updatePlotCard(card.id, data);
    } else {
      onSave(data);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={type === 'volume' ? 'sm:max-w-xl' : 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle>
            {card?.id ? (type === 'volume' ? '编辑卷' : '编辑章节大纲') : type === 'volume' ? '新建卷' : '新建章节大纲'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Type Selection (only for new) */}
          {!card?.id && (
            <div className="space-y-2">
              <label className="text-sm font-medium">类型</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType('volume')}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                    type === 'volume'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  📚 卷
                </button>
                <button
                  type="button"
                  onClick={() => setType('chapter')}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                    type === 'chapter'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  📝 章节大纲
                </button>
              </div>
            </div>
          )}

          {/* Volume Selection (for chapters) */}
          {type === 'chapter' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">所属卷</label>
              <select
                value={volumeId}
                onChange={(e) => setVolumeId(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">未分卷（独立章节）</option>
                {volumes.map((vol) => (
                  <option key={vol.id} value={vol.id}>
                    {vol.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {type === 'volume' ? '卷标题 *' : '章节标题 *'}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'volume' ? '例如：第一卷 赵家村篇' : '例如：第一章 觉醒'}
              autoFocus
            />
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {type === 'volume' ? '卷情节概要' : '章节情节详情'}
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={type === 'volume' ? '描述这一卷的主要情节...' : '描述这一章的情节内容...'}
              className={`w-full px-3 py-2 text-sm border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring ${
                type === 'volume' ? 'min-h-[180px]' : 'min-h-[120px]'
              }`}
            />
          </div>

          {/* Link to Chapter (only for chapters) */}
          {type === 'chapter' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">关联已写章节</label>
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">暂不关联</option>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    第{chapter.sequence}章：{chapter.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>
            {card?.id ? '保存' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
