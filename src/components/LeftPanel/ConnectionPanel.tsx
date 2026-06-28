import { useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nav = navigator as any;

export function ConnectionPanel() {
  const [connected, setConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<'usb' | 'bluetooth' | null>(null);

  const handleUsbConnect = async () => {
    try {
      if (!nav.usb) {
        alert('WebUSB is not supported in this browser.');
        return;
      }
      const device = await nav.usb.requestDevice({ filters: [] });
      await device.open();
      setConnected(true);
      setConnectionType('usb');
    } catch {
      // user cancelled or error
    }
  };

  const handleBluetoothConnect = async () => {
    try {
      if (!nav.bluetooth) {
        alert('Web Bluetooth is not supported in this browser.');
        return;
      }
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [],
      });
      if (device) {
        setConnected(true);
        setConnectionType('bluetooth');
      }
    } catch {
      // user cancelled or error
    }
  };

  return (
    <div className="connection-panel">
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⚡ USB</span>
        <a href="/firmware-guide" className="fw-guide-link">📖 FW Guide</a>
      </div>

      <div className="connection-status">
        <span className={`status-dot ${connected ? 'connected' : ''}`} />
        <span>{connected ? `Connected (${connectionType?.toUpperCase()})` : 'Disconnected'}</span>
      </div>

      <button className="connect-btn connect-btn-usb" onClick={handleUsbConnect}>
        ⚡ Connect via USB
      </button>
      <button className="connect-btn connect-btn-bt" onClick={handleBluetoothConnect}>
        ⇄ Connect via Bluetooth
      </button>

      <div className="connection-help">
        USBケーブルまたはBluetoothで接続してください。
        Bluetooth接続時は「Q」「A」「Z」を同時押しするとペアリング候補に表示されます。
      </div>
    </div>
  );
}
