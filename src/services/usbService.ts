import protobuf from 'protobufjs';
import { debugLog } from '../components/DebugConsole';
import protoJson from '../data/zmk-studio-proto.json';

const SOF = 171;
const EOF = 173;
const ESC = 172;
const BAUD_RATE = 12500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let port: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reader: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let writer: any = null;
let requestId = 0;
let frameCallback: ((data: Uint8Array) => void) | null = null;
let onDisconnectCallback: (() => void) | null = null;

export function onDeviceDisconnect(cb: () => void) {
  onDisconnectCallback = cb;
}

// Protobuf types
let RequestType: protobuf.Type;
let ResponseType: protobuf.Type;

function initProto() {
  if (RequestType) return;
  try {
    const root = protobuf.Root.fromJSON({ nested: protoJson } as protobuf.INamespace);
    RequestType = root.lookupType('zmk.studio.Request');
    ResponseType = root.lookupType('zmk.studio.Response');
    debugLog('INF', 'USB', 'Protobuf schema loaded');
  } catch (e: any) {
    debugLog('ERR', 'USB', `Protobuf init failed: ${e.message}`);
  }
}

// SLIP framing
function encodeFrame(data: Uint8Array): Uint8Array {
  const out: number[] = [SOF];
  for (const byte of data) {
    if (byte === SOF || byte === EOF || byte === ESC) {
      out.push(ESC, byte);
    } else {
      out.push(byte);
    }
  }
  out.push(EOF);
  return new Uint8Array(out);
}

class FrameDecoder {
  private buffer: number[] = [];
  private inFrame = false;
  private escaped = false;

  onData(data: Uint8Array) {
    for (const byte of data) {
      if (this.escaped) {
        this.buffer.push(byte);
        this.escaped = false;
        continue;
      }
      if (byte === ESC) { this.escaped = true; continue; }
      if (byte === EOF && this.inFrame) {
        this.inFrame = false;
        if (this.buffer.length > 0 && frameCallback) {
          frameCallback(new Uint8Array(this.buffer));
        }
        this.buffer = [];
        continue;
      }
      if (byte === SOF) { this.buffer = []; this.inFrame = true; continue; }
      if (this.inFrame) this.buffer.push(byte);
    }
  }
}

const decoder = new FrameDecoder();

// Serial connection
export async function connectUsb(): Promise<boolean> {
  if (!('serial' in navigator)) {
    debugLog('ERR', 'USB', 'Web Serial API is not supported. Use Chrome or Edge.');
    alert('Web Serial API is not supported. Use Chrome or Edge.');
    return false;
  }
  try {
    debugLog('INF', 'USB', 'Requesting serial port...');
    port = await (navigator as any).serial.requestPort({});
    debugLog('INF', 'USB', 'Port selected, opening...');
    await port!.open({ baudRate: BAUD_RATE });
    if (port!.readable && port!.writable) {
      reader = port!.readable.getReader();
      writer = port!.writable.getWriter();
      startReading();
      initProto();
      debugLog('INF', 'USB', `Serial port opened (baud: ${BAUD_RATE})`);
      return true;
    }
    debugLog('ERR', 'USB', 'Port not readable/writable');
    return false;
  } catch (e: any) {
    if (e?.name !== 'NotFoundError') {
      debugLog('ERR', 'USB', `Connection failed: ${e.message || e}`);
    } else {
      debugLog('INF', 'USB', 'User cancelled port selection');
    }
    port = null;
    return false;
  }
}

async function startReading() {
  try {
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) decoder.onData(value);
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      debugLog('ERR', 'USB', `Read error: ${e.message}`);
      reader = null;
      writer = null;
      port = null;
      debugLog('INF', 'USB', 'Connection lost — state reset');
      onDisconnectCallback?.();
    }
  }
}

export function isConnected(): boolean {
  return port !== null;
}

export async function disconnectUsb(): Promise<void> {
  try {
    if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); reader = null; }
    if (writer) { await writer.close().catch(() => {}); writer.releaseLock(); writer = null; }
    if (port) { await port.close().catch(() => {}); port = null; }
    debugLog('INF', 'USB', 'Disconnected');
  } catch (e: any) {
    debugLog('WRN', 'USB', `Disconnect error: ${e.message}`);
  }
}

async function sendRequest(payload: Record<string, unknown>): Promise<any> {
  if (!writer) throw new Error('Not connected');
  initProto();

  const id = ++requestId;
  const msg = RequestType.create({ requestId: id, ...payload });
  const buffer = RequestType.encode(msg).finish();
  const frame = encodeFrame(buffer);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      frameCallback = null;
      reject(new Error('Response timeout'));
    }, 5000);

    frameCallback = (data: Uint8Array) => {
      try {
        const resp = ResponseType.decode(data) as any;
        const rr = resp.requestResponse;
        if (rr && rr.requestId === id) {
          clearTimeout(timeout);
          frameCallback = null;
          if (rr.meta?.simpleError !== undefined && rr.meta?.simpleError !== null) {
            const errNames: Record<number, string> = { 0: 'GENERIC', 1: 'UNLOCK_REQUIRED', 2: 'RPC_NOT_FOUND', 3: 'MSG_DECODE_FAILED', 4: 'MSG_ENCODE_FAILED' };
            const errName = errNames[rr.meta.simpleError] || `code ${rr.meta.simpleError}`;
            debugLog('ERR', 'USB', `Device error: ${errName}`);
            if (rr.meta.simpleError === 1) unlocked = false;
            reject(new Error(`Device error: ${errName}`));
          } else {
            resolve(rr);
          }
        }
      } catch (e: any) {
        debugLog('WRN', 'USB', `Decode error: ${e.message}`);
      }
    };

    writer!.write(frame).catch((e: any) => {
      clearTimeout(timeout);
      frameCallback = null;
      reject(e);
    });
  });
}

// ZMK Studio API
export async function getDeviceInfo(): Promise<{ name: string; firmwareVersion: string } | null> {
  try {
    const resp = await sendRequest({ core: { getDeviceInfo: true } });
    const info = resp.core?.getDeviceInfo;
    if (info) {
      debugLog('INF', 'USB', `Device: ${info.name} (FW: ${info.firmwareVersion})`);
      return { name: info.name, firmwareVersion: info.firmwareVersion };
    }
    return null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getDeviceInfo failed: ${e.message}`);
    return null;
  }
}

export async function getLockState(): Promise<number> {
  try {
    const resp = await sendRequest({ core: { getLockState: true } });
    return resp.core?.getLockState ?? 0;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getLockState failed: ${e.message}`);
    return 0;
  }
}

