import { Layer, KeyConfig, LedColor, LED_COLORS, Combo, GestureShortcut, BluetoothProfile } from '../types';
import { KEYBOARD_LAYOUT } from './layout';

type BT = KeyConfig['binding']['type'];

function b(keyCode: string, label: string, type: BT = 'basic', extra?: Partial<KeyConfig['binding']>): KeyConfig['binding'] {
  return { type, keyCode, label, ...extra };
}

function none(): KeyConfig['binding'] {
  return { type: 'none', keyCode: 'NONE', label: '' };
}

function trans(): KeyConfig['binding'] {
  return { type: 'trans', keyCode: 'KC_TRNS', label: '---' };
}

const PROTECTED_LAYERS = [0, 1, 2, 3, 4, 5, 6, 12, 13];

type BindingMap = Record<string, KeyConfig['binding']>;

function buildKeys(bindings: BindingMap): KeyConfig[] {
  return KEYBOARD_LAYOUT.map(pos => ({
    id: pos.id,
    binding: bindings[pos.id] || none(),
  }));
}

const LAYER_DATA: { id: number; name: string; ledColor: number; bindings: BindingMap }[] = [
  {
    id: 0, name: 'base', ledColor: 0,
    bindings: {
      L00: b('KC_Q', 'Q'), L01: b('KC_W', 'W'), L02: b('KC_E', 'E'), L03: b('KC_R', 'R'), L04: b('KC_T', 'T'),
      R00: b('KC_Y', 'Y'), R01: b('KC_U', 'U'), R02: b('KC_I', 'I'), R03: b('KC_O', 'O'), R04: b('KC_P', 'P'),
      L10: b('KC_A', 'A'), L11: b('KC_S', 'S'), L12: b('KC_D', 'D'), L13: b('KC_F', 'F'), L14: b('KC_G', 'G'),
      R10: b('KC_H', 'H'), R11: b('KC_J', 'J'), R12: b('KC_K', 'K'), R13: b('KC_L', 'L'),
      R14: b('KC_MINS', '-'),
      L20: b('LSHIFT(Z)', 'Z', 'mod-tap', { modifiers: ['lshift'], tapKeyCode: 'KC_Z', tapLabel: 'Z' }),
      L21: b('KC_X', 'X'), L22: b('KC_C', 'C'), L23: b('KC_V', 'V'), L24: b('KC_B', 'B'),
      R20: b('KC_N', 'N'), R21: b('KC_M', 'M'), R22: b('KC_COMM', ','), R23: b('KC_DOT', '.'),
      R24: b('RSHIFT(FSLH)', '/', 'mod-tap', { modifiers: ['rshift'], tapKeyCode: 'KC_SLSH', tapLabel: '/' }),
      L30: b('KC_TAB', 'Tab'),
      L31: b('KC_LCTL', 'L Ctrl'),
      L32: b('KC_LALT', 'L Alt'),
      L33: b('MT(LGUI, LANG2)', '英数', 'mod-tap', { modifiers: ['lgui'], tapKeyCode: 'KC_LANG2', tapLabel: 'LANG2' }),
      L34: b('LT(1, SPACE)', 'Space', 'layer-tap', { layer: 1, tapKeyCode: 'KC_SPC', tapLabel: 'SPACE' }),
      L35: b('LT(2, BSPC)', 'Bksp', 'layer-tap', { layer: 2, tapKeyCode: 'KC_BSPC', tapLabel: 'BSPC' }),
      R30: b('LT(3, ENTER)', 'Enter', 'layer-tap', { layer: 3, tapKeyCode: 'KC_ENT', tapLabel: 'ENTER' }),
      R31: b('MT(RGUI, LANG1)', 'かな', 'mod-tap', { modifiers: ['rgui'], tapKeyCode: 'KC_LANG1', tapLabel: 'LANG1' }),
      R32: b('C_VOL_DN', 'Vol-'),
      R33: b('C_VOL_UP', 'Vol+'),
    },
  },
  {
    id: 1, name: 'symbol', ledColor: 4,
    bindings: {
      L00: b('KC_EXCL', '!'), L01: b('KC_AT', '@'), L02: b('KC_HASH', '#'), L03: b('KC_DLR', '$'), L04: b('KC_PERC', '%'),
      R00: b('KC_CIRC', '^'), R01: b('KC_AMPR', '&'), R02: b('KC_ASTR', '*'), R03: b('KC_LPRN', '('), R04: b('KC_RPRN', ')'),
      L10: b('LG(LS(N3))', 'SS3'), L11: b('LG(LS(N4))', 'SS4'), L12: b('LG(LS(N5))', 'SS5'),
      L13: none(), L14: none(),
      R10: b('KC_MINS', '-'), R11: b('KC_EQL', '='), R12: b('KC_LBRC', '['), R13: b('KC_RBRC', ']'), R14: b('KC_BSLS', '\\'),
      L20: none(), L21: none(), L22: none(), L23: none(), L24: none(),
      R20: none(), R21: none(), R22: b('KC_SCLN', ';'), R23: b('KC_QUOT', "'"), R24: b('KC_GRV', '`'),
      L30: b('KC_ESC', 'Esc'), L31: none(), L32: none(), L33: none(), L34: none(),
      L35: b('MO(6)', 'L6', 'momentary', { layer: 6 }),
      R30: none(), R31: none(), R32: none(), R33: none(),
    },
  },
  {
    id: 2, name: 'number', ledColor: 2,
    bindings: {
      L00: b('KC_F1', 'F1'), L01: b('KC_F2', 'F2'), L02: b('KC_F3', 'F3'), L03: b('KC_F4', 'F4'), L04: b('KC_F5', 'F5'),
      R00: b('KC_1', '1'), R01: b('KC_2', '2'), R02: b('KC_3', '3'), R03: b('KC_PLUS', '+'), R04: b('KC_MINS', '-'),
      L10: b('KC_F6', 'F6'), L11: b('KC_F7', 'F7'), L12: b('KC_F8', 'F8'), L13: b('KC_F9', 'F9'), L14: b('KC_F10', 'F10'),
      R10: b('KC_4', '4'), R11: b('KC_5', '5'), R12: b('KC_6', '6'), R13: b('KC_ASTR', '*'), R14: b('KC_SLSH', '/'),
      L20: b('KC_F11', 'F11'), L21: b('KC_F12', 'F12'), L22: trans(), L23: trans(), L24: trans(),
      R20: b('KC_7', '7'), R21: b('KC_8', '8'), R22: b('KC_9', '9'), R23: none(), R24: none(),
      L30: none(), L31: none(), L32: none(), L33: none(), L34: none(), L35: none(),
      R30: b('KC_DOT', '.'), R31: b('KC_0', '0'), R32: none(), R33: none(),
    },
  },
  {
    id: 3, name: 'move', ledColor: 3,
    bindings: {
      L00: trans(), L01: trans(), L02: trans(), L03: trans(), L04: trans(),
      R00: b('LC(UP)', 'C+Up', 'basic', { modifiers: ['lctrl'] }),
      R01: b('LC(LEFT)', 'C+Left', 'basic', { modifiers: ['lctrl'] }),
      R02: b('KC_UP', 'Up'),
      R03: b('LC(RIGHT)', 'C+Right', 'basic', { modifiers: ['lctrl'] }),
      R04: b('LC(DOWN)', 'C+Down', 'basic', { modifiers: ['lctrl'] }),
      L10: trans(), L11: trans(), L12: trans(), L13: trans(), L14: trans(),
      R10: b('LC(A)', 'C+A', 'basic', { modifiers: ['lctrl'] }),
      R11: b('KC_LEFT', 'Left'), R12: b('KC_DOWN', 'Down'), R13: b('KC_RIGHT', 'Right'),
      R14: b('LC(E)', 'C+E', 'basic', { modifiers: ['lctrl'] }),
      L20: trans(), L21: trans(), L22: trans(), L23: trans(), L24: trans(),
      R20: b('KC_MPRV', 'Prev'),
      R21: b('LG(LEFT)', 'G+Left', 'basic', { modifiers: ['lgui'] }),
      R22: none(),
      R23: b('LG(RIGHT)', 'G+Right', 'basic', { modifiers: ['lgui'] }),
      R24: b('KC_MNXT', 'Next'),
      L30: none(), L31: none(), L32: none(), L33: none(), L34: none(), L35: none(),
      R30: none(), R31: none(),
      R32: b('KC_BRID', 'Bri-'), R33: b('KC_BRIU', 'Bri+'),
    },
  },
  {
    id: 4, name: 'mouse', ledColor: 5,
    bindings: {
      R12: b('MKP_MB1', 'MB1'), R13: b('MKP_MB2', 'MB2'), R14: b('MKP_MB3', 'MB3'),
    },
  },
  { id: 5, name: 'scroll', ledColor: 5, bindings: {} },
  {
    id: 6, name: 'setting', ledColor: 1,
    bindings: {
      R00: b('BT_SEL_0', 'BT 0'), R01: b('BT_SEL_1', 'BT 1'), R02: b('BT_SEL_2', 'BT 2'), R03: b('BT_SEL_3', 'BT 3'), R04: b('BT_SEL_4', 'BT 4'),
      R11: trans(), R12: trans(),
      R13: b('TG(12)', 'Precision', 'toggle', { layer: 12 }),
      R14: b('SCRL_INV', 'Scrl Inv'),
      L21: trans(), L22: trans(), L23: trans(),
      R31: b('QK_BOOT', 'Boot'), R32: b('BT_CLR', 'BT Clr'), R33: b('BT_CLR_ALL', 'BT All'),
    },
  },
  // Empty placeholder layers, available as per-device overlays (keymap and/or
  // gesture). All-&trans by default: activating one of these as a device's
  // keymap overlay must not disable keys the user hasn't customized yet — it
  // should fall through to the shared layers, not go silently dead (NONE).
  ...([7, 8, 9, 10, 11] as const).map(id => ({
    id, name: `Layer ${id}`, ledColor: 7,
    bindings: Object.fromEntries(KEYBOARD_LAYOUT.map(k => [k.id, trans()])) as BindingMap,
  })),
  {
    id: 12, name: 'Precision', ledColor: 6,
    bindings: {
      R12: b('MKP_MB1', 'MB1'), R13: b('MKP_MB2', 'MB2'), R14: b('MKP_MB3', 'MB3'),
      R33: b('TG(12)', 'Precision', 'toggle', { layer: 12 }),
    },
  },
  {
    id: 13, name: 'Gesture', ledColor: 6,
    // Position <-> direction must match trackball_gestures' DT
    // `positions = <7 27 16 18>;` order (monokey_R.overlay): up=R02,
    // down=R22, left=R11, right=R13.
    bindings: {
      R02: b('LC(UP)', 'C+Up', 'basic', { modifiers: ['lctrl'] }),
      R22: b('LC(DOWN)', 'C+Down', 'basic', { modifiers: ['lctrl'] }),
      R11: b('LC(LEFT)', 'C+Left', 'basic', { modifiers: ['lctrl'] }),
      R13: b('LC(RIGHT)', 'C+Right', 'basic', { modifiers: ['lctrl'] }),
    },
  },
];

