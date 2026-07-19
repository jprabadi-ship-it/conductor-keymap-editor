import { useState, useRef, useEffect } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { LED_COLORS } from '../../types';

interface Props {
  store: KeymapStore;
}

// Custom colors the user has previously picked, newest first. Recorded when
// the picker closes (the native color input fires change continuously while
// dragging, so "on close" is the only sane notion of a *chosen* color), and
// only for colors outside the 8 presets -- those already have buttons.
const COLOR_HISTORY_KEY = 'conductor-led-color-history';
const COLOR_HISTORY_MAX = 8;

function loadColorHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLOR_HISTORY_KEY) || '[]');
    return Array.isArray(v) ? v.filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) : [];
  } catch {
    return [];
  }
}

// Named per-layer color schemes the user has saved, keyed by layer *name*
// (not index) so a theme saved on one project still applies sensibly if
// layers were reordered or a few added/removed since -- only layers whose
// name matches a key in the theme get recolored.
type LedTheme = { id: string; name: string; colors: Record<string, string>; savedAt: string };
const LED_THEMES_KEY = 'conductor-led-color-themes';
const LED_THEMES_MAX = 12;

function loadLedThemes(): LedTheme[] {
  try {
    const v = JSON.parse(localStorage.getItem(LED_THEMES_KEY) || '[]');
    return Array.isArray(v) ? v.filter(t =>
      t && typeof t.id === 'string' && typeof t.name === 'string' && t.colors && typeof t.colors === 'object'
    ) : [];
  } catch {
    return [];
  }
}

// Brightness is purely an editor-side convenience: the wire format is a
// packed 24-bit RGB value with no spare bits, and firmware has no brightness
// concept. So the slider scales whatever color was last picked (the "base")
// down to a dimmer version of the same hue, rather than being a value that
// round-trips -- reopening the picker later just shows the already-scaled
// color, same as if the user had picked that dimmer color directly.
function scaleColor(hex: string, factor: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const scale = (h: string) => Math.round(Math.min(255, Math.max(0, parseInt(h, 16) * factor))).toString(16).padStart(2, '0');
  return `#${scale(m[1])}${scale(m[2])}${scale(m[3])}`;
}

