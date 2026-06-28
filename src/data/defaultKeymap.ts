import { Layer, KeyConfig, LedColor, Combo, GestureShortcut, BluetoothProfile } from '../types';
import { KEYBOARD_LAYOUT } from './layout';

function makeKey(id: string, keyCode: string, label: string, type: 'basic' | 'mod-tap' | 'layer-tap' | 'momentary' | 'toggle' | 'to-layer' | 'trans' | 'none' = 'basic', extra?: Partial<KeyConfig['binding']>): KeyConfig {
  return { id, binding: { type, keyCode, label, ...extra } };
}

const LAYER_COLORS: LedColor[] = [
  'black', 'cyan', 'green', 'yellow', 'magenta', 'magenta', 'red',
  'white', 'white', 'white', 'white', 'white', 'cyan', 'cyan',
];

const PROTECTED_LAYERS = [0, 1, 2, 3, 4, 5, 6, 12, 13];

function makeEmptyKeys(): KeyConfig[] {
  return KEYBOARD_LAYOUT.map(pos => makeKey(pos.id, 'KC_TRNS', '', 'trans'));
}

// Layer 0 - Base layer
function makeLayer0Keys(): KeyConfig[] {
  const keys = makeEmptyKeys();
  const set = (id: string, code: string, label: string, type: KeyConfig['binding']['type'] = 'basic', extra?: Partial<KeyConfig['binding']>) => {
    const idx = keys.findIndex(k => k.id === id);
    if (idx >= 0) keys[idx] = makeKey(id, code, label, type, extra);
  };

  // Left Row 0
  set('L00', 'KC_Q', 'Q');
  set('L01', 'KC_W', 'W');
  set('L02', 'KC_E', 'E');
  set('L03', 'KC_R', 'R');
  set('L04', 'KC_T', 'T');
  // Left Row 1
  set('L10', 'KC_A', 'A');
  set('L11', 'KC_S', 'S');
  set('L12', 'KC_D', 'D');
  set('L13', 'KC_F', 'F');
  set('L14', 'KC_G', 'G');
  // Left Row 2
  set('L20', 'KC_Z', 'Z', 'mod-tap', { modifiers: ['lshift'], tapKeyCode: 'KC_Z', tapLabel: 'Z' });
  set('L21', 'KC_X', 'X');
  set('L22', 'KC_C', 'C');
  set('L23', 'KC_V', 'V');
  set('L24', 'KC_B', 'B');
  // Left Row 3 (thumb)
  set('L30', 'KC_ESC', 'ESC', 'mod-tap', { modifiers: ['lgui'], tapKeyCode: 'KC_ESC', tapLabel: 'ESC' });
  set('L31', 'KC_LCTL', 'L Ctrl');
  set('L32', 'KC_LALT', 'L Alt');
  set('L33', 'KC_TAB', 'TAB', 'layer-tap', { layer: 1, tapKeyCode: 'KC_TAB', tapLabel: 'TAB' });
  set('L34', 'KC_SPC', 'SPACE', 'layer-tap', { layer: 2, tapKeyCode: 'KC_SPC', tapLabel: 'SPACE' });
  set('L35', 'KC_LANG2', 'LANG2', 'mod-tap', { modifiers: ['lgui'], tapKeyCode: 'KC_LANG2', tapLabel: 'LANG2' });

  // Right Row 0
  set('R00', 'KC_Y', 'Y');
  set('R01', 'KC_U', 'U');
  set('R02', 'KC_I', 'I');
  set('R03', 'KC_O', 'O');
  set('R04', 'KC_BSPC', 'Bksp');
  // Right Row 1
  set('R10', 'KC_H', 'H');
  set('R11', 'KC_J', 'J');
  set('R12', 'KC_K', 'K');
  set('R13', 'KC_L', 'L');
  set('R14', 'KC_P', 'P');
  // Right Row 2
  set('R20', 'KC_N', 'N');
  set('R21', 'KC_M', 'M');
  set('R22', 'KC_COMM', ',');
  set('R23', 'KC_DOT', '.');
  set('R24', 'KC_MINS', '-');
  // Right Row 3 (thumb)
  set('R30', 'KC_LANG1', 'LANG1', 'mod-tap', { modifiers: ['rgui'], tapKeyCode: 'KC_LANG1', tapLabel: 'LANG1' });
  set('R31', 'KC_ENT', 'ENTER', 'layer-tap', { layer: 3, tapKeyCode: 'KC_ENT', tapLabel: 'ENTER' });
  set('R32', 'KC_SCLN', 'SEMI', 'mod-tap', { modifiers: ['rshift'], tapKeyCode: 'KC_SCLN', tapLabel: 'SEMI' });
  set('R33', 'KC_SLSH', '/');

  return keys;
}

export function createDefaultLayers(): Layer[] {
  return Array.from({ length: 14 }, (_, i) => ({
    name: `Layer ${i}`,
    index: i,
    ledColor: LAYER_COLORS[i],
    isProtected: PROTECTED_LAYERS.includes(i),
    keys: i === 0 ? makeLayer0Keys() : makeEmptyKeys(),
  }));
}

export function createDefaultCombos(): Combo[] {
  return [
    {
      id: 'device-combo-0',
      name: 'L5',
      keyPositions: ['R12', 'R13'],
      binding: { type: 'momentary', keyCode: 'MO(5)', label: 'L5', layer: 5 },
      timeoutMs: 50,
      layers: [],
    },
    {
      id: 'device-combo-1',
      name: 'L13',
      keyPositions: ['R02', 'R03'],
      binding: { type: 'momentary', keyCode: 'MO(13)', label: 'L13', layer: 13 },
      timeoutMs: 50,
      layers: [],
    },
    {
      id: 'device-combo-2',
      name: 'BT 5',
      keyPositions: ['L00', 'L10', 'L20'],
      binding: { type: 'basic', keyCode: 'BT_SEL_4', label: 'BT 5' },
      timeoutMs: 50,
      layers: [],
    },
    {
      id: 'device-combo-3',
      name: 'Boot',
      keyPositions: ['R03', 'L24', 'L04'],
      binding: { type: 'basic', keyCode: 'QK_BOOT', label: 'Boot' },
      timeoutMs: 50,
      layers: [],
    },
    {
      id: 'device-combo-4',
      name: 'L13',
      keyPositions: ['R22', 'R23'],
      binding: { type: 'momentary', keyCode: 'MO(13)', label: 'L13', layer: 13 },
      timeoutMs: 50,
      layers: [],
    },
  ];
}

export function createDefaultGestures(): GestureShortcut[] {
  return [
    { direction: 'up', keyCode: 'C+KC_UP', label: 'C+Up', layer: 13 },
    { direction: 'down', keyCode: 'C+KC_DOWN', label: 'C+Down', layer: 13 },
    { direction: 'left', keyCode: 'C+KC_LEFT', label: 'C+Left', layer: 13 },
    { direction: 'right', keyCode: 'C+KC_RIGHT', label: 'C+Right', layer: 13 },
  ];
}

export function createDefaultBluetoothProfiles(): BluetoothProfile[] {
  const colors: LedColor[] = ['cyan', 'magenta', 'yellow', 'green', 'red'];
  return Array.from({ length: 5 }, (_, i) => ({
    index: i,
    name: '',
    connected: false,
    active: i === 0,
    ledColor: colors[i],
  }));
}