let unlocked = false;

export function isUnlocked(): boolean {
  return unlocked;
}

export async function requestUnlock(): Promise<boolean> {
  debugLog('INF', 'USB', 'Checking lock state...');
  try {
    const state = await getLockState();
    debugLog('INF', 'USB', `Lock state: ${state} (0=locked, 1=unlocked)`);
    if (state === 1) {
      unlocked = true;
      debugLog('INF', 'USB', 'Device is unlocked');
      return true;
    }
  } catch (e: any) {
    debugLog('WRN', 'USB', `getLockState failed: ${e.message}`);
  }

  // Probe behaviors as fallback
  try {
    const behaviors = await listBehaviors();
    if (behaviors.length > 0) {
      unlocked = true;
      debugLog('INF', 'USB', `Device accessible (${behaviors.length} behaviors). Treating as unlocked.`);
      return true;
    }
  } catch (e: any) {
    debugLog('WRN', 'USB', `Behavior probe failed: ${e.message}`);
  }

  unlocked = false;
  debugLog('WRN', 'USB', 'Device is LOCKED. Press the studio_unlock combo on your keyboard to unlock.');
  return false;
}

// Behavior cache: behaviorId -> { displayName, ... }
const behaviorCache: Record<number, { displayName: string }> = {};

export async function listBehaviors(): Promise<number[]> {
  try {
    const resp = await sendRequest({ behaviors: { listAllBehaviors: true } });
    const ids = resp.behaviors?.listAllBehaviors?.behaviors || [];
    debugLog('INF', 'USB', `Behaviors: ${ids.length} available`);
    return ids;
  } catch (e: any) {
    debugLog('ERR', 'USB', `listBehaviors failed: ${e.message}`);
    return [];
  }
}

export async function getBehaviorDetails(behaviorId: number): Promise<{ displayName: string } | null> {
  if (behaviorCache[behaviorId]) return behaviorCache[behaviorId];
  try {
    const resp = await sendRequest({ behaviors: { getBehaviorDetails: { behaviorId } } });
    const details = resp.behaviors?.getBehaviorDetails;
    if (details) {
      behaviorCache[behaviorId] = { displayName: details.displayName || `b${behaviorId}` };
      return behaviorCache[behaviorId];
    }
    return null;
  } catch {
    return null;
  }
}

// HID Usage Code to key label
// HID keyboard page (0x07) usage codes
const KB_USAGE_US: Record<number, string> = {
  0: 'NONE', 4: 'A', 5: 'B', 6: 'C', 7: 'D', 8: 'E', 9: 'F', 10: 'G', 11: 'H', 12: 'I', 13: 'J',
  14: 'K', 15: 'L', 16: 'M', 17: 'N', 18: 'O', 19: 'P', 20: 'Q', 21: 'R', 22: 'S', 23: 'T',
  24: 'U', 25: 'V', 26: 'W', 27: 'X', 28: 'Y', 29: 'Z',
  30: '1', 31: '2', 32: '3', 33: '4', 34: '5', 35: '6', 36: '7', 37: '8', 38: '9', 39: '0',
  40: 'Enter', 41: 'Esc', 42: 'Bksp', 43: 'Tab', 44: 'Space',
  45: '-', 46: '=', 47: '[', 48: ']', 49: '\\', 50: '#', 51: ';', 52: "'", 53: '`', 54: ',', 55: '.', 56: '/',
  57: 'Caps', 58: 'F1', 59: 'F2', 60: 'F3', 61: 'F4', 62: 'F5', 63: 'F6',
  64: 'F7', 65: 'F8', 66: 'F9', 67: 'F10', 68: 'F11', 69: 'F12',
  70: 'PrtSc', 71: 'ScrLk', 72: 'Pause', 73: 'Ins', 74: 'Home', 75: 'PgUp',
  76: 'Del', 77: 'End', 78: 'PgDn', 79: 'Right', 80: 'Left', 81: 'Down', 82: 'Up',
  83: 'Num Lock',
  84: 'KP /', 85: 'KP *', 86: 'KP -', 87: 'KP +', 88: 'KP Enter',
  89: 'KP 1', 90: 'KP 2', 91: 'KP 3', 92: 'KP 4', 93: 'KP 5',
  94: 'KP 6', 95: 'KP 7', 96: 'KP 8', 97: 'KP 9', 98: 'KP 0', 99: 'KP .',
  100: '\\', 101: 'App',
  104: 'F13', 105: 'F14', 106: 'F15', 107: 'F16', 108: 'F17', 109: 'F18',
  110: 'F19', 111: 'F20', 112: 'F21', 113: 'F22', 114: 'F23', 115: 'F24',
  135: 'INT_RO', 136: 'INT_KANA', 137: 'INT_YEN',
  144: 'LANG1', 145: 'LANG2',
  224: 'L Ctrl', 225: 'L Shift', 226: 'L Alt', 227: 'L GUI',
  228: 'R Ctrl', 229: 'R Shift', 230: 'R Alt', 231: 'R GUI',
};

const SHIFT_MAP_US: Record<number, string> = {
  30: '!', 31: '@', 32: '#', 33: '$', 34: '%', 35: '^', 36: '&', 37: '*', 38: '(', 39: ')',
  45: '_', 46: '+', 47: '{', 48: '}', 49: '|', 51: ':', 52: '"', 53: '~', 54: '<', 55: '>', 56: '?',
};

// JIS overrides (same HID codes, different printed characters)
const KB_USAGE_JIS_OVERRIDE: Record<number, string> = {
  46: '^', 47: '@', 48: '[', 49: ']', 51: ';', 52: ':', 53: '半/全',
  135: '\\', 136: 'カナ', 137: '¥',
};

const SHIFT_MAP_JIS: Record<number, string> = {
  30: '!', 31: '"', 32: '#', 33: '$', 34: '%', 35: '&', 36: "'", 37: '(', 38: ')', 39: '~',
  45: '=', 46: '~', 47: '`', 48: '{', 49: '}', 51: '+', 52: '*', 53: '半/全', 54: '<', 55: '>', 56: '?',
};

let currentLayout: 'us' | 'jis' = 'us';

