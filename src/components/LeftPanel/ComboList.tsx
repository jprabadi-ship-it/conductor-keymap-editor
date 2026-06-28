import { KeymapStore } from '../../store/useKeymapStore';

interface Props {
  store: KeymapStore;
}

export function ComboList({ store }: Props) {
  return (
    <div>
      <div className="panel-section-title">
        <span>Combos ({store.combos.length})</span>
        <button className="btn" onClick={store.addCombo} style={{ fontSize: 12 }}>Add</button>
      </div>

      {store.combos.map(combo => (
        <div key={combo.id} className="combo-item">
          <span className="combo-name">{combo.name}</span>
          <span className="combo-arrow">→</span>
          <span className="combo-binding">{combo.binding.label || combo.binding.keyCode}</span>
          <button
            className="btn"
            style={{ fontSize: 10, padding: '2px 4px', color: 'var(--danger)' }}
            onClick={() => store.removeCombo(combo.id)}
          >✕</button>
        </div>
      ))}
    </div>
  );
}