export function createDefaultLayers(): Layer[] {
  return LAYER_DATA.map(ld => ({
    name: ld.name,
    index: ld.id,
    ledColor: LED_COLORS[ld.ledColor] || '#ffffff',
    isProtected: PROTECTED_LAYERS.includes(ld.id),
    keys: buildKeys(ld.bindings),
  }));
}

export function createDefaultCombos(): Combo[] {
  return [
    {
      id: 'dts-scroll', name: 'scroll', keyPositions: ['R12', 'R13'],
      binding: { type: 'momentary', keyCode: 'MO(5)', label: 'L5', layer: 5 }, timeoutMs: 50, layers: [],
    },
    {
      id: 'dts-gesture', name: 'gesture', keyPositions: ['R02', 'R03'],
      binding: { type: 'momentary', keyCode: 'MO(13)', label: 'L13', layer: 13 }, timeoutMs: 50, layers: [],
    },
    {
      id: 'nvee3u', name: 'pair', keyPositions: ['L00', 'L10', 'L20'],
      binding: { type: 'basic', keyCode: 'BT_SEL_5', label: 'BT 5' }, timeoutMs: 50, layers: [],
    },
    {
      id: '651gdv', name: 'boot', keyPositions: ['R03', 'L24', 'L04'],
      binding: { type: 'basic', keyCode: 'QK_BOOT', label: 'Boot' }, timeoutMs: 50, layers: [],
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
  const colors: LedColor[] = ['#00ffff', '#ff00ff', '#ffff00', '#00ff00', '#ff0000'];
  return Array.from({ length: 5 }, (_, i) => ({
    index: i, name: '', connected: false, active: i === 0, ledColor: colors[i],
  }));
}
