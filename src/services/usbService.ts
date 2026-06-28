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
            reject(new Error(`Device error: ${rr.meta.simpleError}`));
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

export async function requestUnlock(): Promise<void> {
  debugLog('INF', 'USB', 'Requesting unlock... Press physical key to confirm.');
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
const KB_USAGE: Record<number, string> = {
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
  144: 'LANG1', 145: 'LANG2',
  224: 'L Ctrl', 225: 'L Shift', 226: 'L Alt', 227: 'L GUI',
  228: 'R Ctrl', 229: 'R Shift', 230: 'R Alt', 231: 'R GUI',
};

// Shift+key → symbol label
const SHIFT_MAP: Record<number, string> = {
  30: '!', 31: '@', 32: '#', 33: '$', 34: '%', 35: '^', 36: '&', 37: '*', 38: '(', 39: ')',
  45: '_', 46: '+', 47: '{', 48: '}', 49: '|', 51: ':', 52: '"', 53: '~', 54: '<', 55: '>', 56: '?',
};

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

  if (page === 0x07 || page === 0x00) {
    const base = KB_USAGE[usage];
    if (mods === 0) return base || `HID:${usage.toString(16)}`;
    if (mods === 0x02 && SHIFT_MAP[usage]) return SHIFT_MAP[usage];
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
        } else if (binding.behaviorId === 0 && binding.param1 === 0 && binding.param2 === 0) {
          type = 'none';
          label = '';
          keyCode = 'NONE';
        }

        bindings[posId] = { type, keyCode, label, ...extra };
      });

      return {
        id: layer.id,
        name: layer.name || `Layer ${layer.id}`,
        bindings,
      };
    });

    return { layers, raw: keymap };
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
    return resp.keymap?.setLayerBinding !== undefined;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setLayerBinding failed: ${e.message}`);
    return false;
  }
}

export async function saveChanges(): Promise<boolean> {
  try {
    debugLog('INF', 'USB', 'Saving changes to device flash...');
    const resp = await sendRequest({ keymap: { saveChanges: true } });
    debugLog('INF', 'USB', 'Changes saved');
    return resp.keymap?.saveChanges !== undefined;
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
      debugLog('INF', 'USB', `Tapping term: ${tt.tappingTerm}ms`);
      return tt.tappingTerm;
    }
    return null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `getTappingTerm failed: ${e.message}`);
    return null;
  }
}

export async function setTappingTerm(ms: number): Promise<boolean> {
  try {
    await sendRequest({ core: { setTappingTerm: { tappingTerm: ms } } });
    debugLog('INF', 'USB', `Tapping term set to ${ms}ms`);
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `setTappingTerm failed: ${e.message}`);
    return false;
  }
}

export async function writeKeymap(_json: string): Promise<boolean> {
  debugLog('WRN', 'USB', 'Full keymap write requires per-binding updates via setLayerBinding');
  return false;
}
