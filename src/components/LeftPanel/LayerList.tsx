import { useState, useRef, useEffect } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { LED_COLORS } from '../../types';

interface Props {
  store: KeymapStore;
}

export function LayerList({ store }: Props) {
  const [ledPickerLayer, setLedPickerLayer] = useState<number | null>(null);
  const [menuLayer, setMenuLayer] = useState<number | null>(null);
  const [copyPickerLayer, setCopyPickerLayer] = useState<number | null>(null);
  const [editingLayer, setEditingLayer] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLayer !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingLayer]);

  const startEditing = (index: number, name: string) => {
    setEditingLayer(index);
    setEditValue(name);
  };

  const commitEdit = () => {
    if (editingLayer !== null && editValue.trim().length > 0) {
      store.setLayerName(editingLayer, editValue.trim());
    }
    setEditingLayer(null);
  };

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
          <span className="led-dot" style={{ background: layer.ledColor }} />

          {editingLayer === layer.index ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditingLayer(null);
              }}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, fontSize: 13, padding: '1px 4px',
                background: 'var(--bg-primary)', border: '1px solid var(--accent)',
                color: 'var(--text-primary)', borderRadius: 3, outline: 'none',
                minWidth: 0,
              }}
            />
          ) : (
            <span
              className="layer-name"
              onDoubleClick={(e) => { e.stopPropagation(); startEditing(layer.index, layer.name); }}
              title="ダブルクリックで名前を編集"
            >{layer.name}</span>
          )}

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
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: layer.ledColor, display: 'inline-block', border: '1px solid var(--border)' }} />
          </button>

          <span className="layer-trailing">
            <button
              className="btn"
              style={{ fontSize: 14, padding: '0 4px' }}
              onClick={(e) => {
                e.stopPropagation();
                setCopyPickerLayer(null);
                setMenuLayer(menuLayer === layer.index ? null : layer.index);
              }}
            >⋯</button>
          </span>

          {menuLayer === layer.index && (
            <div className="led-picker layer-menu" onClick={e => e.stopPropagation()}>
              <button
                className="layer-menu-item"
                onClick={() => setCopyPickerLayer(layer.index)}
              >コピー</button>
              {!layer.isProtected && (
                <button
                  className="layer-menu-item danger"
                  onClick={() => { store.removeLayer(layer.index); setMenuLayer(null); }}
                >削除</button>
              )}
            </div>
          )}

          {copyPickerLayer === layer.index && (
            <div className="led-picker layer-menu" onClick={e => e.stopPropagation()}>
              <div className="led-picker-title">コピー先のレイヤー</div>
              {store.layers.filter(l => l.index !== layer.index).map(l => (
                <button
                  key={l.index}
                  className="layer-menu-item"
                  onClick={() => {
                    store.copyLayerBindings(layer.index, l.index);
                    setCopyPickerLayer(null);
                    setMenuLayer(null);
                  }}
                >{l.name} ({l.index})</button>
              ))}
            </div>
          )}

          {ledPickerLayer === layer.index && (
            <div className="led-picker" onClick={e => e.stopPropagation()}>
              <div className="led-picker-title">LED カラー<br /><small style={{ color: 'var(--text-muted)', fontWeight: 400 }}>現在: {layer.ledColor}</small></div>
              <div className="led-picker-grid">
                {LED_COLORS.map(color => (
                  <button
                    key={color}
                    className={`led-color-btn ${layer.ledColor.toLowerCase() === color ? 'selected' : ''}`}
                    style={{ background: color, width: 22, height: 22, padding: 0, borderRadius: '50%' }}
                    title={color}
                    onClick={() => {
                      store.setLayerLedColor(layer.index, color);
                      setLedPickerLayer(null);
                    }}
                  />
                ))}
              </div>
              <label className="led-picker-custom">
                <span>カスタム</span>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(layer.ledColor) ? layer.ledColor : '#ffffff'}
                  onChange={e => store.setLayerLedColor(layer.index, e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