export function setKeyboardLayout(layout: 'us' | 'jis') {
  currentLayout = layout;
  // Rebuild reverse lookup tables
  rebuildLabelTables();
}

export function getKeyboardLayout(): 'us' | 'jis' {
  return currentLayout;
}

export function relabelBindings(layers: import('../types').Layer[]): import('../types').Layer[] {
  return layers.map((layer, layerIdx) => ({
    ...layer,
    keys: layer.keys.map(k => {
      const raw = rawBindings[`${layer.index}:${k.id}`];
      if (!raw) return k;
      const beh = behaviorCache[raw.behaviorId];
      const behName = beh?.displayName || '';
      if (behName.includes('Key Press') || behName === 'kp') {
        const label = hidToLabel(raw.param1);
        return { ...k, binding: { ...k.binding, label, keyCode: label } };
      }
      if (behName.includes('Mod-Tap') || behName === 'mt') {
        const tapLabel = hidToLabel(raw.param2);
        const label = hidToLabel(raw.param1);
        return { ...k, binding: { ...k.binding, label: tapLabel, tapLabel, keyCode: label } };
      }
      if (behName.includes('Layer-Tap') || behName === 'lt') {
        const tapLabel = hidToLabel(raw.param2);
        return { ...k, binding: { ...k.binding, tapLabel } };
      }
      return k;
    }),
  }));
}

function getKbUsage(): Record<number, string> {
  if (currentLayout === 'jis') {
    return { ...KB_USAGE_US, ...KB_USAGE_JIS_OVERRIDE };
  }
  return KB_USAGE_US;
}

function getShiftMap(): Record<number, string> {
  return currentLayout === 'jis' ? SHIFT_MAP_JIS : SHIFT_MAP_US;
}

// Aliases for backward compat within this file
const KB_USAGE = KB_USAGE_US;

// Consumer page (0x0C)
const CONSUMER_USAGE: Record<number, string> = {
  0x6F: 'Bri+', 0x70: 'Bri-',
  0xB5: 'Next', 0xB6: 'Prev', 0xB7: 'Stop', 0xCD: 'Play',
  0xE2: 'Mute', 0xE9: 'Vol+', 0xEA: 'Vol-',
};

const MOD_BITS: [number, string][] = [
  [0x01, 'C'], [0x02, 'S'], [0x04, 'A'], [0x08, 'G'],
  [0x10, 'RC'], [0x20, 'RS'], [0x40, 'RA'], [0x80, 'RG'],
];

function parseParam(param: number): { mods: number; page: number; usage: number } {
  return {
    mods: (param >> 24) & 0xFF,
    page: (param >> 16) & 0xFF,
    usage: param & 0xFFFF,
  };
}

function modPrefix(mods: number): string {
  const parts: string[] = [];
  for (const [bit, name] of MOD_BITS) {
    if (mods & bit) parts.push(name);
  }
  return parts.length > 0 ? parts.join('+') + '+' : '';
}

function hidToLabel(param: number): string {
  const { mods, page, usage } = parseParam(param);
  const kbUsage = getKbUsage();
  const shiftMap = getShiftMap();

  if (page === 0x07 || page === 0x00) {
    const base = kbUsage[usage];
    if (mods === 0) return base || `HID:${usage.toString(16)}`;
    if (mods === 0x02 && shiftMap[usage]) return shiftMap[usage];
    const prefix = modPrefix(mods);
    return prefix + (base || usage.toString(16));
  }
  if (page === 0x0C) {
    const base = CONSUMER_USAGE[usage] || `Con:${usage.toString(16)}`;
    if (mods === 0) return base;
    return modPrefix(mods) + base;
  }
  return `0x${param.toString(16)}`;
}

// Raw protobuf bindings from last Read, keyed by "layerId:posId"
const rawBindings: Record<string, { behaviorId: number; param1: number; param2: number }> = {};

// Reverse lookup: behavior displayName -> behaviorId
function findBehaviorId(name: string): number | null {
  for (const [id, info] of Object.entries(behaviorCache)) {
    if (info.displayName.toLowerCase().includes(name.toLowerCase())) return Number(id);
  }
  return null;
}

// Reverse lookup tables (rebuilt on layout change)
let LABEL_TO_USAGE: Record<string, number> = {};
let LABEL_TO_SHIFTED: Record<string, number> = {};
const LABEL_TO_CONSUMER: Record<string, number> = {};
for (const [code, label] of Object.entries(CONSUMER_USAGE)) {
  LABEL_TO_CONSUMER[label] = Number(code);
}

function rebuildLabelTables() {
  LABEL_TO_USAGE = {};
  for (const [code, label] of Object.entries(getKbUsage())) {
    LABEL_TO_USAGE[label] = Number(code);
  }
  LABEL_TO_SHIFTED = {};
  for (const [code, label] of Object.entries(getShiftMap())) {
    LABEL_TO_SHIFTED[label] = Number(code);
  }
}
rebuildLabelTables();

// Protobuf bindings array order: row-by-row, left then right per row
const KEY_ORDER = [
  'L00','L01','L02','L03','L04','R00','R01','R02','R03','R04',
  'L10','L11','L12','L13','L14','R10','R11','R12','R13','R14',
  'L20','L21','L22','L23','L24','R20','R21','R22','R23','R24',
  'L30','L31','L32','L33','L34','L35','R30','R31','R32','R33',
];

