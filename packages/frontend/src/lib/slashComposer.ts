import type { SlashCommandDefinition } from './slashCommands';

/** Autocomplete applies only to the first slash token, never to its arguments
 * or a slash embedded in ordinary prose. The returned query includes `/`. */
export function slashHeadQuery(value: string, caret = value.length): string | null {
  const start = value.search(/\S/);
  if (start < 0 || value[start] !== '/') return null;
  const match = value.slice(start).match(/^\/[^\s]*/);
  if (!match) return null;
  const end = start + match[0].length;
  if (caret <= start || caret > end) return null;
  return match[0];
}

/** Completion is a text edit, not an execution. Retain both existing arguments
 * and unrelated prose; normal drafts become the selected AI command's argument. */
export function completeSlashCommand(value: string, commandName: string): { value: string; caret: number } {
  const name = commandName.startsWith('/') ? commandName : `/${commandName}`;
  if (!/^\/[^\s/]+$/.test(name)) return { value, caret: value.length };
  const start = value.search(/\S/);
  let completed: string;
  if (start >= 0 && value[start] === '/') {
    const head = value.slice(start).match(/^\/[^\s]*/)!;
    const suffix = value.slice(start + head[0].length);
    completed = `${value.slice(0, start)}${name}${suffix || ' '}`;
  } else if (start < 0) completed = `${value}${name} `;
  else completed = `${name} ${value}`;
  return { value: completed, caret: completed.length };
}

export function slashOptionId(menuId: string, commandId: string): string {
  return `${menuId}-option-${commandId}`;
}

export function isSlashCommandDisabled(command: Pick<SlashCommandDefinition, 'kind' | 'busyAllowed'>, busy = false, preserveDraft = false): boolean {
  return busy && !command.busyAllowed || preserveDraft && command.kind === 'local';
}

/** Keep keyboard focus in the composer and expose only selectable rows through
 * aria-activedescendant. A missing selection stays absent if every row is disabled. */
export function moveSlashCommandSelection(commands: readonly Pick<SlashCommandDefinition, 'kind' | 'busyAllowed'>[], current: number, step: 1 | -1, busy = false, preserveDraft = false): number {
  if (!commands.length) return -1;
  const origin = current >= 0 && current < commands.length ? current : step > 0 ? -1 : 0;
  for (let offset = 1; offset <= commands.length; offset++) {
    const index = (origin + offset * step + commands.length * 2) % commands.length;
    if (!isSlashCommandDisabled(commands[index], busy, preserveDraft)) return index;
  }
  return -1;
}
