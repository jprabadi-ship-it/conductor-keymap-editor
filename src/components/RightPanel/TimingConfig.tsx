import { useEffect, useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { isConnected, isUnlocked, requestUnlock, getTappingTerm, setTappingTerm, saveChanges } from '../../services/usbService';
import { debugLog } from '../DebugConsole';

interface Props {
  store: KeymapStore;
}

const PRESETS = [150, 175, 200, 250, 300];

export function TimingConfig({ store }: Props) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isConnected() || loaded) return;
    (async () => {
      const tt = await getTappingTerm();
      if (tt !== null) {
        store.setTappingTerm(tt);
        debugLog('INF', 'Timing', `Loaded tapping term: ${tt}ms`);
      }
      setLoaded(true);
    })();
  }, [loaded]);

  const handleSave = async () => {
    if (!isConnected()) { debugLog('WRN', 'Timing', 'Not connected'); return; }
    if (!isUnlocked() && !(await requestUnlock())) {
      alert('デバイスがロックされています');
      return;
    }
    const ok = await setTappingTerm(store.tappingTerm);
    if (ok) {
      await saveChanges();
      debugLog('INF', 'Timing', `Tapping term saved: ${store.tappingTerm}ms`);
    }
  };

  return (
    <div>
      <div className="config-section">
        <div className="config-label">長押し判定時間</div>
        <div className="config-description">
          キーを押してからホールド（レイヤー切替・修飾キー）と判定するまでの時間を設定します。
          短いほど反応が速く、長いほどタップが安定します。
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Tapping Term</div>
        <div className="timing-value">
          {store.tappingTerm}<span className="timing-unit">ms</span>
        </div>

        <input
          type="range"
          className="timing-slider"
          min={100}
          max={400}
          step={5}
          value={store.tappingTerm}
          onChange={e => store.setTappingTerm(Number(e.target.value))}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>100ms（速い）</span>
          <span>400ms（遅い）</span>
        </div>
      </div>

      <div className="config-section">
        <div className="config-label">プリセット</div>
        <div className="timing-presets">
          {PRESETS.map(p => (
            <button
              key={p}
              className={`preset-btn ${store.tappingTerm === p ? 'selected' : ''}`}
              onClick={() => store.setTappingTerm(p)}
            >{p}ms</button>
          ))}
        </div>
      </div>

      <div className="save-actions">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave}>デバイスに保存</button>
        <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setLoaded(false)}>再読込</button>
      </div>
      <div className="save-note">
        この設定はデバイスのFlashメモリに保存され、再起動後も維持されます。
        全てのlayer-tapキーとmod-tapキーに適用されます。
      </div>
    </div>
  );
}