export async function readKeymap(): Promise<any> {
  try {
    debugLog('INF', 'USB', 'Reading keymap from device...');

    // Get behavior list first
    const behaviorIds = await listBehaviors();
    for (const bid of behaviorIds) {
      await getBehaviorDetails(bid);
    }
    debugLog('INF', 'USB', `Loaded ${Object.keys(behaviorCache).length} behavior details`);

    // Detect macro behaviors (non-standard behaviors)
    const STANDARD_BEHAVIORS = new Set([
      'key press', 'mouse key press', 'mouse_move', 'mouse_scroll',
      'none', 'transparent', 'caps word', 'external power',
      'grave/escape', 'key repeat', 'key toggle', 'output selection',
      'sticky key', 'momentary layer', 'sticky layer', 'studio unlock',
      'reset', 'to layer', 'bluetooth', 'bootloader',
      'layer-tap', 'mod-tap', 'toggle layer', 'toggle scroll invert',
      'enc_key_press',
    ]);
    const firmwareMacros: { id: number; name: string }[] = [];
    for (const [idStr, beh] of Object.entries(behaviorCache)) {
      if (!STANDARD_BEHAVIORS.has(beh.displayName.toLowerCase()) && !beh.displayName.toLowerCase().startsWith('mt_')) {
        firmwareMacros.push({ id: Number(idStr), name: beh.displayName });
      }
    }
    debugLog('INF', 'USB', `Firmware macros found: ${firmwareMacros.length} [${firmwareMacros.map(m => `${m.id}:${m.name}`).join(', ')}]`);
    debugLog('INF', 'USB', `Non-standard check: cache has ${Object.keys(behaviorCache).length} behaviors, standard set has ${STANDARD_BEHAVIORS.size} entries`);
    // Build a set of macro behavior IDs for binding detection
    const macroBehaviorIds = new Set(firmwareMacros.map(m => m.id));

    const resp = await sendRequest({ keymap: { getKeymap: true } });
    const keymap = resp.keymap?.getKeymap;
    if (!keymap) {
      debugLog('WRN', 'USB', 'Empty keymap response');
      return null;
    }

    const layerCount = keymap.layers?.length ?? 0;
    debugLog('INF', 'USB', `Keymap received: ${layerCount} layers`);

    // Convert protobuf keymap to app format
    const layers = keymap.layers.map((layer: any) => {
      const bindings: Record<string, any> = {};

      (layer.bindings || []).forEach((binding: any, idx: number) => {
        if (idx >= KEY_ORDER.length) return;
        const posId = KEY_ORDER[idx];
        const beh = behaviorCache[binding.behaviorId];
        const behName = beh?.displayName || '';

        let type = 'basic';
        let label = hidToLabel(binding.param1);
        let keyCode = label;
        const extra: any = {};

        if (behName.includes('Bluetooth') || behName === 'bt' || behName.includes('bt')) {
          type = 'basic';
          // param1: 0=CLR, 1=NXT, 2=PRV, 3=SEL, 4=CLR_ALL, 5=DISC
          if (binding.param1 === 3) {
            label = `BT ${binding.param2}`;
            keyCode = `BT_SEL ${binding.param2}`;
          } else if (binding.param1 === 0) {
            label = 'BT Clr'; keyCode = 'BT_CLR';
          } else if (binding.param1 === 4) {
            label = 'BT All'; keyCode = 'BT_CLR_ALL';
          } else if (binding.param1 === 1) {
            label = 'BT Nxt'; keyCode = 'BT_NXT';
          } else if (binding.param1 === 2) {
            label = 'BT Prv'; keyCode = 'BT_PRV';
          } else if (binding.param1 === 5) {
            label = 'BT Disc'; keyCode = 'BT_DISC';
          } else {
            label = `BT(${binding.param1},${binding.param2})`;
            keyCode = label;
          }
        } else if (behName.includes('Bootloader') || behName === 'bootloader') {
          type = 'basic'; label = 'Boot'; keyCode = 'BOOTLOADER';
        } else if (behName.includes('Reset') || behName === 'sys_reset') {
          type = 'basic'; label = 'Reset'; keyCode = 'RESET';
        } else if (behName.includes('Output') || behName === 'out') {
          type = 'basic';
          label = binding.param1 === 0 ? 'Out USB' : binding.param1 === 1 ? 'Out BT' : `Out(${binding.param1})`;
          keyCode = label;
        } else if (behName.includes('Scroll Invert') || behName.includes('scrl_inv') || behName.includes('SCRL_INV')) {
          type = 'basic'; label = 'Scrl Inv'; keyCode = 'SCRL_INV';
        } else if (behName.includes('Mouse Key Press') || behName === 'mkp' || behName.includes('mkp')) {
          type = 'basic';
          const mouseMap: Record<number, string> = { 0: 'MB1', 1: 'MB1', 2: 'MB2', 3: 'MB3', 4: 'MB4', 5: 'MB5' };
          label = mouseMap[binding.param1] || `MB${binding.param1}`;
          keyCode = `mkp ${label}`;
        } else if (behName.includes('Key Press') || behName === 'kp') {
          type = 'basic';
        } else if (behName.includes('Mod-Tap') || behName === 'mt') {
          type = 'mod-tap';
          extra.tapLabel = hidToLabel(binding.param2);
          label = extra.tapLabel;
        } else if (behName.includes('Layer-Tap') || behName === 'lt') {
          type = 'layer-tap';
          extra.layer = binding.param1;
          extra.tapLabel = hidToLabel(binding.param2);
          label = extra.tapLabel;
        } else if (behName.includes('Momentary') || behName === 'mo') {
          type = 'momentary';
          extra.layer = binding.param1;
          label = `L${binding.param1}`;
          keyCode = `MO(${binding.param1})`;
        } else if (behName.includes('Toggle') || behName === 'tog') {
          type = 'toggle';
          extra.layer = binding.param1;
          label = `TG${binding.param1}`;
          keyCode = `TG(${binding.param1})`;
        } else if (behName.includes('None') || behName === 'none') {
          type = 'none';
          label = '';
          keyCode = 'NONE';
        } else if (behName.includes('Trans') || behName === 'trans') {
          type = 'trans';
          label = '---';
          keyCode = 'TRANS';
        } else if (macroBehaviorIds.has(binding.behaviorId)) {
          type = 'basic';
          const macroName = behaviorCache[binding.behaviorId]?.displayName || `macro_${binding.behaviorId}`;
          label = `&${macroName}`;
          keyCode = `&${macroName}`;
        } else if (binding.behaviorId === 0 && binding.param1 === 0 && binding.param2 === 0) {
          type = 'none';
          label = '';
          keyCode = 'NONE';
        }

        bindings[posId] = { type, keyCode, label, ...extra };
        rawBindings[`${layer.id}:${posId}`] = { behaviorId: binding.behaviorId, param1: binding.param1, param2: binding.param2 };
        if (layer.id === 0 && (posId === 'L00' || posId === 'L01')) {
          debugLog('INF', 'USB', `  RAW ${posId}: beh=${binding.behaviorId} p1=0x${binding.param1.toString(16)} p2=0x${binding.param2.toString(16)} → "${label}"`);
        }
      });

      const layerName = layer.name && layer.name.length > 0 ? layer.name : `Layer ${layer.id}`;
      debugLog('INF', 'USB', `  Layer ${layer.id}: "${layerName}" (${Object.keys(bindings).length} keys)`);
      return {
        id: layer.id,
        name: layerName,
        bindings,
      };
    });

    return { layers, firmwareMacros, raw: keymap };
  } catch (e: any) {
    debugLog('ERR', 'USB', `Read keymap failed: ${e.message}`);
    return null;
  }
}

