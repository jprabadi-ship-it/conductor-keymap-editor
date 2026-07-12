import { useEffect, useState } from 'react';
import {
  getAccel,
  getAutoLayer,
  getBleProfiles,
  getDeviceInfo,
  getDragScale,
  getGestureConfig,
  getInertia,
  getOsConfig,
  getRuntimeState,
  getSensitivity,
  getUsbSlots,
  isConnected,
  type RuntimeBatteryState,
} from '../../services/usbService';

type DiagnosticsData = {
  device: Awaited<ReturnType<typeof getDeviceInfo>>;
  runtime: RuntimeBatteryState | null;
  bleProfiles: Awaited<ReturnType<typeof getBleProfiles>>;
  usbSlots: Awaited<ReturnType<typeof getUsbSlots>>;
  sensitivity: Awaited<ReturnType<typeof getSensitivity>>;
  autoLayer: Awaited<ReturnType<typeof getAutoLayer>>;
  accel: Awaited<ReturnType<typeof getAccel>>;
  inertia: Awaited<ReturnType<typeof getInertia>>;
  dragScale: Awaited<ReturnType<typeof getDragScale>>;
  osConfig: Awaited<ReturnType<typeof getOsConfig>>;
  gestureConfig: Awaited<ReturnType<typeof getGestureConfig>>;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', textAlign: 'right', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function boolText(v: boolean | undefined) {
  return v ? 'ON' : 'OFF';
}

function batteryText(v: number | null | undefined) {
  return v === null || v === undefined ? '--' : `${v}%`;
}

export function DiagnosticsPanel() {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<DiagnosticsData | null>(null);

  const load = async () => {
    if (!isConnected()) {
      setData(null);
      setLoaded(true);
      return;
    }
    setLoading(true);
    const [
      device,
      runtime,
      bleProfiles,
      usbSlots,
      sensitivity,
      autoLayer,
      accel,
      inertia,
      dragScale,
      osConfig,
      gestureConfig,
    ] = await Promise.all([
      getDeviceInfo(),
      getRuntimeState(),
      getBleProfiles(),
      getUsbSlots(),
      getSensitivity(),
      getAutoLayer(),
      getAccel(),
      getInertia(),
      getDragScale(),
      getOsConfig(),
      getGestureConfig(),
    ]);
    setData({
      device,
      runtime,
      bleProfiles,
      usbSlots,
      sensitivity,
      autoLayer,
      accel,
      inertia,
      dragScale,
      osConfig,
      gestureConfig,
    });
    setLoading(false);
    setLoaded(true);
  };

  useEffect(() => {
    if (!loaded) load();
  }, [loaded]);

  if (!isConnected()) {
    return (
      <div>
        <div className="config-section">
          <div className="config-label">実機診断</div>
          <div className="config-description">
            接続中のデバイスから現在値を読み出して表示します。USB または BLE で接続してから開いてください。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div className="config-label">実機診断</div>
            <div className="config-description">現在の runtime 状態と保存済み設定をまとめて表示します。</div>
          </div>
          <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => setLoaded(false)} disabled={loading}>
            {loading ? '読込中...' : '再読込'}
          </button>
        </div>
      </div>

      {data && (
        <>
          <div className="config-section">
            <div className="config-label">Device</div>
            <Row label="Name" value={data.device?.name || '--'} />
            <Row label="Firmware" value={data.device?.firmwareVersion || '--'} />
            <Row label="Highest Layer" value={String(data.runtime?.highestLayer ?? '--')} />
            <Row label="Layers Bitmask" value={data.runtime?.activeLayersBitmask !== undefined ? `0x${data.runtime.activeLayersBitmask.toString(16)}` : '--'} />
            <Row label="Active OS" value={String(data.runtime?.activeOs ?? '--')} />
            <Row label="OS Profile" value={boolText(data.runtime?.osProfileEnabled)} />
          </div>

          <div className="config-section">
            <div className="config-label">Battery / Link</div>
            <Row label="Dongle" value={`${batteryText(data.runtime?.central)}${data.runtime?.charging ? ' charging' : ''}`} />
            <Row label="R" value={batteryText(data.runtime?.peripheralR)} />
            <Row label="L" value={batteryText(data.runtime?.peripheralL)} />
            <Row label="BLE Active" value={String(data.bleProfiles?.activeIndex ?? '--')} />
            <Row label="USB Active" value={String(data.usbSlots?.activeIndex ?? '--')} />
          </div>

          <div className="config-section">
            <div className="config-label">Trackball</div>
            <Row label="CPI" value={String(data.sensitivity?.cpi ?? '--')} />
            <Row label="Scroll" value={data.sensitivity ? `${data.sensitivity.scrollNum}/${data.sensitivity.scrollDen}${data.sensitivity.scrollInverted ? ' inverted' : ''}` : '--'} />
            <Row label="AML" value={data.autoLayer ? `${boolText(data.autoLayer.enabled)} idle=${data.autoLayer.requirePriorIdleMs}ms motion=${data.autoLayer.motionThreshold} duration=${data.autoLayer.durationMs}ms` : '--'} />
            <Row label="AML Excluded" value={data.autoLayer ? `[${data.autoLayer.excludedPositions.join(', ')}]` : '--'} />
            <Row label="Accel" value={data.accel ? `${boolText(data.accel.enabled)} max=${(data.accel.maxMilli / 1000).toFixed(1)}x start=${data.accel.threshold} ramp=${data.accel.range}` : '--'} />
            <Row label="Inertia" value={data.inertia ? `${boolText(data.inertia.enabled)} decay=${data.inertia.decayMilli} start=${data.inertia.startSpeed}` : '--'} />
            <Row label="Drag Scale" value={data.dragScale ? `${boolText(data.dragScale.enabled)} ${data.dragScale.numerator}/${data.dragScale.denominator}` : '--'} />
          </div>

          <div className="config-section">
            <div className="config-label">Profiles</div>
            <Row label="BLE Slots" value={data.bleProfiles ? data.bleProfiles.profiles.map((p, i) => `${i}:${p.name}${p.connected ? '*' : ''}`).join('  ') || '--' : '--'} />
            <Row label="USB Slots" value={data.usbSlots ? data.usbSlots.slots.map((s, i) => `${i}:${s.name}`).join('  ') || '--' : '--'} />
            <Row label="OS Overlay" value={data.osConfig ? `${boolText(data.osConfig.enabled)} map=[${data.osConfig.osMap.join(', ')}] activeEndpoint=${data.osConfig.activeEndpoint}` : '--'} />
            <Row label="Gesture Override" value={data.gestureConfig ? `${boolText(data.gestureConfig.enabled)} overrides=${data.gestureConfig.hasOverride.filter(Boolean).length} activeEndpoint=${data.gestureConfig.activeEndpoint}` : '--'} />
          </div>
        </>
      )}

      <div className="save-note">
        この画面は読み取り専用です。値は現在の接続先と、そのデバイスに保存済みの設定から取得しています。
      </div>
    </div>
  );
}
