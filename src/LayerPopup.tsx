import { useEffect, useState } from 'react';
import { KeyButton } from './components/KeyboardView/KeyButton';
import { LEFT_KEYS, RIGHT_KEYS, KeyPosition } from './data/layout';
import { Layer, LedColor, Combo } from './types';

const LED_CSS_MAP: Record<LedColor, string> = {
  black: 'var(--led-black)', red: 'var(--led-red)', green: 'var(--led-green)',
  yellow: 'var(--led-yellow)', blue: 'var(--led-blue)', magenta: 'var(--led-magenta)',
  cyan: 'var(--led-cyan)', white: 'var(--led-white)',
};

interface LayerState {
  layers: Layer[];
  combos: Combo[];
  amlExcluded: string[];
  highestLayer: number;
  connected: boolean;
}

function renderHalf(layer: Layer, positions: KeyPosition[], comboMap: Map<string, string>, amlExcluded: string[], className: string) {
  const maxCol = Math.max(...positions.map(p => p.col));
  const maxRow = Math.max(...positions.map(p => p.row));
  const cells = [];
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= maxCol; col++) {
      const pos = positions.find(p => p.row === row && p.col === col);
      const keyConfig = pos && layer.keys.find(k => k.id === pos.id);
      cells.push(
        keyConfig
          ? <KeyButton
              key={pos!.id}
              keyConfig={keyConfig}
              selected={false}
              onClick={() => {}}
              comboName={comboMap.get(pos!.id)}
              isAmlExcluded={amlExcluded.includes(pos!.id)}
            />
          : <div key={`empty-${className}-${row}-${col}`} />
      );
    }
  }
  return <div className={`keyboard-half ${className}`}>{cells}</div>;
}

export function LayerPopup() {
  const [state, setState] = useState<LayerState | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);

  useEffect(() => {
    const api = (window as any).electronAPI;
    return api?.onLayerState?.((s: LayerState) => setState(s));
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    return api?.onShowMinimap?.((show: boolean) => setShowMinimap(show));
  }, []);

  const layer = state?.connected ? state.layers.find(l => l.index === state.highestLayer) ?? state.layers[0] : null;

  // Right-click anywhere in the popup opens the opacity menu (the window is
  // frameless, so there's no title bar to host it on).
  const onContextMenu = () => (window as any).electronAPI?.showPopupMenu?.();

  if (!layer) {
    return (
      <div className="layer-popup" onContextMenu={onContextMenu}>
        <div className="layer-popup-empty layer-popup-drag">
          {state?.connected === false ? 'デバイス未接続' : '読み込み中...'}
        </div>
      </div>
    );
  }

  // Same derivation as KeyboardView/useKeymapStore's comboOverlays.
  const comboMap = new Map<string, string>();
  state!.combos.forEach(combo => combo.keyPositions.forEach(pos => comboMap.set(pos, combo.name)));

  return (
    <div className="layer-popup" onContextMenu={onContextMenu}>
      <div className="layer-popup-header layer-popup-drag">
        <span className="led-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: LED_CSS_MAP[layer.ledColor] }} />
        <span>{layer.name}</span>
      </div>

      <div className="keyboard-container">
        {renderHalf(layer, LEFT_KEYS, comboMap, state!.amlExcluded, 'left')}
        {renderHalf(layer, RIGHT_KEYS, comboMap, state!.amlExcluded, 'right')}
      </div>

      {showMinimap && (
        <div className="layer-switcher">
          {state!.layers.map(l => (
            <div key={l.index} className={`layer-dot ${l.index === layer.index ? 'active' : ''}`} title={l.name}>
              <span className="layer-dot-circle" style={{ background: LED_CSS_MAP[l.ledColor] }} />
              <span className="layer-dot-label">{l.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
