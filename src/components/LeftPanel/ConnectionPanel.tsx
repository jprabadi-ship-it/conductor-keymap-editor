import { connectUsb, disconnectUsb } from '../../services/usbService';

interface Props {
  connected: boolean;
  connectionType: 'usb' | 'bluetooth' | null;
  onConnectionChange: (connected: boolean, type: 'usb' | 'bluetooth' | null) => void;
}

export function ConnectionPanel({ connected, connectionType, onConnectionChange }: Props) {
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

  return (
    <div className="connection-panel">
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⚡ USB</span>
      </div>

      <div className="connection-status">
        <span className={`status-dot ${connected ? 'connected' : ''}`} />
        <span>{connected ? `Connected (${connectionType?.toUpperCase()})` : 'Disconnected'}</span>
      </div>

      <button className="connect-btn connect-btn-usb" onClick={handleUsbConnect}>
        ⚡ {connected && connectionType === 'usb' ? 'Disconnect USB' : 'Connect via USB'}
      </button>

      <div className="connection-help">
        USBケーブルで接続してください。Web Serial API（Chrome/Edge）が必要です。
      </div>
    </div>
  );
}
