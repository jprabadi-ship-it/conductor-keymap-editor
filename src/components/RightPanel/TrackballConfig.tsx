import { useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';

interface Props {
  store: KeymapStore;
}

const CPI_PRESETS = [200, 400, 600, 800, 1200, 1600, 2400, 3200];
const SCROLL_PRESETS = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0];
const PRECISION_PRESETS = [
  { label: '1/8', value: 0.125 }, { label: '1/4', value: 0.25 },
  { label: '1/3', value: 0.33 }, { label: '1/2', value: 0.5 },
  { label: '2/3', value: 0.67 }, { label: '3/4', value: 0.75 },
  { label: '4/5', value: 0.8 }, { label: '9/10', value: 0.9 },
];
const ACCEL_OPTIONS = [
  { label: 'オフ', value: 0 }, { label: '弱', value: 1 },
  { label: '中', value: 2 }, { label: '強', value: 3 },
];

const DIRECTION_LABELS: Record<string, { icon: string; label: string }> = {
  up: { icon: '↑', label: '上' },
  left: { icon: '←', label: '左' },
  right: { icon: '→', label: '右' },
  down: { icon: '↓', label: '下' },
};

export function TrackballConfig({ store }: Props) {
  const [amlEnabled, setAmlEnabled] = useState(true);
  const [amlTimeout, setAmlTimeout] = useState(300);
  const [amlMinDistance, setAmlMinDistance] = useState(0);
  const [cpi, setCpi] = useState(800);
  const [scrollSensitivity, setScrollSensitivity] = useState(1.0);
  const [scrollDirection, setScrollDirection] = useState<'normal' | 'inverted'>('normal');
  const [precisionSensitivity, setPrecisionSensitivity] = useState(0.25);
  const [accelMode, setAccelMode] = useState(1);
  const [realtimePreview, setRealtimePreview] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [accelMaxRatio, setAccelMaxRatio] = useState(1.2);
  const [accelStartSpeed, setAccelStartSpeed] = useState(10);
  const [accelRampWidth, setAccelRampWidth] = useState(28);

  return (
    <div>
      {/* Trackball Settings */}
      <div className="config-section">
        <div className="config-label">トラックボール設定</div>
      </div>

      {/* AML */}
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13 }}>Auto Mouse Layer (AML)</span>
          <div className="btn-group">
            <button className={`btn ${!amlEnabled ? 'btn-active' : ''}`} onClick={() => setAmlEnabled(false)}>OFF</button>
            <button className={`btn ${amlEnabled ? 'btn-active' : ''}`} onClick={() => setAmlEnabled(true)} style={amlEnabled ? { background: 'var(--success)', color: 'white' } : {}}>ON</button>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>AML 発動待機時間</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{amlTimeout}ms</span>
          </div>
          <input type="range" className="timing-slider" min={0} max={1000} step={10} value={amlTimeout} onChange={e => setAmlTimeout(Number(e.target.value))} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>0ms</span><span>1000ms</span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>AML 最低移動距離</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{amlMinDistance}</span>
          </div>
          <input type="range" className="timing-slider" min={0} max={200} step={1} value={amlMinDistance} onChange={e => setAmlMinDistance(Number(e.target.value))} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>0</span><span>200</span>
          </div>
        </div>

        <button className="btn btn-outline" style={{ width: '100%', fontSize: 12, marginBottom: 8 }}>AML設定を適用</button>

        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>Excluded Positions</span>
            <button className="btn" style={{ fontSize: 10, padding: '0 6px', color: 'var(--accent)' }}>更新</button>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {store.amlExcluded.map((pos, i) => {
              const posIndex = store.selectedLayer?.keys.findIndex(k => k.id === pos) ?? -1;
              return <span key={i} className="preset-btn" style={{ fontSize: 11, padding: '2px 8px' }}>{posIndex >= 0 ? posIndex : pos}</span>;
            })}
          </div>
        </div>
      </div>

      {/* Gesture Shortcuts */}
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="config-label" style={{ margin: 0 }}>ジェスチャショートカット</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Layer {store.gestures[0]?.layer ?? 13}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {(['up', 'left', 'right', 'down'] as const).map(dir => {
            const g = store.gestures.find(ge => ge.direction === dir);
            const dl = DIRECTION_LABELS[dir];
            return (
              <button key={dir} className="btn btn-outline" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px', fontSize: 11, gap: 2 }}>
                <span style={{ color: 'var(--text-muted)' }}>{dl.icon} {dl.label}</span>
                <span style={{ fontWeight: 600 }}>{g?.label || '---'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Realtime Preview */}
      <div className="config-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setRealtimePreview(!realtimePreview)}
            style={{
              width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: realtimePreview ? 'var(--success)' : 'var(--bg-hover)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: realtimePreview ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%', background: 'white',
              transition: 'left 0.2s',
            }} />
          </button>
          <span style={{ fontSize: 12 }}>リアルタイムプレビュー</span>
        </div>
      </div>

      {/* CPI */}
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
          <span>カーソル感度 (CPI)</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>{cpi}</span>
        </div>
        <input type="range" className="timing-slider" min={200} max={3200} step={100} value={cpi} onChange={e => setCpi(Number(e.target.value))} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>200</span><span>3200</span>
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
          {CPI_PRESETS.map(p => (
            <button key={p} className={`preset-btn ${cpi === p ? 'selected' : ''}`} onClick={() => setCpi(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* Scroll Sensitivity */}
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
          <span>スクロール感度</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>{scrollSensitivity.toFixed(2)}x</span>
        </div>
        <input type="range" className="timing-slider" min={0.25} max={4} step={0.25} value={scrollSensitivity} onChange={e => setScrollSensitivity(Number(e.target.value))} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>0.25x</span><span>4x</span>
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
          {SCROLL_PRESETS.map(p => (
            <button key={p} className={`preset-btn ${scrollSensitivity === p ? 'selected' : ''}`} onClick={() => setScrollSensitivity(p)}>{p}x</button>
          ))}
        </div>
      </div>

      {/* Scroll Direction */}
      <div className="config-section">
        <div style={{ fontSize: 12, marginBottom: 4 }}>スクロール方向</div>
        <div className="btn-group">
          <button className={`btn ${scrollDirection === 'normal' ? 'btn-active' : ''}`} onClick={() => setScrollDirection('normal')} style={scrollDirection === 'normal' ? { background: 'var(--success)', color: 'white' } : {}}>↑ 標準</button>
          <button className={`btn ${scrollDirection === 'inverted' ? 'btn-active' : ''}`} onClick={() => setScrollDirection('inverted')}>↓ 反転</button>
        </div>
      </div>

      {/* Precision Mode Sensitivity */}
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
          <span>精密モード感度</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>{precisionSensitivity.toFixed(2)}x</span>
        </div>
        <div className="config-description">
          Precision レイヤー（13番目）がONの間、カーソル速度がこの倍率になります。製図など細かい操作向け。1.0 で等倍。
        </div>
        <input type="range" className="timing-slider" min={0.1} max={1.0} step={0.05} value={precisionSensitivity} onChange={e => setPrecisionSensitivity(Number(e.target.value))} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>0.10x</span><span>1.00x</span>
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
          {PRECISION_PRESETS.map(p => (
            <button key={p.label} className={`preset-btn ${Math.abs(precisionSensitivity - p.value) < 0.01 ? 'selected' : ''}`} onClick={() => setPrecisionSensitivity(p.value)}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Mouse Acceleration */}
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
          <span>マウス加速度</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>最大 {accelMode === 0 ? 'オフ' : accelMode === 1 ? '1.2x' : accelMode === 2 ? '1.5x' : '2.0x'}</span>
        </div>
        <div className="config-description">
          速く動かすほどカーソルが加速します。ゆっくり動かした時の精度は保ったまま、大きく動かす時の移動量を増やせます（精密モード中は無効）。
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {ACCEL_OPTIONS.map(opt => (
            <button key={opt.value} className={`preset-btn ${accelMode === opt.value ? 'selected' : ''}`} onClick={() => setAccelMode(opt.value)}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Acceleration Curve Graph */}
      {accelMode > 0 && (
        <div className="config-section">
          <svg viewBox="0 0 200 80" style={{ width: '100%', height: 80, background: 'var(--bg-secondary)', borderRadius: 4 }}>
            <line x1="10" y1="70" x2="190" y2="70" stroke="var(--border)" strokeWidth="0.5" />
            <line x1="10" y1="10" x2="10" y2="70" stroke="var(--border)" strokeWidth="0.5" />
            {[1.0, 1.5, 2.0].map((v, i) => (
              <text key={i} x="6" y={70 - ((v - 1) / (accelMaxRatio - 0.8)) * 55} fill="var(--text-muted)" fontSize="6" textAnchor="end">{v.toFixed(1)}x</text>
            ))}
            <text x="190" y="78" fill="var(--text-muted)" fontSize="6" textAnchor="end">速く動かす →</text>
            <path
              d={`M 10,70 ${Array.from({ length: 18 }, (_, i) => {
                const x = 10 + (i + 1) * 10;
                const speed = (i + 1) / 18;
                const t = Math.max(0, (speed - accelStartSpeed / 100) / (accelRampWidth / 100));
                const ratio = 1 + (accelMaxRatio - 1) * Math.min(1, t * t / (1 + t * t));
                const y = 70 - ((ratio - 1) / (accelMaxRatio - 0.8)) * 55;
                return `L ${x},${Math.max(10, y)}`;
              }).join(' ')}`}
              fill="none" stroke="var(--info)" strokeWidth="1.5"
            />
          </svg>
        </div>
      )}

      {/* Advanced */}
      <div className="config-section">
        <button className="btn btn-outline" style={{ width: '100%', fontSize: 12 }} onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? '▼' : '▶'} 詳細設定
        </button>
        {showAdvanced && (
          <div style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span>最大倍率</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{accelMaxRatio.toFixed(1)}x</span>
              </div>
              <input type="range" className="timing-slider" min={1.0} max={3.0} step={0.1} value={accelMaxRatio} onChange={e => setAccelMaxRatio(Number(e.target.value))} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span>効き始める速度</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{accelStartSpeed}</span>
              </div>
              <input type="range" className="timing-slider" min={0} max={50} step={1} value={accelStartSpeed} onChange={e => setAccelStartSpeed(Number(e.target.value))} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span>立ち上がりの幅</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{accelRampWidth}</span>
              </div>
              <input type="range" className="timing-slider" min={1} max={100} step={1} value={accelRampWidth} onChange={e => setAccelRampWidth(Number(e.target.value))} />
            </div>
          </div>
        )}
      </div>

      {/* Save / Reset / Default */}
      <div className="save-actions" style={{ flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }}>💾 保存</button>
          <button className="btn btn-outline" style={{ flex: 1 }}>元に戻す</button>
          <button className="btn btn-outline" style={{ flex: 1 }}>初期値</button>
        </div>
        <button className="btn btn-outline" style={{ width: '100%', fontSize: 12 }}>再読込</button>
      </div>
      <div className="save-note">
        スライダーを動かすとリアルタイムで反映されます。「保存」でFlashに永続化してください。
      </div>
    </div>
  );
}
