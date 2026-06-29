import { KeymapStore } from '../../store/useKeymapStore';
import { LEFT_KEYS, RIGHT_KEYS } from '../../data/layout';
import { KeyButton } from './KeyButton';
import { LedColor } from '../../types';

interface Props {
  store: KeymapStore;
}

const LED_CSS_MAP: Record<LedColor, string> = {
  black: 'var(--led-black)', red: 'var(--led-red)', green: 'var(--led-green)',
  yellow: 'var(--led-yellow)', blue: 'var(--led-blue)', magenta: 'var(--led-magenta)',
  cyan: 'var(--led-cyan)', white: 'var(--led-white)',
};

export function KeyboardView({ store }: Props) {
  const layer = store.selectedLayer;
  if (!layer) return null;

  const comboMap = new Map<string, string>();
  store.comboOverlays.forEach(o => comboMap.set(o.keyId, o.comboName));

  // Macro assignment mode
  const isMacroMode = store.leftPanelTab === 'macros' && store.selectedMacroIndex !== null;
  const selectedMacro = store.selectedMacro;

  // Find which keys have macros assigned on this layer
  const macroAssignments = new Map<string, string>();
  if (isMacroMode) {
    layer.keys.forEach(k => {
      if (k.binding.type === 'basic' && k.binding.keyCode?.startsWith('&') && k.binding.keyCode.length > 1) {
        macroAssignments.set(k.id, k.binding.keyCode.substring(1));
      }
    });
  }

  const handleKeyClick = (id: string) => {
    if (isMacroMode && selectedMacro) {
      const key = layer.keys.find(k => k.id === id);
      if (!key) return;
      const currentMacro = key.binding.keyCode?.startsWith('&') && key.binding.keyCode.length > 1 ? key.binding.keyCode.substring(1) : null;
      if (currentMacro === selectedMacro.name) {
        // Unassign
        store.updateKeyBinding(store.selectedLayerIndex, id, { type: 'none', keyCode: 'NONE', label: '' });
      } else {
        // Assign
        store.updateKeyBinding(store.selectedLayerIndex, id, {
          type: 'basic', keyCode: `&${selectedMacro.name}`, label: `&${selectedMacro.name}`,
        });
      }
    } else {
      store.setSelectedKeyId(id);
      store.setRightPanelTab('key-config');
    }
  };

  const renderKey = (id: string) => {
    const keyConfig = layer.keys.find(k => k.id === id);
    if (!keyConfig) return <div key={id} />;

    const assignedMacro = macroAssignments.get(id);
    const isThisMacro = assignedMacro === selectedMacro?.name;
    const hasOtherMacro = assignedMacro && !isThisMacro;

    return (
      <KeyButton
        key={id}
        keyConfig={keyConfig}
        selected={isMacroMode ? isThisMacro : store.selectedKeyId === id}
        onClick={() => handleKeyClick(id)}
        comboName={comboMap.get(id)}
        isAmlExcluded={store.amlExcluded.includes(id)}
        macroHighlight={isMacroMode ? (isThisMacro ? 'assigned' : hasOtherMacro ? 'other' : undefined) : undefined}
      />
    );
  };

  const renderHalf = (positions: typeof LEFT_KEYS, className: string, trackball?: { row: number; colStart: number; colSpan: number }) => {
    const maxCol = Math.max(...positions.map(p => p.col));
    const maxRow = Math.max(...positions.map(p => p.row));
    const cells: React.ReactNode[] = [];

    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        if (trackball && row === trackball.row && col === trackball.colStart) {
          cells.push(
            <div key="trackball" className="trackball-placeholder" style={{ gridColumn: `span ${trackball.colSpan}`, cursor: 'pointer' }} onClick={() => store.setRightPanelTab('trackball')} />
          );
          continue;
        }
        if (trackball && row === trackball.row && col > trackball.colStart && col < trackball.colStart + trackball.colSpan) {
          continue;
        }
        const pos = positions.find(p => p.row === row && p.col === col);
        if (pos) {
          cells.push(renderKey(pos.id));
        } else {
          cells.push(<div key={`empty-${row}-${col}`} />);
        }
      }
    }
    return <div className={`keyboard-half ${className}`}>{cells}</div>;
  };

  return (
    <div className="keyboard-area">
      <div className="keyboard-toolbar">
        <div className="layer-indicator">
          <span className="led-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: LED_CSS_MAP[layer.ledColor], display: 'inline-block' }} />
          <span>{layer.name}</span>
        </div>

        <button
          className={`btn btn-outline ${store.diffMode ? 'btn-active' : ''}`}
          onClick={() => store.setDiffMode(!store.diffMode)}
          style={{ fontSize: 11 }}
        >
          ⇄ Diff
        </button>

        <button
          className="btn btn-outline"
          style={{ fontSize: 11, color: 'var(--warning)' }}
        >
          ⊘ AML {store.amlExcluded.length}
        </button>
      </div>

      {store.amlExcluded.length > 0 && (
        <div className="aml-info">
          ⊘ {store.amlExcluded.length}個のキーがAML excluded-positionsに設定済み（Writeで送信）
        </div>
      )}

      <div className="keyboard-container">
        {renderHalf(LEFT_KEYS, 'left')}
        {renderHalf(RIGHT_KEYS, 'right', { row: 3, colStart: 2, colSpan: 2 })}
      </div>

      <div className="keyboard-hint">
        {isMacroMode
          ? `Click a key to assign/unassign "${selectedMacro?.name}"`
          : 'Click a key to configure'}
      </div>

      {/* Layer switcher */}
      <div className="layer-switcher">
        {store.layers.map(l => (
          <button
            key={l.index}
            className={`layer-dot ${store.selectedLayerIndex === l.index ? 'active' : ''}`}
            onClick={() => store.setSelectedLayerIndex(l.index)}
            title={l.name}
          >
            <span className="layer-dot-circle" style={{ background: LED_CSS_MAP[l.ledColor] }} />
            <span className="layer-dot-label">{l.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
