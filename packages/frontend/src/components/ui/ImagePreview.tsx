import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { resolveCharacterPortrait } from '@/lib/characterProfiles';

interface ImagePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src?: string;
  name: string;
  kind?: 'cover' | 'portrait';
}

/** Resolve source assets and already-resolved Pages covers without doubling BASE_URL. */
function previewSource(src: string | undefined, kind: 'cover' | 'portrait') {
  if (!src) return null;
  // Existing cover uploads accept image/*, including GIF and SVG data images.
  // Rendering these through <img> keeps them out of the document's HTML context.
  if (kind === 'cover' && /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=._-]+)*,/i.test(src)) return { src };
  const base = import.meta.env.BASE_URL;
  if (src.startsWith('/') && src.startsWith(base)) return resolveCharacterPortrait(src, '/');
  return resolveCharacterPortrait(src, base);
}

export function ImagePreview({ open, onOpenChange, src, name, kind = 'portrait' }: ImagePreviewProps) {
  const image = previewSource(src, kind);
  const [failed, setFailed] = useState<string>();
  const returnFocus = useRef<HTMLElement | null>(null);
  const title = `预览${name}${kind === 'cover' ? '书封' : '头像'}`;
  const cell = image?.cell;
  const available = image && failed !== image.src;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm" onClick={event => { event.stopPropagation(); onOpenChange(false); }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} />
      <Dialog.Content data-image-preview className="fixed left-1/2 top-1/2 z-[101] flex max-h-[94dvh] w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border bg-background p-4 shadow-2xl outline-none sm:p-6" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={event => {
        event.preventDefault();
        if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      }} onEscapeKeyDown={event => event.stopPropagation()}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Dialog.Title className="min-w-0 break-words text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Close aria-label="关闭图片预览" className="shrink-0 select-none rounded-full p-2 text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"><X size={20} /></Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">图片放大预览。按 Escape 或点击遮罩关闭，返回原来的位置。</Dialog.Description>
        <div className="flex min-h-20 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-muted/30 p-2">
          {available ? cell ? <div role="img" aria-label={`${name}头像预览`} data-preview-cell={`${cell.index},${cell.columns},${cell.rows}`} data-preview-src={image.src} className="relative aspect-square max-w-full overflow-hidden rounded-lg" style={{ width: 'min(72vw, 66dvh, 560px)', backgroundImage: `url(${JSON.stringify(image.src)})`, backgroundSize: `${cell.columns * 100}% ${cell.rows * 100}%`, backgroundPosition: `${cell.columns === 1 ? 0 : cell.index % cell.columns / (cell.columns - 1) * 100}% ${cell.rows === 1 ? 0 : Math.floor(cell.index / cell.columns) / (cell.rows - 1) * 100}%`, backgroundRepeat: 'no-repeat' }}><img src={image.src} alt="" draggable={false} className="pointer-events-none absolute h-0 w-0 opacity-0" onError={() => setFailed(image.src)} /></div> : <img src={image.src} alt={`${name}${kind === 'cover' ? '书封' : '头像'}预览`} data-preview-src={image.src} draggable={false} className="block max-h-[72dvh] max-w-full select-none rounded-lg object-contain" onError={() => setFailed(image.src)} /> : <p role="status" className="py-12 text-sm text-muted-foreground">图片暂时无法预览。</p>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