export async function setLayerBinding(layerId: number, keyPosition: number, behaviorId: number, param1: number, param2: number): Promise<boolean> {
  try {
    const resp = await sendRequest({
      keymap: {
        setLayerBinding: { layerId, keyPosition, binding: { behaviorId, param1, param2 } },
      },
    });
    const result = resp.keymap?.setLayerBinding;
    const errNames: Record<number, string> = { 0: 'OK', 1: 'INVALID_LOCATION', 2: 'INVALID_BEHAVIOR', 3: 'INVALID_PARAMETERS' };
    if (typeof result === 'number' && result !== 0) {
      debugLog('ERR', 'USB', `setLayerBinding response: ${errNames[result] || result}`);
      return false;
    }
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setLayerBinding failed: ${e.message}`);
    return false;
  }
}

export async function setLayerProps(layerId: number, name: string): Promise<boolean> {
  try {
    const resp = await sendRequest({
      keymap: { setLayerProps: { layerId, name } },
    });
    const result = resp.keymap?.setLayerProps;
    if (typeof result === 'number' && result !== 0) {
      debugLog('ERR', 'USB', `setLayerProps response: ${result}`);
      return false;
    }
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setLayerProps failed: ${e.message}`);
    return false;
  }
}

export async function saveChanges(): Promise<boolean> {
  try {
    debugLog('INF', 'USB', 'Saving changes to device flash...');
    const resp = await sendRequest({ keymap: { saveChanges: true } });
    const saveResp = resp.keymap?.saveChanges;
    if (saveResp?.err !== undefined && saveResp?.err !== null && saveResp.err !== 0) {
      const errNames: Record<number, string> = { 1: 'GENERIC', 2: 'NOT_SUPPORTED', 3: 'NO_SPACE' };
      debugLog('ERR', 'USB', `Save error: ${errNames[saveResp.err] || `code ${saveResp.err}`}`);
      return false;
    }
    debugLog('INF', 'USB', 'Changes saved to flash');
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `Save failed: ${e.message}`);
    return false;
  }
}

export async function discardChanges(): Promise<boolean> {
  try {
    const resp = await sendRequest({ keymap: { discardChanges: true } });
    debugLog('INF', 'USB', 'Changes discarded');
    return resp.keymap?.discardChanges !== undefined;
  } catch (e: any) {
    debugLog('ERR', 'USB', `Discard failed: ${e.message}`);
    return false;
  }
}

export async function getTappingTerm(): Promise<number | null> {
  try {
    const resp = await sendRequest({ core: { getTappingTerm: true } });
    const tt = resp.core?.getTappingTerm;
    if (tt) {
      const ms = tt.tappingTermMs ?? tt.tappingTerm ?? null;
      debugLog('INF', 'USB', `Tapping term: ${ms}ms (default: ${tt.defaultTappingTermMs}ms)`);
      return ms;
    }
    return null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getTappingTerm failed: ${e.message}`);
    return null;
  }
}

export async function setTappingTerm(ms: number): Promise<boolean> {
  try {
    await sendRequest({ core: { setTappingTerm: { tappingTermMs: ms } } });
    debugLog('INF', 'USB', `Tapping term set to ${ms}ms`);
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setTappingTerm failed: ${e.message}`);
    return false;
  }
}

import { Layer } from '../types';

// Pointing (trackball) APIs
export async function getSensitivity(): Promise<{ cpi: number; cursorNum: number; cursorDen: number; scrollNum: number; scrollDen: number; scrollInverted: boolean } | null> {
  try {
    const resp = await sendRequest({ pointing: { getSensitivity: {} } });
    const s = resp.pointing?.getSensitivity;
    if (s) {
      const rawScrollNum = s.scroll?.numerator ?? 1;
      const scrollInverted = rawScrollNum < 0;
      return { cpi: s.cpi, cursorNum: s.cursor?.numerator ?? 1, cursorDen: s.cursor?.denominator ?? 1, scrollNum: Math.abs(rawScrollNum), scrollDen: s.scroll?.denominator ?? 1, scrollInverted };
    }
    return null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getSensitivity failed: ${e.message}`);
    return null;
  }
}

export async function setSensitivity(cpi: number, scrollNum: number, scrollDen: number, scrollInverted: boolean = false): Promise<boolean> {
  try {
    const signedScrollNum = scrollInverted ? -scrollNum : scrollNum;
    await sendRequest({ pointing: { setSensitivity: { cpi, cursor: { numerator: 1, denominator: 1 }, scroll: { numerator: signedScrollNum, denominator: scrollDen } } } });
    debugLog('INF', 'USB', `Sensitivity set: CPI=${cpi}, scroll=${scrollNum}/${scrollDen}, inverted=${scrollInverted}`);
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setSensitivity failed: ${e.message}`);
    return false;
  }
}

export async function getAutoLayer(): Promise<{ enabled: boolean; requirePriorIdleMs: number; excludedPositions: number[]; motionThreshold: number } | null> {
  try {
    const resp = await sendRequest({ pointing: { getAutoLayer: {} } });
    return resp.pointing?.getAutoLayer || null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getAutoLayer failed: ${e.message}`);
    return null;
  }
}

export async function setAutoLayer(enabled: boolean, requirePriorIdleMs: number, excludedPositions: number[], motionThreshold: number): Promise<boolean> {
  try {
    await sendRequest({ pointing: { setAutoLayer: { enabled, requirePriorIdleMs, excludedPositions, motionThreshold } } });
    debugLog('INF', 'USB', `AML set: enabled=${enabled}, idle=${requirePriorIdleMs}ms`);
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setAutoLayer failed: ${e.message}`);
    return false;
  }
}

