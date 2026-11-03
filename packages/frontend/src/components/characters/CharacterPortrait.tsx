import { useState } from 'react';
import { resolveCharacterPortrait } from '@/lib/characterProfiles';
import { ImagePreview } from '@/components/ui/ImagePreview';
import '@/styles/character-board.css';

export function CharacterPortrait({ avatar, name, className = '', previewable = false }: { avatar?: string; name: string; className?: string; previewable?: boolean }) {
  const portrait = resolveCharacterPortrait(avatar, import.meta.env.BASE_URL);
  const [failed, setFailed] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const fallback = Array.from(name.trim()).slice(0, 2).join('');
  if (!portrait || failed === portrait.src) return <span className={`character-avatar ${className}`} role="img" aria-label={`${name}人物头像`}>{fallback}</span>;
  const cell = portrait.cell;
  const style = cell ? {
    backgroundImage: `url(${JSON.stringify(portrait.src)})`,
    backgroundSize: `${cell.columns * 100}% ${cell.rows * 100}%`,
    backgroundPosition: `${cell.columns === 1 ? 0 : cell.index % cell.columns / (cell.columns - 1) * 100}% ${cell.rows === 1 ? 0 : Math.floor(cell.index / cell.columns) / (cell.rows - 1) * 100}%`,
    backgroundRepeat: 'no-repeat',
  } : undefined;
  const img = <img src={portrait.src} alt="" draggable={false} onError={() => setFailed(portrait.src)} style={cell ? { width: 0, height: 0, opacity: 0 } : undefined} />;
  if (!previewable) return <span className={`character-avatar ${className}`} role="img" aria-label={`${name}人物头像`} style={style}>{img}</span>;
  return <><button type="button" className={`character-avatar select-none cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`} style={style} aria-label={`预览${name}头像`} aria-haspopup="dialog" draggable={false} onPointerDown={event => event.stopPropagation()} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }} onClick={event => { event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); setPreviewOpen(true); }}><span role="img" aria-label={`${name}人物头像`} className="contents">{img}</span></button><ImagePreview open={previewOpen} onOpenChange={setPreviewOpen} src={avatar} name={name} /></>;
}
