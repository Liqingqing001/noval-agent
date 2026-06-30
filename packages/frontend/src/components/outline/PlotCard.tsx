import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Link } from 'lucide-react';
import type { PlotCard as PlotCardType, Chapter } from '@/types';
import { cn } from '@/lib/utils';

interface PlotCardProps {
  card: PlotCardType;
  chapters: Chapter[];
  onEdit: (card: PlotCardType) => void;
  onDelete: (id: string) => void;
}

const statusConfig = {
  pending: { label: '待写作', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
};

export function PlotCard({ card, chapters, onEdit, onDelete }: PlotCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const linkedChapter = card.chapterId
    ? chapters.find((c) => c.id === card.chapterId)
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary'
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate flex-1">{card.title || '未命名情节点'}</h4>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', statusConfig[card.status].color)}>
              {statusConfig[card.status].label}
            </span>
          </div>

          {card.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {card.summary}
            </p>
          )}

          {linkedChapter && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link className="h-3 w-3" />
              <span className="truncate">{linkedChapter.title}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(card)}
            className="p-1 hover:bg-muted rounded"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="p-1 hover:bg-muted rounded"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>
    </div>
  );
}
