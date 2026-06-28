import { KeymapStore } from '../../store/useKeymapStore';
import { MacroAction } from '../../types';

interface Props {
  store: KeymapStore;
}

const ACTIONS: { value: MacroAction; label: string }[] = [
  { value: 'macro_tap', label: 'Tap' },
  { value: 'macro_press', label: 'Press' },
  { value: 'macro_release', label: 'Release' },
  { value: 'macro_wait_time', label: 'Wait' },
];

export function MacroEditor({ store }: Props) {
  const macro = store.selectedMacro;
  const idx = store.selectedMacroIndex;

  if (macro === null || idx === null) {
    return <div className="right-panel-placeholder">Select a macro to edit</div>;
  }

  return (
    <div>
      <div className="key-info-header">
        <span className="key-info-id">&amp;{macro.name}</span>
        <span className="key-info-type">{macro.bindings.length} steps</span>
      </div>

      <div className="config-section">
        <div className="config-label">Name</div>
        <input
          type="text"
          value={macro.name}
          onChange={e => store.updateMacro(idx, { name: e.target.value.replace(/[^a-z0-9_]/g, '') })}
          style={{ width: '100%' }}
        />
      </div>

      <div className="config-section">
        <div className="config-label">Timing</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
            Wait (ms)
            <input
              type="number"
              value={macro.waitMs}
              min={0} max={5000}
              onChange={e => store.updateMacro(idx, { waitMs: parseInt(e.target.value) || 30 })}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
          <label style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
            Tap (ms)
            <input
              type="number"
              value={macro.tapMs}
              min={0} max={5000}
              onChange={e => store.updateMacro(idx, { tapMs: parseInt(e.target.value) || 30 })}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>
        </div>
      </div>

      <div className="config-section">
        <div className="config-label">Steps</div>
        {macro.bindings.map((step, si) => (
          <div key={si} className="macro-step">
            <div className="macro-step-header">
              <span className="macro-step-num">{si + 1}</span>
              <select
                className="macro-step-select"
                value={step.action}
                onChange={e => {
                  const action = e.target.value as MacroAction;
                  if (action === 'macro_wait_time') {
                    store.updateMacroStep(idx, si, { action, ms: step.ms || 100, behavior: undefined, param: undefined });
                  } else {
                    store.updateMacroStep(idx, si, { action, behavior: 'kp', param: step.param || 'SPACE', ms: undefined });
                  }
                }}
              >
                {ACTIONS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>

              {step.action === 'macro_wait_time' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <input
                    type="number"
                    value={step.ms || 100}
                    min={1} max={10000}
                    onChange={e => store.updateMacroStep(idx, si, { ms: parseInt(e.target.value) || 100 })}
                    style={{ width: 70 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ms</span>
                </div>
              ) : (
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 11, padding: '3px 8px', flex: 1, textAlign: 'left' }}
                  onClick={() => {
                    const key = prompt('Key code:', step.param || 'SPACE');
                    if (key) store.updateMacroStep(idx, si, { param: key });
                  }}
                >{step.param || '?'}</button>
              )}

              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  className="btn btn-icon"
                  style={{ width: 24, height: 24, fontSize: 10 }}
                  onClick={() => store.moveMacroStep(idx, si, 'up')}
                  disabled={si === 0}
                >↑</button>
                <button
                  className="btn btn-icon"
                  style={{ width: 24, height: 24, fontSize: 10 }}
                  onClick={() => store.moveMacroStep(idx, si, 'down')}
                  disabled={si === macro.bindings.length - 1}
                >↓</button>
                <button
                  className="btn btn-icon"
                  style={{ width: 24, height: 24, fontSize: 10, color: 'var(--danger)' }}
                  onClick={() => store.removeMacroStep(idx, si)}
                >✕</button>
              </div>
            </div>
          </div>
        ))}

        <button
          className="btn btn-outline"
          style={{ width: '100%', marginTop: 8, fontSize: 12 }}
          onClick={() => store.addMacroStep(idx, { action: 'macro_tap', behavior: 'kp', param: 'SPACE' })}
        >+ Add step</button>
      </div>

      <div className="config-section">
        <button
          className="btn"
          style={{ width: '100%', color: 'var(--danger)', fontSize: 12, border: '1px solid var(--danger)', padding: '6px' }}
          onClick={() => { if (confirm(`Delete macro "${macro.name}"?`)) store.removeMacro(idx); }}
        >Delete macro</button>
      </div>
    </div>
  );
}
