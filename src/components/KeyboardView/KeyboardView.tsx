import { KeymapStore } from '../../store/useKeymapStore';
import { LEFT_KEYS, RIGHT_KEYS } from '../../data/layout';
import { KeyButton } from './KeyButton';
import { LedColor } from '../../types';
import { gestureBindingLabel } from '../../services/usbService';
import { SHARED_GESTURE_LAYER, GESTURE_POSITIONS, Direction, overrideSlot, buildDeviceEntries } from '../../data/devices';

interface Props {
  store: KeymapStore;
}

const LED_CSS_MAP: Record<LedColor, string> = {
  black: 'var(--led-black)', red: 'var(--led-red)', green: 'var(--led-green)',
  yellow: 'var(--led-yellow)', blue: 'var(--led-blue)', magenta: 'var(--led-magenta)',
  cyan: 'var(--led-cyan)', white: 'var(--led-white)',
};

// Reverse of GESTURE_POSITIONS: keyId -> direction, for the 4 gesture keys.
const KEY_ID_TO_DIRECTION: Record<string, Direction> = Object.fromEntries(
  (Object.entries(GESTURE_POSITIONS) as [Direction, string][]).map(([dir, keyId]) => [keyId, dir])
);

export function KeyboardView({ store }: Props) {
  const layer = store.selectedLayer;
  if (!layer) return null;

  const baseLayer = store.layers.find(l => l.index === 0);
  const diffActive = store.diffMode && layer.index !== 0 && !!baseLayer;
  const bindingKey = (b: typeof layer.keys[number]['binding']) =>
    JSON.stringify([b.type, b.keyCode, b.label, b.modifiers, b.layer, b.tapKeyCode, b.tapLabel]);

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

  // Gesture layer: preview/edit a specific device's effective binding (override,
  // falling back to the shared one shown here) for the 4 swipe-direction keys.
  const isGestureLayer = layer.index === SHARED_GESTURE_LAYER;
  const gestureDevice = store.selectedGestureDevice;
  const gestureDevices = isGestureLayer ? buildDeviceEntries(store.bluetoothProfiles, -1) : [];

  const handleKeyClick = (id: string) => {
    const direction = isGestureLayer ? KEY_ID_TO_DIRECTION[id] : undefined;
    if (direction && gestureDevice !== null) {
      // Route to the same per-device gesture editor the デバイス tab uses,
      // instead of the normal Key Config panel.
      store.setRightPanelTab('bluetooth');
      store.setExpandedDevice(gestureDevice);
      store.setEditingDirection(direction);
      return;
    }
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
    let keyConfig = layer.keys.find(k => k.id === id);
    if (!keyConfig) return <div key={id} />;

    const direction = isGestureLayer ? KEY_ID_TO_DIRECTION[id] : undefined;
    let deviceOverrideActive = false;
    if (direction && gestureDevice !== null) {
      const slot = overrideSlot(gestureDevice, direction);
      if (store.gestureHasOverride[slot]) {
        deviceOverrideActive = true;
        const label = gestureBindingLabel(store.gestureOverrides[slot]);
        keyConfig = { ...keyConfig, binding: { type: 'basic', keyCode: label, label } };
      }
    }

    const assignedMacro = macroAssignments.get(id);
    const isThisMacro = assignedMacro === selectedMacro?.name;
    const hasOtherMacro = assignedMacro && !isThisMacro;

    const diffChanged = diffActive && (() => {
      const baseBinding = baseLayer!.keys.find(k => k.id === id)?.binding;
      if (!baseBinding) return false;
      return bindingKey(baseBinding) !== bindingKey(keyConfig!.binding);
    })();

    return (
      <KeyButton
        key={id}
        keyConfig={keyConfig}
        selected={isMacroMode ? isThisMacro : direction && gestureDevice !== null ? store.editingDirection === direction : store.selectedKeyId === id}
        onClick={() => handleKeyClick(id)}
        comboName={comboMap.get(id)}
        isAmlExcluded={store.amlExcluded.includes(id)}
        macroHighlight={isMacroMode ? (isThisMacro ? 'assigned' : hasOtherMacro ? 'other' : undefined) : undefined}
        gestureDeviceOverride={deviceOverrideActive}
        diffChanged={diffChanged}
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
          disabled={layer.index === 0}
          title={layer.index === 0 ? 'baseレイヤーでは差分表示できません' : 'baseレイヤーとの差分をハイライト表示'}
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

        {isGestureLayer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>デバイス</span>
            <select
              value={gestureDevice === null ? '' : gestureDevice}
              onChange={e => store.setSelectedGestureDevice(e.target.value === '' ? null : Number(e.target.value))}
              style={{ fontSize: 11, padding: '2px 4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
            >
              <option value="">共有（デフォルト）</option>
              {gestureDevices.map(d => (
                <option key={d.endpointIndex} value={d.endpointIndex}>{d.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {diffActive && (
        <div className="aml-info" style={{ borderColor: 'var(--warning)' }}>
          <span className="key-btn diff-changed" style={{ display: 'inline-block', width: 10, height: 10, padding: 0, marginRight: 6, verticalAlign: 'middle' }} />
          枠がオレンジのキーは base レイヤーと異なります
        </div>
      )}

      {store.amlExcluded.length > 0 && (
        <div className="aml-info">
          ⊘ {store.amlExcluded.length}個のキーがAML excluded-positionsに設定済み（Writeで送信）
        </div>
      )}

      {isGestureLayer && gestureDevice !== null && (
        <div className="aml-info">
          {gestureDevices.find(d => d.endpointIndex === gestureDevice)?.label} の実効ジェスチャを表示中。
          矢印キー（↑↓←→の位置）をクリックすると、このデバイス専用のオーバーライドを編集できます。
        </div>
      )}

      <div className="keyboard-container">
        {renderHalf(LEFT_KEYS, 'left')}
        {renderHalf(RIGHT_KEYS, 'right', { row: 3, colStart: 2, colSpan: 2 })}
      </div>

      {isMacroMode && selectedMacro && (
        <div className="keyboard-hint">
          Click a key to assign/unassign &quot;{selectedMacro.name}&quot;
        </div>
      )}

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
