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
const HID_USAGE_MAP: Record<number, string> = {
  0: 'NONE', 4: 'A', 5: 'B', 6: 'C', 7: 'D', 8: 'E', 9: 'F', 10: 'G', 11: 'H', 12: 'I', 13: 'J',
  14: 'K', 15: 'L', 16: 'M', 17: 'N', 18: 'O', 19: 'P', 20: 'Q', 21: 'R', 22: 'S', 23: 'T',
  24: 'U', 25: 'V', 26: 'W', 27: 'X', 28: 'Y', 29: 'Z',
  30: '1', 31: '2', 32: '3', 33: '4', 34: '5', 35: '6', 36: '7', 37: '8', 38: '9', 39: '0',
  40: 'Enter', 41: 'Esc', 42: 'Bksp', 43: 'Tab', 44: 'Space',
  45: '-', 46: '=', 47: '[', 48: ']', 49: '\\', 51: ';', 52: "'", 53: '`', 54: ',', 55: '.', 56: '/',
  57: 'Caps', 58: 'F1', 59: 'F2', 60: 'F3', 61: 'F4', 62: 'F5', 63: 'F6',
  64: 'F7', 65: 'F8', 66: 'F9', 67: 'F10', 68: 'F11', 69: 'F12',
  70: 'PrtSc', 71: 'ScrLk', 72: 'Pause', 73: 'Ins', 74: 'Home', 75: 'PgUp',
  76: 'Del', 77: 'End', 78: 'PgDn', 79: 'Right', 80: 'Left', 81: 'Down', 82: 'Up',
  104: 'F13', 105: 'F14', 106: 'F15', 107: 'F16', 108: 'F17', 109: 'F18',
  110: 'F19', 111: 'F20', 112: 'F21', 113: 'F22', 114: 'F23', 115: 'F24',
  // Modifiers
  224: 'L Ctrl', 225: 'L Shift', 226: 'L Alt', 227: 'L GUI',
  228: 'R Ctrl', 229: 'R Shift', 230: 'R Alt', 231: 'R GUI',
  // Consumer (page 0x0C, offset by 0x10000 in ZMK)
  0x100B5: 'Next', 0x100B6: 'Prev', 0x100B7: 'Stop', 0x100CD: 'Play',
  0x100E2: 'Mute', 0x100E9: 'Vol+', 0x100EA: 'Vol-',
  0x1006F: 'Bri+', 0x10070: 'Bri-',
  // IME
  144: 'LANG1', 145: 'LANG2',
};

function hidToLabel(usage: number): string {
  return HID_USAGE_MAP[usage] || `0x${usage.toString(16).toUpperCase()}`;
}

import { KEYBOARD_LAYOUT } from '../data/layout';

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
      const positions = KEYBOARD_LAYOUT;

      (layer.bindings || []).forEach((binding: any, idx: number) => {
        if (idx >= positions.length) return;
        const pos = positions[idx];
        const beh = behaviorCache[binding.behaviorId];
        const behName = beh?.displayName || '';

        let type = 'basic';
        let label = hidToLabel(binding.param1);
        let keyCode = label;
        const extra: any = {};

        if (behName.includes('Key Press') || behName === 'kp') {
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

        bindings[pos.id] = { type, keyCode, label, ...extra };
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
