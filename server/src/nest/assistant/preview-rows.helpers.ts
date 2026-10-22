import type { AssistantChangeLabelKey, AssistantChangeRow } from '@trek/shared';

/**
 * The pieces every change card is written with: a value cut to what a row
 * shows, an argument read as an id, and the rows themselves. Shared by the
 * cards of the trip's own tools (tool-call-preview.helpers.ts) and of the
 * tours (tour-call-preview.helpers.ts).
 */

type Args = Record<string, unknown>;

/** Longest value a row shows; URLs keep their start, so the host stays visible. */
const MAX_VALUE_CHARS = 160;

const CHECKED = '✓';
export const UNCHECKED = '✗';

export function clip(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > MAX_VALUE_CHARS ? `${line.slice(0, MAX_VALUE_CHARS - 1)}…` : line;
}

export function id(args: Args, key: string): number | null {
  const value = args[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? CHECKED : UNCHECKED;
  return clip(String(value));
}

export class Rows {
  readonly rows: AssistantChangeRow[] = [];

  add(labelKey: AssistantChangeLabelKey, after: string): this {
    if (after !== '') this.rows.push({ op: 'add', labelKey, before: null, after });
    return this;
  }

  change(labelKey: AssistantChangeLabelKey, before: string | null, after: string): this {
    this.rows.push({ op: 'change', labelKey, before: before || null, after });
    return this;
  }

  move(labelKey: AssistantChangeLabelKey, before: string, after: string): this {
    this.rows.push({ op: 'move', labelKey, before: before || null, after });
    return this;
  }
}