export async function getPrecisionScale(): Promise<{ numerator: number; denominator: number } | null> {
  try {
    const resp = await sendRequest({ pointing: { getPrecisionScale: {} } });
    return resp.pointing?.getPrecisionScale?.precision || null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getPrecisionScale failed: ${e.message}`);
    return null;
  }
}

export async function setPrecisionScale(numerator: number, denominator: number): Promise<boolean> {
  try {
    await sendRequest({ pointing: { setPrecisionScale: { precision: { numerator, denominator } } } });
    debugLog('INF', 'USB', `Precision set: ${numerator}/${denominator}`);
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setPrecisionScale failed: ${e.message}`);
    return false;
  }
}

export async function getAccel(): Promise<{ enabled: boolean; maxMilli: number; threshold: number; range: number } | null> {
  try {
    const resp = await sendRequest({ pointing: { getAccel: {} } });
    return resp.pointing?.getAccel?.accel || null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getAccel failed: ${e.message}`);
    return null;
  }
}

export async function setAccel(enabled: boolean, maxMilli: number, threshold: number, range: number): Promise<boolean> {
  try {
    await sendRequest({ pointing: { setAccel: { accel: { enabled, maxMilli, threshold, range } } } });
    debugLog('INF', 'USB', `Accel set: enabled=${enabled}, max=${maxMilli}, threshold=${threshold}, range=${range}`);
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setAccel failed: ${e.message}`);
    return false;
  }
}

// --- Macro RPC ---

export interface DeviceMacroSummary {
  id: number;
  name: string;
  stepCount: number;
}

export interface DeviceMacroStep {
  action: 'keyPress' | 'keyRelease' | 'waitMs';
  value: number;
}

export interface DeviceMacroData {
  id: number;
  name: string;
  steps: DeviceMacroStep[];
}

export async function listAllMacros(): Promise<{ macros: DeviceMacroSummary[]; maxMacros: number } | null> {
  try {
    const resp = await sendRequest({ macros: { listAllMacros: true } });
    const data = resp.macros?.listAllMacros;
    if (!data) return null;
    const macros = (data.macros || []).map((m: any) => ({
      id: m.id ?? 0,
      name: m.name ?? '',
      stepCount: m.stepCount ?? 0,
    }));
    debugLog('INF', 'USB', `listAllMacros: ${macros.length} macros (max ${data.maxMacros})`);
    return { macros, maxMacros: data.maxMacros ?? 16 };
  } catch (e: any) {
    debugLog('ERR', 'USB', `listAllMacros failed: ${e.message}`);
    return null;
  }
}

export async function getMacroData(macroId: number): Promise<DeviceMacroData | null> {
  try {
    const resp = await sendRequest({ macros: { getMacroData: { macroId } } });
    const data = resp.macros?.getMacroData;
    if (!data) {
      debugLog('WRN', 'USB', `getMacroData(${macroId}): no response`);
      return null;
    }
    // oneof: check macro field first (protobufjs may show err=0 as default)
    const macro = data.macro;
    if (!macro) {
      debugLog('WRN', 'USB', `getMacroData(${macroId}) error: ${data.err}`);
      return null;
    }
    const steps: DeviceMacroStep[] = (macro.steps || []).map((s: any) => {
      const actionType = s.actionType ?? 1;
      const value = s.value ?? 0;
      if (actionType === 2) return { action: 'keyRelease' as const, value };
      if (actionType === 3) return { action: 'waitMs' as const, value };
      return { action: 'keyPress' as const, value };
    });
    debugLog('INF', 'USB', `getMacroData(${macroId}): "${macro.name}", ${steps.length} steps: ${steps.map(s => `${s.action}=0x${s.value.toString(16)}`).join(', ')}`);
    return { id: macro.id ?? macroId, name: macro.name ?? '', steps };
  } catch (e: any) {
    debugLog('ERR', 'USB', `getMacroData failed: ${e.message}`);
    return null;
  }
}

