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

  const renderKey = (id: string) => {
    const keyConfig = layer.keys.find(k => k.id === id);
    if (!keyConfig) return <div key={id} />;
    return (
      <KeyButton
        key={id}
        keyConfig={keyConfig}
        selected={store.selectedKeyId === id}
        onClick={() => {
          store.setSelectedKeyId(id);
          store.setRightPanelTab('key-config');
        }}
        comboName={comboMap.get(id)}
        isAmlExcluded={store.amlExcluded.includes(id)}
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
            <div key="trackball" className="trackball-placeholder" style={{ gridColumn: `span ${trackball.colSpan}` }} />
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
        {renderHalf(RIGHT_KEYS, 'right', { row: 2, colStart: 2, colSpan: 2 })}
      </div>

      <div className="keyboard-hint">Click a key to configure</div>
    </div>
  );
}
