// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nav = navigator as any;

let connectedDevice: any = null;

export async function connectUsb(): Promise<boolean> {
  try {
    if (!nav.usb) throw new Error('WebUSB not supported');
    const device = await nav.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    await device.claimInterface(0);
    connectedDevice = device;
    return true;
  } catch {
    return false;
  }
}

export function isConnected(): boolean {
  return connectedDevice !== null;
}

export function getDevice(): any {
  return connectedDevice;
}

export async function disconnectUsb(): Promise<void> {
  if (connectedDevice) {
    try {
      await connectedDevice.close();
    } catch { /* ignore */ }
    connectedDevice = null;
  }
}

export async function writeToDevice(data: Uint8Array): Promise<boolean> {
  if (!connectedDevice) return false;
  try {
    await connectedDevice.transferOut(1, data);
    return true;
  } catch {
    return false;
  }
}

export async function readFromDevice(length: number): Promise<Uint8Array | null> {
  if (!connectedDevice) return null;
  try {
    const result = await connectedDevice.transferIn(1, length);
    return new Uint8Array(result.data.buffer);
  } catch {
    return null;
  }
}
