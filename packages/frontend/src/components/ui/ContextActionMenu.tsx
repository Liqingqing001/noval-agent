import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ContextActionItem {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

interface MenuPosition { x: number; y: number }
interface ContextActionMenuProps {
  open: boolean;
  position: MenuPosition;
  items: ContextActionItem[];
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  label?: string;
}

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input,textarea,select')) return true;
  return target.closest<HTMLElement>('[contenteditable]')?.isContentEditable === true;
}

function focusTarget(container: HTMLElement, target?: EventTarget | null): HTMLElement {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && container.contains(active)) return active;
  const pointed = target instanceof Element ? target.closest<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') : null;
  if (pointed && container.contains(pointed)) return pointed;
  if (container.matches('button:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')) return container;
  return container.querySelector<HTMLElement>('button:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])') || container;
}

/** The same menu opens from a visible button, right-click, or the keyboard menu key. */
export function useContextActionMenu() {
  const [state, setState] = useState<{ open: boolean; position: MenuPosition; returnFocus: HTMLElement | null }>({ open: false, position: { x: 0, y: 0 }, returnFocus: null });
  const onClose = useCallback(() => setState(value => ({ ...value, open: false })), []);
  const openAtPoint = useCallback((x: number, y: number, element?: HTMLElement | null) => {
    setState({ open: true, position: { x, y }, returnFocus: element || null });
  }, []);
  const openAtElement = useCallback((element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    openAtPoint(bounds.left, bounds.bottom + 5, focusTarget(element, element));
  }, [openAtPoint]);
  const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    if (editableTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    openAtPoint(event.clientX, event.clientY, focusTarget(event.currentTarget, event.target));
  }, [openAtPoint]);
  const onMenuKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (editableTarget(event.target)) return;
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    openAtPoint(bounds.left, bounds.bottom + 5, focusTarget(event.currentTarget, event.target));
  }, [openAtPoint]);
  return { menuProps: { ...state, onClose }, onContextMenu, onMenuKeyDown, openAtElement, openAtPoint };
}

export function ContextActionMenu({ open, position, items, onClose, returnFocus, label = '操作菜单' }: ContextActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState(position);
  const restoreFocus = useCallback(() => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, [returnFocus]);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    setPlaced({ x: Math.max(8, Math.min(position.x, innerWidth - bounds.width - 8)), y: Math.max(8, Math.min(position.y, innerHeight - bounds.height - 8)) });
    ref.current.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const resize = () => onClose();
    const blur = () => onClose();
    const scroll = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', blur);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', blur);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [open, position.x, position.y, onClose]);

  if (!open) return null;
  return createPortal(<div ref={ref} role="menu" aria-label={label} className="fixed z-[90] min-w-44 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] select-none overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl" style={{ left: placed.x, top: placed.y }} onContextMenu={event => event.preventDefault()} onClick={event => event.stopPropagation()} onKeyDown={event => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      event.stopPropagation();
      restoreFocus();
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus({ preventScroll: true });
  }}>
    {items.map(item => <div key={item.id}>
      {item.separatorBefore && <div role="separator" className="my-1 border-t border-border" />}
      <button type="button" role="menuitem" tabIndex={-1} disabled={item.disabled} className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? 'text-destructive' : ''}`} onClick={() => {
        // Restore before the action: opening a dialog or inline input can then take focus.
        restoreFocus();
        onClose();
        item.onSelect();
      }}>{item.icon}<span>{item.label}</span></button>
    </div>)}
  </div>, document.body);
}
