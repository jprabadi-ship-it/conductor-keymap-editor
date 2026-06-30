export interface KeyPosition {
  id: string;
  row: number;
  col: number;
  half: 'left' | 'right';
}

export const KEYBOARD_LAYOUT: KeyPosition[] = [
  // Left half - Row 0
  { id: 'L00', row: 0, col: 0, half: 'left' },
  { id: 'L01', row: 0, col: 1, half: 'left' },
  { id: 'L02', row: 0, col: 2, half: 'left' },
  { id: 'L03', row: 0, col: 3, half: 'left' },
  { id: 'L04', row: 0, col: 4, half: 'left' },
  // Left half - Row 1
  { id: 'L10', row: 1, col: 0, half: 'left' },
  { id: 'L11', row: 1, col: 1, half: 'left' },
  { id: 'L12', row: 1, col: 2, half: 'left' },
  { id: 'L13', row: 1, col: 3, half: 'left' },
  { id: 'L14', row: 1, col: 4, half: 'left' },
  // Left half - Row 2
  { id: 'L20', row: 2, col: 0, half: 'left' },
  { id: 'L21', row: 2, col: 1, half: 'left' },
  { id: 'L22', row: 2, col: 2, half: 'left' },
  { id: 'L23', row: 2, col: 3, half: 'left' },
  { id: 'L24', row: 2, col: 4, half: 'left' },
  // Left half - Row 3 (thumb cluster, 6 keys)
  { id: 'L30', row: 3, col: 0, half: 'left' },
  { id: 'L31', row: 3, col: 1, half: 'left' },
  { id: 'L32', row: 3, col: 2, half: 'left' },
  { id: 'L33', row: 3, col: 3, half: 'left' },
  { id: 'L34', row: 3, col: 4, half: 'left' },
  { id: 'L35', row: 3, col: 5, half: 'left' },

  // Right half - Row 0 (starts at col 1 to leave gap for trackball)
  { id: 'R00', row: 0, col: 1, half: 'right' },
  { id: 'R01', row: 0, col: 2, half: 'right' },
  { id: 'R02', row: 0, col: 3, half: 'right' },
  { id: 'R03', row: 0, col: 4, half: 'right' },
  { id: 'R04', row: 0, col: 5, half: 'right' },
  // Right half - Row 1
  { id: 'R10', row: 1, col: 1, half: 'right' },
  { id: 'R11', row: 1, col: 2, half: 'right' },
  { id: 'R12', row: 1, col: 3, half: 'right' },
  { id: 'R13', row: 1, col: 4, half: 'right' },
  { id: 'R14', row: 1, col: 5, half: 'right' },
  // Right half - Row 2
  { id: 'R20', row: 2, col: 1, half: 'right' },
  { id: 'R21', row: 2, col: 2, half: 'right' },
  { id: 'R22', row: 2, col: 3, half: 'right' },
  { id: 'R23', row: 2, col: 4, half: 'right' },
  { id: 'R24', row: 2, col: 5, half: 'right' },
  // Right half - Row 3 (thumb cluster, 4 keys + trackball at col 2-3)
  { id: 'R30', row: 3, col: 0, half: 'right' },
  { id: 'R31', row: 3, col: 1, half: 'right' },
  // col 2-3 = trackball (below M and ,)
  { id: 'R32', row: 3, col: 4, half: 'right' },
  { id: 'R33', row: 3, col: 5, half: 'right' },
];

// ZMK Studio key position order: row-by-row, left side then right side.
export const KEY_POSITION_ORDER = [
  'L00','L01','L02','L03','L04','R00','R01','R02','R03','R04',
  'L10','L11','L12','L13','L14','R10','R11','R12','R13','R14',
  'L20','L21','L22','L23','L24','R20','R21','R22','R23','R24',
  'L30','L31','L32','L33','L34','L35','R30','R31','R32','R33',
];

export function keyIdToPosition(id: string): number | null {
  const idx = KEY_POSITION_ORDER.indexOf(id);
  return idx >= 0 ? idx : null;
}

export function positionToKeyId(position: number): string | null {
  return KEY_POSITION_ORDER[position] ?? null;
}

export function keyIdsToPositions(ids: string[]): number[] {
  return ids.map(keyIdToPosition).filter((pos): pos is number => pos !== null);
}

export function positionsToKeyIds(positions: number[]): string[] {
  return positions.map(positionToKeyId).filter((id): id is string => id !== null);
}

export const LEFT_KEYS = KEYBOARD_LAYOUT.filter(k => k.half === 'left');
export const RIGHT_KEYS = KEYBOARD_LAYOUT.filter(k => k.half === 'right');
