import { useState } from 'react';
import { Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNovelStore } from '@/stores/novelStore';
import { createNovelExport, downloadExport, exportChapterTitle, prepareNovelExport, sanitizeExportFilename } from '@/lib/novelExport';
import type { ExportFormat, ExportScope } from '@/lib/novelExport';
import { flushActiveEditor } from '@/lib/editorEvents';

const formats = { txt: { label: 'TXT 文本', description: '保留段落，适合小说阅读器和 Windows 记事本。' }, md: { label: 'Markdown', description: '保留标题、加粗、斜体、列表和引用，方便继续编辑。' }, docx: { label: 'Word 文档', description: '宋体正文、黑体标题，适合 Windows Word 阅读与打印。' } };

export function ExportDialog({ novelId, open, onOpenChange }: { novelId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [scope, setScope] = useState<ExportScope>('novel');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chapters = useNovelStore(state => state.chapters);
  const novels = useNovelStore(state => state.novels);
  const chapterId = useNovelStore(state => state.currentChapterId);
  const novel = novels.find(item => item.id === novelId);
  const selected = chapters.find(item => item.id === chapterId && item.novelId === novelId);
  const effectiveScope = scope === 'chapter' && selected ? 'chapter' : 'novel';
  const ordered = chapters.filter(item => item.novelId === novelId).slice().sort((a, b) => a.sequence - b.sequence);
  const count = effectiveScope === 'chapter' ? 1 : ordered.length;
  const selectedTitle = selected ? exportChapterTitle(selected.title, ordered.findIndex(item => item.id === selected.id) + 1) : '';
  const filename = `${sanitizeExportFilename(effectiveScope === 'chapter' ? `${novel?.title}_${selectedTitle}` : novel?.title || '未命名小说')}.${format}`;
  const changeOpen = (value: boolean) => { if (!busy) { setError(''); onOpenChange(value); } };
  const exportFile = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      flushActiveEditor();
      const state = useNovelStore.getState();
      const latest = state.novels.find(item => item.id === novelId);
      if (!latest) throw new Error('小说已不存在，请重新选择。');
      const data = prepareNovelExport(latest, state.chapters, { scope: effectiveScope, chapterId: state.currentChapterId, includeSummary });
      const result = await createNovelExport(data, format, effectiveScope);
      downloadExport(result.blob, result.filename);
      onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导出未完成，请稍后重试。'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" onInteractOutside={event => { if (busy) event.preventDefault(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>导出小说</DialogTitle><DialogDescription>选择需要的章节和文件格式。稿件在本机生成，无需调用模型。</DialogDescription></DialogHeader>
        <fieldset disabled={busy} className="space-y-4">
          <label className="grid gap-2 text-sm">导出范围<select aria-label="导出范围" className="rounded-md border bg-background px-3 py-2" value={effectiveScope} onChange={event => setScope(event.target.value as ExportScope)}><option value="novel">整本小说</option><option value="chapter" disabled={!selected}>当前章节{selected ? ` · ${selected.title}` : '（请先选择章节）'}</option></select></label>
          <label className="grid gap-2 text-sm">文件格式<select aria-label="文件格式" className="rounded-md border bg-background px-3 py-2" value={format} onChange={event => setFormat(event.target.value as ExportFormat)}>{Object.entries(formats).map(([key, value]) => <option key={key} value={key}>{value.label}（.{key}）</option>)}</select></label>
          <p className="text-xs leading-relaxed text-muted-foreground">{formats[format].description}</p>
          {effectiveScope === 'novel' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeSummary} onChange={event => setIncludeSummary(event.target.checked)} />包含小说简介</label>}
        </fieldset>
        <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed"><p>共 {count} 章</p><p className="mt-1 break-all" data-testid="export-filename">{filename}</p></div>
        {!count && <p role="status" className="text-sm text-muted-foreground">这本小说还没有章节可导出。</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => changeOpen(false)}>取消</Button><Button disabled={busy || !count || !novel} onClick={exportFile}><Download className="h-4 w-4" />{busy ? '正在生成文件…' : '下载文件'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
