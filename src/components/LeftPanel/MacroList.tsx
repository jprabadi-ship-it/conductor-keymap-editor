import { KeymapStore } from '../../store/useKeymapStore';
import { isConnected, setMacro, saveChanges } from '../../services/usbService';

interface Props {
  store: KeymapStore;
}

export function MacroList({ store }: Props) {
  return (
    <div>
      <div className="panel-section-title">
        <span>Macros ({store.macros.length}/16)</span>
        <button
          className="btn"
          onClick={() => {
            store.addMacro();
            store.setRightPanelTab('macro-edit');
          }}
          disabled={store.macros.length >= 16}
          style={{ fontSize: 12 }}
        >+ New</button>
      </div>

      {store.macros.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '12px 8px', textAlign: 'center' }}>
          No macros defined
        </div>
      )}

      {store.macros.map((macro, i) => (
        <div
          key={i}
          className={`combo-item ${store.selectedMacroIndex === i ? 'selected' : ''}`}
          style={{
            cursor: 'pointer',
            background: store.selectedMacroIndex === i ? 'var(--bg-selected)' : undefined,
          }}
          onClick={() => {
            store.setSelectedMacroIndex(i);
            store.setRightPanelTab('macro-edit');
          }}
        >
          <span className="combo-name">&amp;{macro.name}</span>
          <span className="combo-binding">{macro.bindings.length} steps</span>
          <button
            className="btn"
            style={{ fontSize: 10, padding: '2px 4px', color: 'var(--danger)' }}
            onClick={async (e) => {
              e.stopPropagation();
              if (macro.deviceId !== undefined && isConnected()) {
                await setMacro(macro.deviceId, '', []);
                await saveChanges();
              }
              store.removeMacro(i);
            }}
          >✕</button>
        </div>
      ))}
    </div>
  );
}
