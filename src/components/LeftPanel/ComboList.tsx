import { useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { Combo } from '../../types';
import { KEYBOARD_LAYOUT } from '../../data/layout';
import { isConnected, isUnlocked, requestUnlock, setAutoLayer } from '../../services/usbService';
import { debugLog } from '../DebugConsole';

interface Props {
  store: KeymapStore;
}

function MiniKeyboard({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const leftKeys = KEYBOARD_LAYOUT.filter(k => k.half === 'left');
  const rightKeys = KEYBOARD_LAYOUT.filter(k => k.half === 'right');
  const maxColL = Math.max(...leftKeys.map(k => k.col));
  const maxColR = Math.max(...rightKeys.map(k => k.col));
  const maxRow = Math.max(...KEYBOARD_LAYOUT.map(k => k.row));

  const S = 20;
  const G = 2;

  const renderHalf = (keys: typeof KEYBOARD_LAYOUT, maxCol: number) => {
    const cells: React.ReactNode[] = [];
    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        const pos = keys.find(p => p.row === row && p.col === col);
        if (pos) {
          const isSelected = selected.includes(pos.id);
          cells.push(
            <button
              key={pos.id}
              onClick={() => onToggle(pos.id)}
              style={{
                width: S, height: S, borderRadius: 2, border: '1px solid',
                borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                background: isSelected ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: isSelected ? 'white' : 'var(--text-muted)',
                fontSize: 6, cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title={pos.id}
            >{pos.id.substring(1)}</button>
          );
        } else {
          cells.push(<div key={`e-${row}-${col}`} style={{ width: S, height: S }} />);
        }
      }
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxCol + 1}, ${S}px)`, gap: G }}>
        {cells}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', padding: '4px 0' }}>
      {renderHalf(leftKeys, maxColL)}
      {renderHalf(rightKeys, maxColR)}
    </div>
  );
}

const BINDING_TYPES = [
  { value: 'basic', label: 'Key Press', icon: '⌨', desc: 'キー押下' },
  { value: 'momentary', label: 'MO(layer)', icon: '↕', desc: 'レイヤー一時切替' },
  { value: 'layer-tap', label: 'LT(layer,key)', icon: '↕↓', desc: 'ホールドでレイヤー/タップでキー' },
  { value: 'mod-tap', label: 'MT(mod,key)', icon: '⌥', desc: 'ホールドでMod/タップでキー' },
  { value: 'toggle', label: 'TG(layer)', icon: '⊞', desc: 'レイヤートグル' },
];

export function ComboList({ store }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Combo>>({});
  const [amlExpanded, setAmlExpanded] = useState(false);
  const [amlEditing, setAmlEditing] = useState(false);
  const [amlEnabled, setAmlEnabled] = useState(true);
  const [amlIdleMs, setAmlIdleMs] = useState(300);
  const [amlDuration, setAmlDuration] = useState(500);
  const [amlMotion, setAmlMotion] = useState(0);

  const startEdit = (combo: Combo) => {
    setEditingId(combo.id);
    setEditDraft({ ...combo });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const saveEdit = () => {
    if (editingId && editDraft) {
      store.updateCombo(editingId, editDraft);
    }
    setEditingId(null);
    setEditDraft({});
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
    if (editingId && editingId !== id) cancelEdit();
  };

  return (
    <div>
      <div className="panel-section-title">
        <span>Combos ({store.combos.length})</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn" style={{ fontSize: 12 }} onClick={store.addCombo}>+ Add</button>
        </div>
      </div>

      {/* AML as combo-like entry */}
      <div style={{ marginBottom: 4 }}>
        <button
          className="combo-item"
          style={{ width: '100%', cursor: 'pointer' }}
          onClick={() => { setAmlExpanded(!amlExpanded); setAmlEditing(false); setExpandedId(null); }}
        >
          <span className="combo-name">🖲 AML</span>
          <span className="combo-arrow">→</span>
          <span className="combo-binding">mouse (L4)</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{amlExpanded ? '∧' : '∨'}</span>
        </button>

        {/* AML detail view */}
        {amlExpanded && !amlEditing && (
          <div className="combo-detail">
            <div className="combo-detail-row">
              <span className="combo-detail-label">TRIGGER:</span>
              <span>トラックボール操作</span>
            </div>
            <div className="combo-detail-row">
              <span className="combo-detail-label">OUTPUT:</span>
              <span>Layer 4 (mouse) 一時切替</span>
            </div>
            <div className="combo-detail-row">
              <span className="combo-detail-label">STATUS:</span>
              <span style={{ color: amlEnabled ? 'var(--success)' : 'var(--text-muted)' }}>{amlEnabled ? 'ON' : 'OFF'}</span>
            </div>
            <div className="combo-detail-row">
              <span className="combo-detail-label">IDLE:</span>
              <span>{amlIdleMs}ms</span>
            </div>
            <div className="combo-detail-row">
              <span className="combo-detail-label">DURATION:</span>
              <span>{amlDuration}ms</span>
            </div>
            <div className="combo-detail-row">
              <span className="combo-detail-label">MOTION:</span>
              <span>{amlMotion}</span>
            </div>
            <div className="combo-detail-row">
              <span className="combo-detail-label">EXCLUDED:</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {store.amlExcluded.map(pos => (
                  <span key={pos} className="combo-key-badge">{pos}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => setAmlEditing(true)}>✏ Edit</button>
            </div>
          </div>
        )}

        {/* AML edit mode */}
        {amlExpanded && amlEditing && (
          <div className="combo-edit-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 12 }}>Edit AML</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn" style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }} onClick={async () => {
                  if (isConnected()) {
                    if (!isUnlocked() && !(await requestUnlock())) {
                      alert('デバイスがロックされています'); return;
                    }
                    await setAutoLayer(amlEnabled, amlIdleMs, store.amlExcluded.map((_, i) => i), amlMotion);
                    debugLog('INF', 'AML', 'Settings applied');
                  }
                  setAmlEditing(false);
                }}>✓ Apply</button>
                <button className="btn" style={{ fontSize: 11 }} onClick={() => setAmlEditing(false)}>✕ Cancel</button>
              </div>
            </div>

            {/* Enable/Disable */}
            <div className="combo-edit-field">
              <label className="combo-edit-label">STATUS</label>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>トラックボール操作時に自動でマウスレイヤーに切り替え</div>
              <div className="btn-group">
                <button className={`btn ${!amlEnabled ? 'btn-active' : ''}`} onClick={() => setAmlEnabled(false)}>OFF</button>
                <button className={`btn ${amlEnabled ? 'btn-active' : ''}`} onClick={() => setAmlEnabled(true)} style={amlEnabled ? { background: 'var(--success)', color: 'white' } : {}}>ON</button>
              </div>
            </div>

            {/* Idle */}
            <div className="combo-edit-field">
              <label className="combo-edit-label">発動待機時間</label>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>キー操作後、この時間が経過してからトラックボールを動かすとAMLが発動</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" className="timing-slider" style={{ flex: 1 }} min={0} max={1000} step={10} value={amlIdleMs} onChange={e => setAmlIdleMs(Number(e.target.value))} />
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, minWidth: 45, textAlign: 'right' }}>{amlIdleMs}ms</span>
              </div>
            </div>

            {/* Duration */}
            <div className="combo-edit-field">
              <label className="combo-edit-label">持続時間</label>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>トラックボールを止めてからマウスレイヤーを維持する時間</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" className="timing-slider" style={{ flex: 1 }} min={100} max={5000} step={50} value={amlDuration} onChange={e => setAmlDuration(Number(e.target.value))} />
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, minWidth: 45, textAlign: 'right' }}>{amlDuration}ms</span>
              </div>
            </div>

            {/* Motion threshold */}
            <div className="combo-edit-field">
              <label className="combo-edit-label">最低移動距離</label>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>この距離以上動かさないとAMLが発動しない（誤発動防止）</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" className="timing-slider" style={{ flex: 1 }} min={0} max={200} step={1} value={amlMotion} onChange={e => setAmlMotion(Number(e.target.value))} />
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, minWidth: 25, textAlign: 'right' }}>{amlMotion}</span>
              </div>
            </div>

            {/* Excluded keys */}
            <div className="combo-edit-field">
              <label className="combo-edit-label">除外キー</label>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>これらのキーを押している間はAMLが発動しません</div>
              <MiniKeyboard
                selected={store.amlExcluded}
                onToggle={(id) => {
                  const excluded = store.amlExcluded.includes(id)
                    ? store.amlExcluded.filter(p => p !== id)
                    : [...store.amlExcluded, id];
                  store.setAmlExcluded(excluded);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {store.combos.map(combo => (
        <div key={combo.id} style={{ marginBottom: 4 }}>
          {/* Combo header */}
          <button
            className="combo-item"
            style={{ width: '100%', cursor: 'pointer' }}
            onClick={() => toggleExpand(combo.id)}
          >
            <span className="combo-name">{combo.name}</span>
            <span className="combo-arrow">→</span>
            <span className="combo-binding">{combo.binding.label || combo.binding.keyCode}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{expandedId === combo.id ? '∧' : '∨'}</span>
          </button>

          {/* Expanded details */}
          {expandedId === combo.id && editingId !== combo.id && (
            <div className="combo-detail">
              <div className="combo-detail-row">
                <span className="combo-detail-label">KEYS:</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {combo.keyPositions.map(pos => (
                    <span key={pos} className="combo-key-badge">{pos}</span>
                  ))}
                </div>
              </div>
              <div className="combo-detail-row">
                <span className="combo-detail-label">TYPE:</span>
                <span>{BINDING_TYPES.find(t => t.value === combo.binding.type)?.label || combo.binding.type}</span>
              </div>
              <div className="combo-detail-row">
                <span className="combo-detail-label">OUTPUT:</span>
                <span>{combo.binding.label || combo.binding.keyCode}</span>
              </div>
              <div className="combo-detail-row">
                <span className="combo-detail-label">TIMEOUT:</span>
                <span>{combo.timeoutMs}ms</span>
              </div>
              {combo.suppressAml && (
                <div className="combo-detail-row">
                  <span className="combo-detail-label">AML:</span>
                  <span style={{ color: 'var(--accent)' }}>抑制</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => startEdit(combo)}>✏ Edit</button>
                <button className="btn" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => store.removeCombo(combo.id)}>🗑 Delete</button>
              </div>
            </div>
          )}

          {/* Edit mode */}
          {editingId === combo.id && (
            <div className="combo-edit-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 12 }}>Edit Combo</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn" style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }} onClick={saveEdit}>✓ Save</button>
                  <button className="btn" style={{ fontSize: 11 }} onClick={cancelEdit}>✕ Cancel</button>
                </div>
              </div>

              {/* Name */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">NAME (OPTIONAL)</label>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>管理用の名前（デバイスには送信されません）</div>
                <input
                  type="text"
                  value={editDraft.name || ''}
                  onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Trigger Keys - Mini Keyboard */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">TRIGGER KEYS ({editDraft.keyPositions?.length || 0} SELECTED, MIN 2)</label>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>同時押しでコンボが発火するキーを選択</div>
                <MiniKeyboard
                  selected={editDraft.keyPositions || []}
                  onToggle={(id) => {
                    const positions = editDraft.keyPositions || [];
                    const newPositions = positions.includes(id) ? positions.filter(p => p !== id) : [...positions, id];
                    setEditDraft({ ...editDraft, keyPositions: newPositions });
                  }}
                />
              </div>

              {/* Binding Type */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">BINDING TYPE</label>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>コンボ発火時に実行するアクションの種類</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                  {BINDING_TYPES.map(bt => (
                    <button
                      key={bt.value}
                      className={`type-btn ${editDraft.binding?.type === bt.value ? 'selected' : ''}`}
                      style={{ fontSize: 10, padding: '6px 4px', textAlign: 'center' }}
                      onClick={() => setEditDraft({ ...editDraft, binding: { ...editDraft.binding!, type: bt.value as any } })}
                    >
                      <div>{bt.icon}</div>
                      <div>{bt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Key */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">OUTPUT KEY</label>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>発火時に出力されるキーコードまたはアクション</div>
                <input
                  type="text"
                  value={editDraft.binding?.keyCode || ''}
                  onChange={e => setEditDraft({ ...editDraft, binding: { ...editDraft.binding!, keyCode: e.target.value, label: e.target.value } })}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Layer (for MO/LT/TG) */}
              {(editDraft.binding?.type === 'momentary' || editDraft.binding?.type === 'layer-tap' || editDraft.binding?.type === 'toggle') && (
                <div className="combo-edit-field">
                  <label className="combo-edit-label">LAYER</label>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {store.layers.map(l => (
                      <button
                        key={l.index}
                        className={`preset-btn ${editDraft.binding?.layer === l.index ? 'selected' : ''}`}
                        onClick={() => {
                          const label = editDraft.binding?.type === 'toggle' ? `TG${l.index}` : `L${l.index}`;
                          const keyCode = editDraft.binding?.type === 'toggle' ? `TG(${l.index})` : `MO(${l.index})`;
                          setEditDraft({ ...editDraft, binding: { ...editDraft.binding!, layer: l.index, label, keyCode } });
                        }}
                      >{l.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeout */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">TIMEOUT (MS)</label>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>この時間内に全キーを押すとコンボ発火（短いほど厳密）</div>
                <input
                  type="number"
                  value={editDraft.timeoutMs || 50}
                  min={10} max={500}
                  onChange={e => setEditDraft({ ...editDraft, timeoutMs: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>

              {/* Suppress AML */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">AML 抑制</label>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>ONにするとこのコンボのキーを押している間AMLが発動しません</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setEditDraft({ ...editDraft, suppressAml: !editDraft.suppressAml })}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: editDraft.suppressAml ? 'var(--accent)' : 'var(--bg-hover)',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: editDraft.suppressAml ? 18 : 2,
                      width: 16, height: 16, borderRadius: '50%', background: 'white',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {editDraft.suppressAml ? 'このコンボ発火中はAMLを無効化' : 'AML通常動作'}
                  </span>
                </div>
              </div>

              {/* Active Layers */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">ACTIVE LAYERS (EMPTY = ALL)</label>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>選択したレイヤーでのみコンボが有効（未選択＝全レイヤー）</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {store.layers.map(l => (
                    <button
                      key={l.index}
                      className={`preset-btn ${editDraft.layers?.includes(l.index) ? 'selected' : ''}`}
                      onClick={() => {
                        const layers = editDraft.layers || [];
                        const newLayers = layers.includes(l.index) ? layers.filter(x => x !== l.index) : [...layers, l.index];
                        setEditDraft({ ...editDraft, layers: newLayers });
                      }}
                    >{l.name}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
