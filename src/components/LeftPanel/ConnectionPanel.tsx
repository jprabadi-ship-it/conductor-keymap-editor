import { useEffect, useState } from 'react';
import { connectUsb, disconnectUsb, getRuntimeState, RuntimeBatteryState } from '../../services/usbService';

interface Props {
  connected: boolean;
  connectionType: 'usb' | 'bluetooth' | null;
  onConnectionChange: (connected: boolean, type: 'usb' | 'bluetooth' | null) => void;
}

const BATTERY_POLL_MS = 30000;

function BatteryPill({ label, value, charging }: { label: string; value: number | null; charging?: boolean }) {
  const color = value === null ? 'var(--text-muted)' : value <= 20 ? 'var(--danger)' : 'var(--text-secondary)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 44 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>
        {value === null ? '—' : `${value}%${charging ? ' ⚡' : ''}`}
      </span>
    </div>
  );
}

export function ConnectionPanel({ connected, connectionType, onConnectionChange }: Props) {
  const [battery, setBattery] = useState<RuntimeBatteryState | null>(null);

  const handleUsbConnect = async () => {
    if (connected) {
      await disconnectUsb();
      onConnectionChange(false, null);
      return;
    }
    const success = await connectUsb();
    if (success) {
      onConnectionChange(true, 'usb');
    }
  };

  // Battery isn't pushed by the device, so poll while connected -- a fresh
  // read on connect plus a slow refresh is enough for a comfort indicator.
  useEffect(() => {
    if (!connected) {
      setBattery(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const state = await getRuntimeState();
      if (!cancelled && state) setBattery(state);
    };
    poll();
    const interval = setInterval(poll, BATTERY_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected]);

  return (
    <div className="connection-panel">
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⚡ USB</span>
      </div>

      <div className="connection-status">
        <span className={`status-dot ${connected ? 'connected' : ''}`} />
        <span>{connected ? `Connected (${connectionType?.toUpperCase()})` : 'Disconnected'}</span>
      </div>

      {connected && battery && (
        <div style={{ display: 'flex', justifyContent: 'space-around', margin: '8px 0', padding: '8px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <BatteryPill label="L" value={battery.peripheralL} />
          <BatteryPill label="Dongle" value={battery.central} charging={battery.charging} />
          <BatteryPill label="R" value={battery.peripheralR} />
        </div>
      )}

      <button className="connect-btn connect-btn-usb" onClick={handleUsbConnect}>
        ⚡ {connected && connectionType === 'usb' ? 'Disconnect USB' : 'Connect via USB'}
      </button>

      <div className="connection-help">
        USBケーブルで接続してください。Web Serial API（Chrome/Edge）が必要です。
      </div>
    </div>
  );
}
