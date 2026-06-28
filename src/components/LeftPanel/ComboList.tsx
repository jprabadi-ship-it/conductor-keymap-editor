import { useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { Combo } from '../../types';

interface Props {
  store: KeymapStore;
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
                <input
                  type="text"
                  value={editDraft.name || ''}
                  onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Trigger Keys */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">TRIGGER KEYS ({editDraft.keyPositions?.length || 0} SELECTED, MIN 2)</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                  {(editDraft.keyPositions || []).map(pos => (
                    <span key={pos} className="combo-key-badge" style={{ cursor: 'pointer' }} onClick={() => {
                      setEditDraft({ ...editDraft, keyPositions: editDraft.keyPositions?.filter(p => p !== pos) });
                    }}>{pos} ✕</span>
                  ))}
                </div>
                <select
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px', borderRadius: 4, fontSize: 11 }}
                  value=""
                  onChange={e => {
                    if (e.target.value && !editDraft.keyPositions?.includes(e.target.value)) {
                      setEditDraft({ ...editDraft, keyPositions: [...(editDraft.keyPositions || []), e.target.value] });
                    }
                  }}
                >
                  <option value="">+ キーを追加...</option>
                  {store.selectedLayer?.keys.map(k => (
                    <option key={k.id} value={k.id} disabled={editDraft.keyPositions?.includes(k.id)}>{k.id}</option>
                  ))}
                </select>
              </div>

              {/* Binding Type */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">BINDING TYPE</label>
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
                <input
                  type="number"
                  value={editDraft.timeoutMs || 50}
                  min={10} max={500}
                  onChange={e => setEditDraft({ ...editDraft, timeoutMs: Number(e.target.value) })}
                  style={{ width: 80 }}
                />
              </div>

              {/* Active Layers */}
              <div className="combo-edit-field">
                <label className="combo-edit-label">ACTIVE LAYERS (EMPTY = ALL)</label>
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