export function LayerList({ store }: Props) {
  const [ledPickerLayer, setLedPickerLayer] = useState<number | null>(null);
  const [colorHistory, setColorHistory] = useState<string[]>(loadColorHistory);
  const [pickerBaseColor, setPickerBaseColor] = useState('#ffffff');
  const [brightness, setBrightness] = useState(100);

  // Any explicit color pick (preset, history, native picker) becomes the new
  // 100%-brightness base; the slider always scales down from here, not from
  // whatever the previously-scaled color happened to be.
  const pickColor = (layerIndex: number, color: string) => {
    setPickerBaseColor(color);
    setBrightness(100);
    store.setLayerLedColor(layerIndex, color);
  };

  const changeBrightness = (layerIndex: number, value: number) => {
    setBrightness(value);
    store.setLayerLedColor(layerIndex, scaleColor(pickerBaseColor, value / 100));
  };

  const recordColorHistory = (color: string) => {
    const c = color.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(c) || LED_COLORS.includes(c)) return;
    setColorHistory(prev => {
      const next = [c, ...prev.filter(x => x !== c)].slice(0, COLOR_HISTORY_MAX);
      try { localStorage.setItem(COLOR_HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Both close paths (閉じる button and re-toggling the LED dot) go through
  // here so the just-picked custom color always lands in the history.
  const closeLedPicker = (currentColor: string) => {
    recordColorHistory(currentColor);
    setLedPickerLayer(null);
  };
  const [menuLayer, setMenuLayer] = useState<number | null>(null);
  const [copyPickerLayer, setCopyPickerLayer] = useState<number | null>(null);
  const [editingLayer, setEditingLayer] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [themes, setThemes] = useState<LedTheme[]>(loadLedThemes);
  const [namingTheme, setNamingTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const themeNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (namingTheme && themeNameInputRef.current) themeNameInputRef.current.focus();
  }, [namingTheme]);

  const saveThemeNamed = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const colors: Record<string, string> = {};
    store.layers.forEach(l => { colors[l.name] = l.ledColor; });
    const theme: LedTheme = { id: `theme-${Date.now()}`, name: trimmed, colors, savedAt: new Date().toISOString() };
    setThemes(prev => {
      const next = [theme, ...prev.filter(t => t.name !== trimmed)].slice(0, LED_THEMES_MAX);
      try { localStorage.setItem(LED_THEMES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setNamingTheme(false);
    setNewThemeName('');
  };

  const deleteTheme = (id: string) => {
    setThemes(prev => {
      const next = prev.filter(t => t.id !== id);
      try { localStorage.setItem(LED_THEMES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

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
      <div className="panel-section-title" style={{ position: 'relative' }}>
        <span>Layers</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn"
            style={{ fontSize: 12, padding: '0 6px' }}
            onClick={() => { setThemePanelOpen(v => !v); setNamingTheme(false); }}
          >🎨 テーマ</button>
          <button className="btn" onClick={store.addLayer} style={{ fontSize: 16, padding: '0 4px' }}>+</button>
        </span>

        {themePanelOpen && (
          <div className="led-picker layer-menu" style={{ right: 0, minWidth: 200 }} onClick={e => e.stopPropagation()}>
            <div className="led-picker-title">LEDテーマ</div>
            {namingTheme ? (
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                <input
                  ref={themeNameInputRef}
                  type="text"
                  value={newThemeName}
                  onChange={e => setNewThemeName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveThemeNamed(newThemeName);
                    if (e.key === 'Escape') setNamingTheme(false);
                  }}
                  placeholder="テーマ名"
                  style={{
                    flex: 1, fontSize: 12, padding: '3px 6px',
                    background: 'var(--bg-primary)', border: '1px solid var(--accent)',
                    color: 'var(--text-primary)', borderRadius: 3, outline: 'none', minWidth: 0,
                  }}
                />
                <button className="btn" style={{ fontSize: 11 }} onClick={() => saveThemeNamed(newThemeName)}>保存</button>
              </div>
            ) : (
              <button className="layer-menu-item" onClick={() => { setNamingTheme(true); setNewThemeName(''); }}>
                + 現在の配色を保存
              </button>
            )}
            {themes.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>保存済みテーマはありません</div>
            ) : (
              themes.map(theme => (
                <div key={theme.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
                  <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{theme.name}</span>
                  <button
                    className="btn"
                    style={{ fontSize: 10 }}
                    onClick={() => { store.applyLedTheme(theme.colors); setThemePanelOpen(false); }}
                  >適用</button>
                  <button
                    className="btn"
                    style={{ fontSize: 10, color: 'var(--danger)' }}
                    onClick={() => deleteTheme(theme.id)}
                  >削除</button>
                </div>
              ))
            )}
          </div>
        )}
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
              if (ledPickerLayer === layer.index) {
                closeLedPicker(layer.ledColor);
              } else {
                setLedPickerLayer(layer.index);
                setPickerBaseColor(layer.ledColor);
                setBrightness(100);
              }
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
                    onClick={() => pickColor(layer.index, color)}
                  />
                ))}
              </div>
              <label className="led-picker-custom">
                <span>カスタム</span>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(layer.ledColor) ? layer.ledColor : '#ffffff'}
                  onChange={e => pickColor(layer.index, e.target.value)}
                />
              </label>
              <div className="led-picker-history-title">明るさ ({brightness}%)</div>
              <input
                type="range"
                className="timing-slider"
                min={10}
                max={100}
                step={5}
                value={brightness}
                onChange={e => changeBrightness(layer.index, Number(e.target.value))}
              />
              {colorHistory.length > 0 && (
                <>
                  <div className="led-picker-history-title">最近使った色</div>
                  <div className="led-picker-grid">
                    {colorHistory.map(color => (
                      <button
                        key={color}
                        className={`led-color-btn ${layer.ledColor.toLowerCase() === color ? 'selected' : ''}`}
                        style={{ background: color, width: 22, height: 22, padding: 0, borderRadius: '50%' }}
                        title={color}
                        onClick={() => pickColor(layer.index, color)}
                      />
                    ))}
                  </div>
                </>
              )}
              <button
                className="led-picker-done"
                onClick={() => closeLedPicker(layer.ledColor)}
              >閉じる</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
