import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { SlashCommandDefinition } from '@/lib/slashCommands';
import { isSlashCommandDisabled, slashOptionId } from '@/lib/slashComposer';

export interface SlashCommandMenuProps {
  id: string;
  commands: readonly SlashCommandDefinition[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onChoose: (command: SlashCommandDefinition) => void;
  onClose: () => void;
  busy?: boolean;
  preserveDraft?: boolean;
}

const groupNames = { local: '本地操作', writing: 'AI 创作', review: '检查与回顾' };

/** A completion list anchored to the composer. It never starts an operation;
 * the parent inserts text and an explicit send executes that command. */
export function SlashCommandMenu({ id, commands, activeIndex, onActiveIndexChange, onChoose, onClose, busy = false, preserveDraft = false }: SlashCommandMenuProps) {
  const list = useRef<HTMLDivElement>(null);
  const active = activeIndex >= 0 ? commands[activeIndex] : undefined;

  useEffect(() => {
    if (!active) return;
    const option = document.getElementById(slashOptionId(id, active.id));
    if (!option || !list.current) return;
    // Scroll this list only, leaving the paused chat reading position untouched.
    const top = option.offsetTop - list.current.offsetTop;
    if (top < list.current.scrollTop) list.current.scrollTop = top;
    else if (top + option.offsetHeight > list.current.scrollTop + list.current.clientHeight) list.current.scrollTop = top + option.offsetHeight - list.current.clientHeight;
  }, [id, active]);

  return <div data-slash-menu className="absolute inset-x-0 bottom-[calc(100%+8px)] z-40 flex max-h-[min(360px,45dvh)] min-w-0 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
      <p className="text-sm font-semibold">斜杠命令</p>
      <button type="button" aria-label="关闭命令菜单" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted" onMouseDown={event => event.preventDefault()} onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
    <div ref={list} id={id} role="listbox" aria-label="命令菜单" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
      {!commands.length && <p className="p-3 text-sm leading-relaxed text-muted-foreground">没有匹配的命令。可缩短关键词，或输入 /help 查看帮助；未知命令不会发送给模型。</p>}
      {commands.map((command, index) => {
        const disabled = isSlashCommandDisabled(command, busy, preserveDraft);
        return <div key={command.id} role="presentation">
          {(index === 0 || commands[index - 1].group !== command.group) && <p role="presentation" className="px-2 pb-1 pt-2 text-[10px] font-medium text-muted-foreground">{groupNames[command.group]}</p>}
          <button type="button" role="option" id={slashOptionId(id, command.id)} data-slash-command={command.id} aria-selected={activeIndex === index} aria-disabled={disabled} disabled={disabled} tabIndex={-1}
            className={`block w-full min-w-0 rounded-lg px-2 py-2 text-left transition-colors ${activeIndex === index && !disabled ? 'bg-primary/10 text-primary' : 'hover:bg-muted/70'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => { if (!disabled) onActiveIndexChange(index); }}
            onClick={() => { if (!disabled) onChoose(command); }}>
            <span className="flex flex-wrap items-center justify-between gap-1"><code className="font-mono text-sm font-semibold">{command.name}</code><span className={`rounded-full px-2 py-0.5 text-[10px] ${command.kind === 'ai' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100' : 'bg-muted text-muted-foreground'}`}>{command.kind === 'ai' ? 'AI · 可能计费' : '本地 · 不调用模型'}</span></span>
            <span className="mt-1 block whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">{command.description}</span>
            {disabled && <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{busy && !command.busyAllowed ? '生成中暂不可用，可先准备下一条需求。' : '已有草稿时仅供查看，先保留草稿或手动输入本地命令。'}</span>}
          </button>
        </div>;
      })}
    </div>
    <div className="shrink-0 space-y-1 border-t bg-muted/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
      {active && <><p className="break-words"><span className="font-medium">用法：</span><code className="whitespace-normal">{active.usage}</code></p>{active.examples[0] && <p className="break-words"><span className="font-medium">示例：</span><code className="whitespace-normal">{active.examples[0]}</code></p>}</>}
      <p>↑↓ 选择 · Enter / Tab 补全 · Esc 关闭。选择后还需发送才会执行。</p>
      {preserveDraft && <p>已有文字会完整保留在 AI 命令后；本地操作请先保留草稿或手动输入。</p>}
    </div>
  </div>;
}
