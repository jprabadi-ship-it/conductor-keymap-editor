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
    const root = protobuf.Root.fromJSON(protoJson as protobuf.INamespace);
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

export async function readKeymap(): Promise<any> {
  try {
    debugLog('INF', 'USB', 'Reading keymap from device...');
    const resp = await sendRequest({ keymap: { getKeymap: true } });
    const keymap = resp.keymap?.getKeymap;
    if (keymap) {
      const layerCount = keymap.layers?.length ?? 0;
      debugLog('INF', 'USB', `Keymap received: ${layerCount} layers`);
      return keymap;
    }
    debugLog('WRN', 'USB', 'Empty keymap response');
    return null;
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
