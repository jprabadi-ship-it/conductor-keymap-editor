import { debugLog } from '../components/DebugConsole';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nav = navigator as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let device: any = null;
let interfaceNum = 0;
let endpointIn = 0;
let endpointOut = 0;

export async function connectUsb(): Promise<boolean> {
  try {
    if (!nav.usb) {
      debugLog('ERR', 'USB', 'WebUSB is not supported in this browser');
      return false;
    }
    device = await nav.usb.requestDevice({ filters: [] });
    debugLog('INF', 'USB', `Selected device: ${device.productName || device.serialNumber || 'Unknown'}`);

    await device.open();
    debugLog('INF', 'USB', `Device opened. Configurations: ${device.configurations?.length}`);

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    // Find the right interface and endpoints
    const config = device.configuration;
    let found = false;
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const epIn = alt.endpoints.find((e: any) => e.direction === 'in');
        const epOut = alt.endpoints.find((e: any) => e.direction === 'out');
        if (epIn && epOut) {
          interfaceNum = iface.interfaceNumber;
          endpointIn = epIn.endpointNumber;
          endpointOut = epOut.endpointNumber;
          found = true;
          debugLog('INF', 'USB', `Interface ${interfaceNum}: IN endpoint ${endpointIn}, OUT endpoint ${endpointOut} (${alt.interfaceClass}/${alt.interfaceSubclass})`);
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      // Try first interface with any endpoint
      const iface = config.interfaces[0];
      if (iface) {
        interfaceNum = iface.interfaceNumber;
        const alt = iface.alternates[0];
        const eps = alt?.endpoints || [];
        debugLog('WRN', 'USB', `No bidirectional interface found. Interface ${interfaceNum} has ${eps.length} endpoints`);
        eps.forEach((ep: any) => {
          debugLog('INF', 'USB', `  Endpoint ${ep.endpointNumber}: ${ep.direction}, type=${ep.type}, packetSize=${ep.packetSize}`);
        });
        const epIn = eps.find((e: any) => e.direction === 'in');
        const epOut = eps.find((e: any) => e.direction === 'out');
        if (epIn) endpointIn = epIn.endpointNumber;
        if (epOut) endpointOut = epOut.endpointNumber;
      }
    }

    await device.claimInterface(interfaceNum);
    debugLog('INF', 'USB', `Claimed interface ${interfaceNum}`);
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `Connection failed: ${e.message || e}`);
    device = null;
    return false;
  }
}

export function isConnected(): boolean {
  return device !== null;
}

export async function disconnectUsb(): Promise<void> {
  if (device) {
    try {
      await device.releaseInterface(interfaceNum);
      await device.close();
      debugLog('INF', 'USB', 'Device disconnected');
    } catch (e: any) {
      debugLog('WRN', 'USB', `Disconnect error: ${e.message}`);
    }
    device = null;
  }
}

export async function sendCommand(cmd: string): Promise<Uint8Array | null> {
  if (!device) {
    debugLog('ERR', 'USB', 'No device connected');
    return null;
  }

  try {
    const encoded = new TextEncoder().encode(cmd + '\n');
    debugLog('INF', 'USB', `Sending command: ${cmd} (${encoded.length} bytes, endpoint ${endpointOut})`);

    if (endpointOut > 0) {
      await device.transferOut(endpointOut, encoded);
    } else {
      // Use control transfer as fallback
      await device.controlTransferOut({
        requestType: 'vendor',
        recipient: 'interface',
        request: 0x01,
        value: 0,
        index: interfaceNum,
      }, encoded);
    }

    debugLog('INF', 'USB', 'Command sent, waiting for response...');

    // Read response
    if (endpointIn > 0) {
      const chunks: Uint8Array[] = [];
      let totalLen = 0;
      const maxWait = 3000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        try {
          const result = await Promise.race([
            device.transferIn(endpointIn, 4096),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
          ]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chunk = new Uint8Array((result as any).data.buffer);
          chunks.push(chunk);
          totalLen += chunk.length;
          debugLog('INF', 'USB', `Received chunk: ${chunk.length} bytes (total: ${totalLen})`);

          // Check if we got a complete JSON response
          const combined = concatArrays(chunks);
          const text = new TextDecoder().decode(combined);
          if (text.includes('\n') || (text.startsWith('{') && text.endsWith('}'))) {
            debugLog('INF', 'USB', `Response complete: ${totalLen} bytes`);
            return combined;
          }
        } catch {
          if (chunks.length > 0) break;
        }
      }

      if (chunks.length > 0) {
        return concatArrays(chunks);
      }
    }

    debugLog('WRN', 'USB', 'No response received');
    return null;
  } catch (e: any) {
    debugLog('ERR', 'USB', `Command failed: ${e.message || e}`);
    return null;
  }
}

export async function readKeymap(): Promise<string | null> {
  const data = await sendCommand('READ');
  if (!data) return null;
  const text = new TextDecoder().decode(data).trim();
  debugLog('INF', 'USB', `Read response: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
  return text;
}

export async function writeKeymap(json: string): Promise<boolean> {
  try {
    if (!device || endpointOut === 0) {
      debugLog('ERR', 'USB', 'No device or output endpoint');
      return false;
    }
    const payload = 'WRITE\n' + json + '\n';
    const encoded = new TextEncoder().encode(payload);
    debugLog('INF', 'USB', `Writing keymap: ${encoded.length} bytes`);
    await device.transferOut(endpointOut, encoded);
    debugLog('INF', 'USB', 'Write complete');
    return true;
  } catch (e: any) {
    debugLog('ERR', 'USB', `Write failed: ${e.message || e}`);
    return false;
  }
}

function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
