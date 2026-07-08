import { useEffect, useState } from 'react';
import { KeyButton } from './components/KeyboardView/KeyButton';
import { LEFT_KEYS, RIGHT_KEYS, KeyPosition } from './data/layout';
import { Layer, LedColor } from './types';

const LED_CSS_MAP: Record<LedColor, string> = {
  black: 'var(--led-black)', red: 'var(--led-red)', green: 'var(--led-green)',
  yellow: 'var(--led-yellow)', blue: 'var(--led-blue)', magenta: 'var(--led-magenta)',
  cyan: 'var(--led-cyan)', white: 'var(--led-white)',
};

interface LayerState {
  layers: Layer[];
  highestLayer: number;
  connected: boolean;
}

// Matches .keyboard-container's unscaled footprint (two 6x48px halves, 24px
// gap, 16px padding) so the transform below doesn't clip or leave gaps.
const KEYBOARD_WIDTH = 672;
const KEYBOARD_HEIGHT = 236;
const POPUP_SCALE = 0.5;

function renderHalf(layer: Layer, positions: KeyPosition[], className: string) {
  const maxCol = Math.max(...positions.map(p => p.col));
  const maxRow = Math.max(...positions.map(p => p.row));
  const cells = [];
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= maxCol; col++) {
      const pos = positions.find(p => p.row === row && p.col === col);
      const keyConfig = pos && layer.keys.find(k => k.id === pos.id);
      cells.push(
        keyConfig
          ? <KeyButton key={pos!.id} keyConfig={keyConfig} selected={false} onClick={() => {}} />
          : <div key={`empty-${className}-${row}-${col}`} />
      );
    }
  }
  return <div className={`keyboard-half ${className}`}>{cells}</div>;
}

export function LayerPopup() {
  const [state, setState] = useState<LayerState | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    return api?.onLayerState?.((s: LayerState) => setState(s));
  }, []);

  const layer = state?.connected ? state.layers.find(l => l.index === state.highestLayer) ?? state.layers[0] : null;

  return (
    <div className="layer-popup">
      {layer ? (
        <>
          <div className="layer-popup-header">
            <span className="led-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: LED_CSS_MAP[layer.ledColor] }} />
            <span>{layer.name}</span>
          </div>
          <div className="layer-popup-viewport" style={{ width: KEYBOARD_WIDTH * POPUP_SCALE, height: KEYBOARD_HEIGHT * POPUP_SCALE }}>
            <div
              className="keyboard-container"
              style={{ width: KEYBOARD_WIDTH, height: KEYBOARD_HEIGHT, transform: `scale(${POPUP_SCALE})`, transformOrigin: 'top left' }}
            >
              {renderHalf(layer, LEFT_KEYS, 'left')}
              {renderHalf(layer, RIGHT_KEYS, 'right')}
            </div>
          </div>
        </>
      ) : (
        <div className="layer-popup-empty">
          {state?.connected === false ? 'デバイス未接続' : '読み込み中...'}
        </div>
      )}
    </div>
  );
}
