import { useEffect, useRef, useState } from 'react';
import { KeyButton } from './components/KeyboardView/KeyButton';
import { LEFT_KEYS, RIGHT_KEYS, KeyPosition, positionToKeyId } from './data/layout';
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
  pressedPositions: number[];
}

function renderHalf(layer: Layer, positions: KeyPosition[], comboMap: Map<string, string>, amlExcluded: string[], pressedKeyIds: Set<string>, className: string) {
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
              // Reused as a "currently pressed" glow, not an editing selection --
              // this popup is read-only, so `selected` never means that here.
              selected={pressedKeyIds.has(pos!.id)}
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

// Leaves a little breathing room around the scaled content instead of
// letting it touch the window edges exactly.
const FIT_MARGIN = 0.94;

export function LayerPopup() {
  const [state, setState] = useState<LayerState | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    return api?.onLayerState?.((s: LayerState) => setState(s));
  }, []);

  useEffect(() => {
    const api = (window as any).electronAPI;
    return api?.onShowMinimap?.((show: boolean) => setShowMinimap(show));
  }, []);

  const layer = state?.connected ? state.layers.find(l => l.index === state.highestLayer) ?? state.layers[0] : null;

  // Rescale the content to fit whenever the window is resized or the
  // content's own natural size changes (e.g. the minimap being toggled).
  // offsetWidth/offsetHeight are layout measurements, unaffected by the
  // transform we apply below, so this doesn't feed back into itself.
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const recompute = () => {
      const { offsetWidth: w, offsetHeight: h } = content;
      if (!w || !h) return;
      const fit = Math.min(container.clientWidth / w, container.clientHeight / h) * FIT_MARGIN;
      setScale(fit > 0 ? fit : 1);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    ro.observe(content);
    // Belt-and-suspenders: some window-resize paths don't reliably trigger
    // ResizeObserver in every environment, but always fire a resize event.
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [layer, showMinimap]);

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

  const pressedKeyIds = new Set(state!.pressedPositions.map(positionToKeyId).filter((id): id is string => id !== null));

  return (
    <div className="layer-popup" onContextMenu={onContextMenu} ref={containerRef}>
      <div className="layer-popup-content" ref={contentRef} style={{ transform: `scale(${scale})` }}>
        <div className="layer-popup-header layer-popup-drag">
          <span className="led-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: LED_CSS_MAP[layer.ledColor] }} />
          <span>{layer.name}</span>
        </div>

        <div className="keyboard-container">
          {renderHalf(layer, LEFT_KEYS, comboMap, state!.amlExcluded, pressedKeyIds, 'left')}
          {renderHalf(layer, RIGHT_KEYS, comboMap, state!.amlExcluded, pressedKeyIds, 'right')}
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
    </div>
  );
}
