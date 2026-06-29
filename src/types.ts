export type BindingType = 'basic' | 'mod-tap' | 'layer-tap' | 'momentary' | 'toggle' | 'to-layer' | 'trans' | 'none';

export type Modifier = 'lshift' | 'lctrl' | 'lalt' | 'lgui' | 'rshift' | 'rctrl' | 'ralt' | 'rgui';

export interface KeyBinding {
  type: BindingType;
  keyCode: string;
  label: string;
  modifiers?: Modifier[];
  layer?: number;
  tapKeyCode?: string;
  tapLabel?: string;
}

export type LedColor = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';

export interface KeyConfig {
  id: string; // e.g. "L00", "R03"
  binding: KeyBinding;
}

export interface Layer {
  name: string;
  index: number;
  ledColor: LedColor;
  isProtected: boolean;
  keys: KeyConfig[];
}

export interface Combo {
  id: string;
  name: string;
  keyPositions: string[];
  binding: KeyBinding;
  timeoutMs: number;
  layers: number[];
  suppressAml?: boolean;
}

export interface GestureShortcut {
  direction: 'up' | 'down' | 'left' | 'right';
  keyCode: string;
  label: string;
  layer: number;
}

export interface BluetoothProfile {
  index: number;
  name: string;
  connected: boolean;
  active: boolean;
  ledColor: LedColor;
}

export type MacroAction = 'macro_tap' | 'macro_press' | 'macro_release' | 'macro_wait_time';

export interface MacroStep {
  action: MacroAction;
  behavior?: string;
  param?: string;
  ms?: number;
}

export interface Macro {
  name: string;
  waitMs: number;
  tapMs: number;
  bindings: MacroStep[];
  deviceId?: number;
}

export type OsLayout = 'us' | 'jis';

export type RightPanelTab = 'key-config' | 'trackball' | 'timing' | 'bluetooth' | 'macro-edit';
export type LeftPanelTab = 'layers' | 'combos' | 'macros';

export interface KeymapProject {
  layers: Layer[];
  combos: Combo[];
  macros: Macro[];
  osLayout: OsLayout;
  tappingTerm: number;
  gestures: GestureShortcut[];
  bluetoothProfiles: BluetoothProfile[];
  amlExcluded?: string[];
}
