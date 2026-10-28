import { useEffect, useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_EDITOR_PREFERENCES } from '@/lib/editorPreferences';
import type { EditorPreferences as Preferences } from '@/lib/editorPreferences';

export function EditorPreferences({ value, onChange }: { value: Preferences; onChange: (value: Preferences) => void }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (details.current && !details.current.contains(event.target as Node)) details.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <details ref={details} className="editor-preferences" onKeyDown={event => { if (event.key === 'Escape' && details.current) { details.current.open = false; details.current.querySelector('summary')?.focus(); } }}>
      <summary className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2" aria-label="正文排版设置">
        <Settings2 className="h-3.5 w-3.5" />排版
      </summary>
      <div className="editor-preferences-panel">
        <p className="mb-3 text-sm font-medium">正文排版</p>
        <label>字号<select aria-label="正文字号" value={value.fontSize} onChange={event => onChange({ ...value, fontSize: Number(event.target.value) })}>{[14, 16, 18, 20].map(size => <option key={size} value={size}>{size} px</option>)}</select></label>
        <label>行距<select aria-label="正文行距" value={value.lineHeight} onChange={event => onChange({ ...value, lineHeight: Number(event.target.value) })}>{[1.4, 1.6, 1.8].map(height => <option key={height} value={height}>{height} 倍</option>)}</select></label>
        <label>段后距<select aria-label="正文段后距" value={value.paragraphGap} onChange={event => onChange({ ...value, paragraphGap: Number(event.target.value) })}>{[0, 4, 8].map(gap => <option key={gap} value={gap}>{gap === 0 ? '紧凑 · 0 px' : `${gap} px`}</option>)}</select></label>
        <label>首行缩进两字符<input aria-label="首行缩进两字符" type="checkbox" checked={value.firstLineIndent} onChange={event => onChange({ ...value, firstLineIndent: event.target.checked })} /></label>
        <Button variant="outline" size="sm" onClick={() => onChange({ ...DEFAULT_EDITOR_PREFERENCES })}>恢复默认排版</Button>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">设置只影响阅读显示，会在本机记住。</p>
      </div>
    </details>
  );
}