export async function setMacro(macroId: number, name: string, steps: DeviceMacroStep[]): Promise<boolean> {
  try {
    const protoSteps = steps.map(s => {
      const actionType = s.action === 'keyRelease' ? 2 : s.action === 'waitMs' ? 3 : 1;
      return { actionType, value: s.value };
    });
    const resp = await sendRequest({
      macros: { setMacro: { macro: { id: macroId, name, steps: protoSteps } } }
    });
    const result = resp.macros?.setMacro;
    if (result === 0 || result === 'SET_MACRO_RESP_OK') {
      debugLog('INF', 'USB', `setMacro(${macroId}): OK, ${steps.length} steps saved`);
      return true;
    }
    debugLog('WRN', 'USB', `setMacro(${macroId}) error: ${result}`);
    return false;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setMacro failed: ${e.message}`);
    return false;
  }
}

let freeDeviceMacroSlots: number[] = [];
let macroNameToDeviceId: Record<string, number> = {};

export function getFreeMacroSlots(): number[] {
  return freeDeviceMacroSlots;
}

export function claimFreeMacroSlot(): number | null {
  return freeDeviceMacroSlots.shift() ?? null;
}

export function registerMacroDeviceId(name: string, deviceId: number) {
  macroNameToDeviceId[name] = deviceId;
}

function isDynamicSlot(name: string): boolean {
  return /^m_dyn_\d+$/.test(name);
}

export async function readMacrosFromDevice(): Promise<import('../types').Macro[] | null> {
  try {
    const result = await listAllMacros();
    if (!result || result.macros.length === 0) return null;

    const macros: import('../types').Macro[] = [];
    freeDeviceMacroSlots = [];

    for (const summary of result.macros) {
      const data = await getMacroData(summary.id);

      if (isDynamicSlot(summary.name)) {
        const hasRealSteps = data && data.steps.length > 0 &&
          data.steps.some(s => s.action !== 'waitMs' && s.value !== 0);
        if (!hasRealSteps) {
          freeDeviceMacroSlots.push(summary.id);
          debugLog('INF', 'USB', `Free macro slot: ${summary.name} (id=${summary.id})`);
          continue;
        }
      }

      if (!data) {
        macros.push({ name: summary.name, waitMs: 30, tapMs: 30, bindings: [], deviceId: summary.id });
        continue;
      }

      const bindings: import('../types').MacroStep[] = [];
      for (const step of data.steps) {
        if (step.action === 'waitMs') {
          bindings.push({ action: 'macro_wait_time', ms: step.value });
        } else {
          const label = hidToLabel(step.value);
          const action = step.action === 'keyPress' ? 'macro_press' : 'macro_release';
          bindings.push({ action, behavior: 'kp', param: label });
        }
      }

      // Merge consecutive press+release of same key into tap
      const merged: import('../types').MacroStep[] = [];
      for (let i = 0; i < bindings.length; i++) {
        const cur = bindings[i];
        const next = bindings[i + 1];
        if (cur.action === 'macro_press' && next?.action === 'macro_release' &&
            cur.param === next.param) {
          merged.push({ ...cur, action: 'macro_tap' });
          i++; // skip the release
        } else {
          merged.push(cur);
        }
      }

      macros.push({ name: data.name, waitMs: 30, tapMs: 30, bindings: merged, deviceId: summary.id });
    }
    macroNameToDeviceId = {};
    for (const m of macros) {
      if (m.deviceId !== undefined) {
        macroNameToDeviceId[m.name] = m.deviceId;
      }
    }
    debugLog('INF', 'USB', `readMacrosFromDevice: ${macros.length} macros loaded, ${freeDeviceMacroSlots.length} free slots`);
    return macros;
  } catch (e: any) {
    debugLog('ERR', 'USB', `readMacrosFromDevice failed: ${e.message}`);
    return null;
  }
}

export async function writeMacroToDevice(macroId: number, macro: import('../types').Macro): Promise<boolean> {
  const steps: DeviceMacroStep[] = [];

  for (const step of macro.bindings) {
    if (step.action === 'macro_wait_time') {
      steps.push({ action: 'waitMs', value: step.ms ?? 100 });
    } else {
      const param = labelToParam(step.param || '', step.param || '');
      if (step.action === 'macro_tap') {
        steps.push({ action: 'keyPress', value: param });
        steps.push({ action: 'keyRelease', value: param });
      } else if (step.action === 'macro_press') {
        steps.push({ action: 'keyPress', value: param });
      } else if (step.action === 'macro_release') {
        steps.push({ action: 'keyRelease', value: param });
      }
    }
  }

  return setMacro(macroId, macro.name, steps);
}

const ZMK_TO_USAGE: Record<string, number> = {
  ENTER: 40, ESC: 41, BSPC: 42, DEL: 76, TAB: 43, SPACE: 44, CAPS: 57,
  UP: 82, DOWN: 81, LEFT: 80, RIGHT: 79, HOME: 74, END: 77, PG_UP: 75, PG_DN: 78,
  MINUS: 45, EQUAL: 46, LBKT: 47, RBKT: 48, BSLH: 49, SEMI: 51, SQT: 52,
  GRAVE: 53, COMMA: 54, DOT: 55, FSLH: 56,
  LSHIFT: 225, RSHIFT: 229, LCTRL: 224, RCTRL: 228,
  LALT: 226, RALT: 230, LGUI: 227, RGUI: 231,
  N1: 30, N2: 31, N3: 32, N4: 33, N5: 34, N6: 35, N7: 36, N8: 37, N9: 38, N0: 39,
  LANG1: 144, LANG2: 145, LANG3: 146,
  INT_RO: 135, INT_KANA: 136, INT_YEN: 137,
};

const ZMK_TO_SHIFTED: Record<string, number> = {
  EXCL: 30, AT: 31, HASH: 32, DLLR: 33, PRCNT: 34, CARET: 35,
  AMPS: 36, STAR: 37, LPAR: 38, RPAR: 39,
  PLUS: 46, UNDER: 45, TILDE: 53, PIPE: 49,
};

const ZMK_TO_CONSUMER: Record<string, number> = {
  C_VOL_UP: 0xE9, C_VOL_DN: 0xEA, C_MUTE: 0xE2,
  C_PLAY_PAUSE: 0xCD, C_NEXT: 0xB5, C_PREV: 0xB6,
  C_BRI_UP: 0x6F, C_BRI_DN: 0x70,
};

function labelToParam(label: string, keyCode: string): number {
  // ZMK-style labels from macro editor
  if (ZMK_TO_SHIFTED[label] !== undefined) {
    return (0x02 << 24) | (0x07 << 16) | ZMK_TO_SHIFTED[label];
  }
  if (ZMK_TO_USAGE[label] !== undefined) {
    return (0x07 << 16) | ZMK_TO_USAGE[label];
  }
  if (ZMK_TO_CONSUMER[label] !== undefined) {
    return (0x0C << 16) | ZMK_TO_CONSUMER[label];
  }
  // Check shifted symbols
  if (LABEL_TO_SHIFTED[label] !== undefined) {
    return (0x02 << 24) | (0x07 << 16) | LABEL_TO_SHIFTED[label];
  }
  // Check keyboard usage
  if (LABEL_TO_USAGE[label] !== undefined) {
    return (0x07 << 16) | LABEL_TO_USAGE[label];
  }
  // Check consumer
  if (LABEL_TO_CONSUMER[label] !== undefined) {
    return (0x0C << 16) | LABEL_TO_CONSUMER[label];
  }
  // Mod+key pattern like "C+Up"
  const modMatch = label.match(/^([CSAG+]+)\+(.+)$/);
  if (modMatch) {
    let mods = 0;
    const modStr = modMatch[1];
    if (modStr.includes('C')) mods |= 0x01;
    if (modStr.includes('S')) mods |= 0x02;
    if (modStr.includes('A')) mods |= 0x04;
    if (modStr.includes('G')) mods |= 0x08;
    const baseLabel = modMatch[2];
    const baseUsage = LABEL_TO_USAGE[baseLabel];
    if (baseUsage !== undefined) {
      return (mods << 24) | (0x07 << 16) | baseUsage;
    }
    const consumerUsage = LABEL_TO_CONSUMER[baseLabel];
    if (consumerUsage !== undefined) {
      return (mods << 24) | (0x0C << 16) | consumerUsage;
    }
  }
  return 0;
}

export async function writeKeymapToDevice(layers: Layer[], dirtyKeys?: Set<string>): Promise<boolean> {
  if (!writer) {
    debugLog('ERR', 'USB', 'Not connected');
    return false;
  }

  // Ensure behaviors are loaded
  if (Object.keys(behaviorCache).length === 0) {
    const ids = await listBehaviors();
    for (const bid of ids) await getBehaviorDetails(bid);
  }

  // Build behavior ID map from raw bindings + behavior cache
  const behByType: Record<string, number> = {};
  const matchBeh = (name: string, id: number) => {
    const n = name.toLowerCase();
    // Exact or specific matches first to avoid collisions
    if (!behByType['mkp'] && (n === 'mouse key press' || n === 'mkp')) behByType['mkp'] = id;
    if (!behByType['kp'] && n === 'key press') behByType['kp'] = id;
    if (!behByType['mo'] && (n === 'momentary layer' || n.includes('momentary'))) behByType['mo'] = id;
    if (!behByType['lt'] && (n === 'layer-tap' || n === 'lt')) behByType['lt'] = id;
    if (!behByType['mt'] && (n === 'mod-tap' || n === 'mt')) behByType['mt'] = id;
    if (!behByType['tog'] && (n === 'toggle layer' || n.includes('toggle layer'))) behByType['tog'] = id;
    if (!behByType['none'] && n === 'none') behByType['none'] = id;
    if (!behByType['trans'] && n === 'transparent') behByType['trans'] = id;
    if (!behByType['bt'] && n === 'bluetooth') behByType['bt'] = id;
    if (!behByType['boot'] && n === 'bootloader') behByType['boot'] = id;
  };
  // From raw bindings first (most reliable)
  for (const [, raw] of Object.entries(rawBindings)) {
    const beh = behaviorCache[raw.behaviorId];
    if (beh) matchBeh(beh.displayName, raw.behaviorId);
  }
  // Fallback: scan full behavior cache if rawBindings is empty
  if (Object.keys(behByType).length === 0) {
    for (const [idStr, beh] of Object.entries(behaviorCache)) {
      matchBeh(beh.displayName, Number(idStr));
    }
  }
  // Log all behaviors for debugging
  const allBehaviors = Object.entries(behaviorCache).map(([id, b]) => `${id}:${b.displayName}`);
  debugLog('INF', 'USB', `All behaviors: ${allBehaviors.join(', ')}`);
  debugLog('INF', 'USB', `Behavior IDs: ${JSON.stringify(behByType)}`);

  let written = 0;
  let skipped = 0;

  for (const layer of layers) {
    for (let keyIdx = 0; keyIdx < KEY_ORDER.length; keyIdx++) {
      const posId = KEY_ORDER[keyIdx];
      const key = layer.keys.find(k => k.id === posId);
      if (!key) continue;

      const rawKey = `${layer.index}:${posId}`;
      const raw = rawBindings[rawKey];
      const isDirty = dirtyKeys ? dirtyKeys.has(rawKey) : true;

      // If key wasn't modified by user, skip it entirely
      if (!isDirty) {
        skipped++;
        continue;
      }

      const binding = key.binding;
      let behaviorId = 0;
      let param1 = 0;
      let param2 = 0;

      switch (binding.type) {
        case 'basic':
          if (binding.keyCode?.startsWith('&') && binding.keyCode.length > 1) {
            const macroName = binding.keyCode.substring(1);
            // Check editor macro name → deviceId mapping first
            if (macroNameToDeviceId[macroName] !== undefined) {
              behaviorId = macroNameToDeviceId[macroName];
              debugLog('INF', 'USB', `  Macro: &${macroName} → beh=${behaviorId} (via deviceId)`);
            } else {
              // Fallback: look up by firmware display name
              const macroEntry = Object.entries(behaviorCache).find(([, b]) => b.displayName === macroName);
              if (macroEntry) {
                behaviorId = Number(macroEntry[0]);
                debugLog('INF', 'USB', `  Macro: &${macroName} → beh=${behaviorId}`);
              } else {
                debugLog('ERR', 'USB', `  Macro "&${macroName}" not found in firmware behaviors. Available: ${Object.values(behaviorCache).map(b => b.displayName).filter(n => !['Key Press','None','Transparent','Bluetooth','Bootloader','Momentary Layer','Layer-Tap','Mod-Tap','Toggle Layer','Mouse Key Press'].includes(n)).join(', ')}`);
              }
            }
          } else if (binding.keyCode?.startsWith('BT_SEL')) {
            behaviorId = behByType["bt"] ?? 0;
            param1 = 3;
            param2 = parseInt(binding.keyCode.split(' ').pop() || '0');
          } else if (binding.keyCode === 'BT_CLR') {
            behaviorId = behByType["bt"] ?? 0; param1 = 0;
          } else if (binding.keyCode === 'BT_CLR_ALL') {
            behaviorId = behByType["bt"] ?? 0; param1 = 4;
          } else if (binding.keyCode === 'BOOTLOADER') {
            behaviorId = behByType["boot"] ?? 0;
          } else if (binding.keyCode?.startsWith('mkp')) {
            behaviorId = behByType["mkp"] ?? 0;
            const mbNum = parseInt(binding.label?.replace('MB', '') || '1');
            param1 = mbNum;
          } else {
            behaviorId = behByType["kp"] ?? 0;
            param1 = labelToParam(binding.label, binding.keyCode);
          }
          break;
        case 'momentary':
          behaviorId = behByType["mo"] ?? 0;
          param1 = binding.layer ?? 0;
          break;
        case 'layer-tap':
          behaviorId = behByType["lt"] ?? 0;
          param1 = binding.layer ?? 0;
          param2 = labelToParam(binding.tapLabel || binding.label, binding.tapKeyCode || '');
          break;
        case 'mod-tap':
          behaviorId = behByType["mt"] ?? 0;
          param1 = labelToParam(binding.label, binding.keyCode);
          if (binding.tapLabel) param2 = labelToParam(binding.tapLabel, binding.tapKeyCode || '');
          break;
        case 'toggle':
          behaviorId = behByType["tog"] ?? 0;
          param1 = binding.layer ?? 0;
          break;
        case 'none':
          behaviorId = behByType["none"] ?? 0;
          break;
        case 'trans':
          behaviorId = behByType["trans"] ?? 0;
          break;
        default:
          if (raw) { behaviorId = raw.behaviorId; param1 = raw.param1; param2 = raw.param2; }
          break;
      }

      debugLog('INF', 'USB', `  Write ${posId}@L${layer.index}: beh=${behaviorId} p1=0x${param1.toString(16)} p2=0x${param2.toString(16)}`);

      try {
        await setLayerBinding(layer.index, keyIdx, behaviorId, param1, param2);
        written++;
      } catch (e: any) {
        debugLog('ERR', 'USB', `Failed to write ${posId} on layer ${layer.index}: ${e.message}`);
      }
    }
  }

  debugLog('INF', 'USB', `Write complete: ${written} bindings updated, ${skipped} unchanged`);
  return true;
}
