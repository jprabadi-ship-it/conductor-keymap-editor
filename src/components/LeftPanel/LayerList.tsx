import { useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { LedColor } from '../../types';

interface Props {
  store: KeymapStore;
}

const LED_COLORS: LedColor[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const LED_CSS: Record<LedColor, string> = {
  black: 'var(--led-black)', red: 'var(--led-red)', green: 'var(--led-green)',
  yellow: 'var(--led-yellow)', blue: 'var(--led-blue)', magenta: 'var(--led-magenta)',
  cyan: 'var(--led-cyan)', white: 'var(--led-white)',
};

export function LayerList({ store }: Props) {
  const [ledPickerLayer, setLedPickerLayer] = useState<number | null>(null);

  return (
    <div>
      <div className="panel-section-title">
        <span>Layers</span>
        <button className="btn" onClick={store.addLayer} style={{ fontSize: 16, padding: '0 4px' }}>+</button>
      </div>

      {store.layers.map((layer) => (
        <div
          key={layer.index}
          className={`layer-item ${store.selectedLayerIndex === layer.index ? 'selected' : ''}`}
          onClick={() => store.setSelectedLayerIndex(layer.index)}
        >
          <span className="led-dot" style={{ background: LED_CSS[layer.ledColor] }} />
          <span className="layer-name">{layer.name}</span>
          <span className="layer-index">{layer.index}</span>
          <span className="led-label">LED</span>
          <button
            className="btn"
            style={{ padding: '0 4px', position: 'relative' }}
            onClick={(e) => {
              e.stopPropagation();
              setLedPickerLayer(ledPickerLayer === layer.index ? null : layer.index);
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: LED_CSS[layer.ledColor], display: 'inline-block', border: '1px solid var(--border)' }} />
          </button>

          {!layer.isProtected && (
            <div className="layer-actions">
              <button
                className="btn"
                style={{ fontSize: 11, padding: '0 4px', color: 'var(--danger)' }}
                onClick={(e) => { e.stopPropagation(); store.removeLayer(layer.index); }}
              >✕</button>
            </div>
          )}
          {layer.isProtected && <span className="protected-badge" title="保護レイヤー（削除不可）">🔒</span>}

          {ledPickerLayer === layer.index && (
            <div className="led-picker" onClick={e => e.stopPropagation()}>
              <div className="led-picker-title">LED カラー<br /><small style={{ color: 'var(--text-muted)', fontWeight: 400 }}>現在: {layer.ledColor}</small></div>
              <div className="led-picker-grid">
                {LED_COLORS.map(color => (
                  <button
                    key={color}
                    className={`led-color-btn ${layer.ledColor === color ? 'selected' : ''}`}
                    style={{ color: LED_CSS[color] }}
                    onClick={() => {
                      store.setLayerLedColor(layer.index, color);
                      setLedPickerLayer(null);
                    }}
                  >{color}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
