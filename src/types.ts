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

// Index matches the firmware's rgbled-widget color_names table (0=off..7=white).
// SetLayerPropsRequest.color is this index + 1 (0 is reserved as "no change").
export const LED_COLORS: LedColor[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

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

export type RightPanelTab = 'key-config' | 'trackball' | 'timing' | 'bluetooth' | 'diagnostics' | 'macro-edit';
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
  deviceSettings?: DeviceSettingsSnapshot;
}

export interface GestureBindingSnapshot {
  behaviorId: number;
  param1: number;
  param2: number;
}

// Cursor ratio is intentionally omitted: the app always sends 1/1 for it
// (see setSensitivity in usbService.ts) and there's no UI to change it, so
// it can't diverge from the device default and isn't worth round-tripping.
export interface SensitivitySnapshot {
  cpi: number;
  scrollNum: number;
  scrollDen: number;
  scrollInverted: boolean;
}

export interface DeviceSettingsSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  device?: {
    name?: string;
    firmwareVersion?: string;
  };
  tappingTerm?: number;
  bluetoothProfiles?: {
    profiles: { name: string; connected?: boolean }[];
    activeIndex?: number;
  };
  usbSlots?: {
    slots: { name: string }[];
    activeIndex?: number;
  };
  trackball?: {
    sensitivity?: SensitivitySnapshot;
    autoLayer?: {
      enabled: boolean;
      requirePriorIdleMs: number;
      excludedPositions: number[];
      motionThreshold: number;
      durationMs: number;
    };
    precisionScale?: {
      numerator: number;
      denominator: number;
    };
    accel?: {
      enabled: boolean;
      maxMilli: number;
      threshold: number;
      range: number;
    };
    inertia?: {
      enabled: boolean;
      decayMilli: number;
      startSpeed: number;
    };
    dragScale?: {
      enabled: boolean;
      numerator: number;
      denominator: number;
    };
  };
  trackballProfiles?: {
    conductorSlotCount: number;
    profiles: Array<{
      sensitivity?: SensitivitySnapshot;
      precisionScale?: {
        numerator: number;
        denominator: number;
      };
      accel?: {
        enabled: boolean;
        maxMilli: number;
        threshold: number;
        range: number;
      };
      inertia?: {
        enabled: boolean;
        decayMilli: number;
        startSpeed: number;
      };
      dragScale?: {
        enabled: boolean;
        numerator: number;
        denominator: number;
      };
    }>;
  };
  osConfig?: {
    enabled: boolean;
    osMap: number[];
    endpointCount?: number;
    activeEndpoint?: number;
    activeOs?: number;
  };
  gestureConfig?: {
    enabled: boolean;
    hasOverride: boolean[];
    overrides: GestureBindingSnapshot[];
    endpointCount?: number;
    activeEndpoint?: number;
  };
}
