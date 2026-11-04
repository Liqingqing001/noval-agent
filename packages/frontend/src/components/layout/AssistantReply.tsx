import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { extractContentBlocks } from '@/lib/structuredContent';
import { parseModifyInstructions } from '@/lib/modificationInstructions';
import { chatReplyPreview, copyChatReply } from '@/lib/chatClipboard';
import { useNovelStore } from '@/stores/novelStore';
import type { Message, ViewType } from '@/types';

const destinations: Array<{ types: string[]; label: string; view: ViewType }> = [
  { types: ['章节'], label: '查看章节', view: 'chapters' },
  { types: ['卷', '大纲', '章节大纲'], label: '查看大纲', view: 'outline' },
  { types: ['角色'], label: '查看人物', view: 'characters' },
  { types: ['世界观'], label: '查看世界观', view: 'world' },
];

interface AssistantReplyProps {
  content: string;
  syncStatus?: Message['syncStatus'];
  streaming?: boolean;
  children: ReactNode;
}

/** Display stays compact; the original message is retained for sync, context and export. */
export function AssistantReply({ content, syncStatus, streaming = false, children }: AssistantReplyProps) {
  const [expanded, setExpanded] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const copyTrigger = useRef<HTMLButtonElement>(null);
  const manualText = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const latestContent = useRef(content); latestContent.current = content;
  const contentId = useId();
  const setCurrentView = useNovelStore(state => state.setCurrentView);
  const sections = useMemo(() => streaming ? [] : [
    ...extractContentBlocks(content),
    ...parseModifyInstructions(content).map(item => ({ type: item.target, body: item.newContent, closed: true })),
  ], [content, streaming]);
  const synced = syncStatus?.state === 'success' && sections.length > 0;
  const legacy = !syncStatus && !streaming && sections.some(section => section.body.trim());
  const long = content.length > 600 || content.split('\n').length > 12;
  const collapsible = synced || long || legacy;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setCopyStatus(''); }, [content]);
  useEffect(() => {
    if (!copyStatus.startsWith('已复制')) return;
    const timer = setTimeout(() => setCopyStatus(''), 2500);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const links = synced ? destinations.filter(destination => sections.some(section => destination.types.includes(section.type))) : [];
  const preview = useMemo(() => chatReplyPreview(content, streaming), [content, streaming]);
  const copy = async () => {
    if (copying || !content) return;
    const snapshot = content;
    setCopying(true); setCopyStatus('');
    const result = await copyChatReply(snapshot);
    if (!mounted.current) return;
    setCopying(false);
    if (result === 'copied') setCopyStatus(streaming ? '已复制当前收到的内容' : latestContent.current === snapshot ? '已复制完整回复' : '已复制点击时收到的内容');
    else { setManualCopy(snapshot); setCopyStatus('自动复制不可用，请在弹窗中手动复制。'); }
  };
  return (
    <div className="min-w-0 space-y-2">
      {synced && <p className="text-sm font-medium">内容已同步，完整内容请到对应面板查看。</p>}
      {legacy && <p className="text-sm font-medium">历史回复已折叠，可展开查看或重新同步到面板。</p>}
      <div id={contentId}>
        {!collapsible ? children : expanded ? <div className="max-h-96 overflow-y-auto pr-1">{children}</div> : synced || legacy ? null : (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="whitespace-pre-wrap break-words">{preview.head}{preview.omitted && !preview.tail ? '…' : ''}</p>
            {preview.tail && <><p className="text-xs">中间内容已折叠 · 下方为最新收到的文字</p><p data-stream-preview-tail className="whitespace-pre-wrap break-words border-l-2 border-primary/20 pl-2">{preview.tail}</p></>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {links.map(link => <Button key={link.view} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCurrentView(link.view)}>{link.label}</Button>)}
        {collapsible && <Button variant="ghost" size="sm" className="h-7 min-h-8 text-xs" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
          {expanded ? '收起全文' : streaming ? '展开实时内容' : '展开全文'}
        </Button>}
        <Button ref={copyTrigger} type="button" variant="ghost" size="sm" className="h-7 min-h-8 text-xs" disabled={copying || !content} onClick={() => void copy()}>
          {copyStatus.startsWith('已复制') ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copying ? '正在复制…' : streaming ? '复制当前内容' : '复制回复'}
        </Button>
        {(collapsible || streaming) && <span className="text-xs text-muted-foreground">{content.length.toLocaleString()} 字符{streaming ? ' · 生成中' : ''}</span>}
      </div>
      {copyStatus && <p role="status" className="text-xs leading-relaxed text-muted-foreground">{copyStatus}</p>}
      <Dialog open={manualCopy !== null} onOpenChange={open => { if (!open) { setManualCopy(null); setCopyStatus(''); } }}>
        <DialogContent className="max-h-[88dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto rounded-xl" onOpenAutoFocus={event => { event.preventDefault(); manualText.current?.focus(); manualText.current?.select(); }} onCloseAutoFocus={event => { if (copyTrigger.current?.isConnected) { event.preventDefault(); copyTrigger.current.focus({ preventScroll: true }); } }}>
          <DialogHeader><DialogTitle>手动复制回复</DialogTitle><DialogDescription>浏览器未允许自动复制。下方保留点击时收到的完整原始回复，可全选后使用系统复制。</DialogDescription></DialogHeader>
          <textarea ref={manualText} aria-label="原始回复文本" readOnly value={manualCopy || ''} className="min-h-48 max-h-[48dvh] w-full resize-y rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed" />
          <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={() => { manualText.current?.focus(); manualText.current?.select(); }}>全选回复</Button><Button type="button" onClick={() => { setManualCopy(null); setCopyStatus(''); }}>完成</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
