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
  // Right half - Row 3 (thumb cluster, 5 keys - starts at col 0)
  { id: 'R30', row: 3, col: 0, half: 'right' },
  { id: 'R31', row: 3, col: 1, half: 'right' },
  { id: 'R32', row: 3, col: 2, half: 'right' },
  { id: 'R33', row: 3, col: 3, half: 'right' },
  { id: 'R34', row: 3, col: 4, half: 'right' },
];

export const LEFT_KEYS = KEYBOARD_LAYOUT.filter(k => k.half === 'left');
export const RIGHT_KEYS = KEYBOARD_LAYOUT.filter(k => k.half === 'right');
