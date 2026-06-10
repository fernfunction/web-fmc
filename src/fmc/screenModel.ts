import type { Cell, CduColor, CellSize, ScreenModel } from './types';
import { SCREEN_COLS, SCREEN_ROWS } from './types';

export interface TextOpts {
  color?: CduColor;
  size?: CellSize;
  inverse?: boolean;
  blink?: boolean;
}

export function blankScreen(): ScreenModel {
  const rows: ScreenModel = [];
  for (let r = 0; r < SCREEN_ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < SCREEN_COLS; c++) {
      row.push({ ch: ' ', color: 'white', size: r % 2 === 1 && r < 13 ? 'small' : 'large' });
    }
    rows.push(row);
  }
  return rows;
}

export function put(s: ScreenModel, row: number, col: number, text: string, opts: TextOpts = {}): void {
  if (row < 0 || row >= SCREEN_ROWS) return;
  for (let i = 0; i < text.length; i++) {
    const c = col + i;
    if (c < 0 || c >= SCREEN_COLS) continue;
    const cell = s[row][c];
    cell.ch = text[i];
    if (opts.color) cell.color = opts.color;
    if (opts.size) cell.size = opts.size;
    cell.inverse = opts.inverse ?? false;
    cell.blink = opts.blink ?? false;
  }
}

export function putRight(s: ScreenModel, row: number, text: string, opts: TextOpts = {}): void {
  put(s, row, SCREEN_COLS - text.length, text, opts);
}

export function putCenter(s: ScreenModel, row: number, text: string, opts: TextOpts = {}): void {
  put(s, row, Math.floor((SCREEN_COLS - text.length) / 2), text, opts);
}

// title row with optional page count on the right, e.g. "1/2"
export function title(s: ScreenModel, text: string, page?: number, total?: number, opts: TextOpts = {}): void {
  putCenter(s, 0, text, { size: 'large', ...opts });
  if (page !== undefined && total !== undefined) {
    putRight(s, 0, `${page}/${total}`, { size: 'large' });
  }
}

export function modTitle(s: ScreenModel, base: string, isMod: boolean, page?: number, total?: number): void {
  title(s, isMod ? `MOD ${base}` : base, page, total);
}

// LSK helpers: slot n (1..6), label row = 2n-1, data row = 2n
export function labelRow(n: number): number {
  return 2 * n - 1;
}
export function dataRow(n: number): number {
  return 2 * n;
}

export function lskLabel(s: ScreenModel, n: number, side: 'L' | 'R', text: string, opts: TextOpts = {}): void {
  const o = { size: 'small' as CellSize, ...opts };
  if (side === 'L') put(s, labelRow(n), 0, text, o);
  else putRight(s, labelRow(n), text, o);
}

export function lskData(s: ScreenModel, n: number, side: 'L' | 'R', text: string, opts: TextOpts = {}): void {
  const o = { size: 'large' as CellSize, ...opts };
  if (side === 'L') put(s, dataRow(n), 0, text, o);
  else putRight(s, dataRow(n), text, o);
}

export const BOXES = '□□□□□'; // mandatory entry prompt
export const DASHES = '-----'; // optional entry prompt

export function boxes(n: number): string {
  return '□'.repeat(n);
}
export function dashes(n: number): string {
  return '-'.repeat(n);
}
