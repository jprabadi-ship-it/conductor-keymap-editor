import { useEffect, useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { KeyBinding, LedColor, Modifier } from '../../types';
import { isConnected, getBleProfiles, setBleProfileName, getGestureLayers, setGestureLayers, getOsConfig, setOsConfig } from '../../services/usbService';
import { KEY_CATEGORIES, KEYCODES, searchKeyCodes } from '../../data/keycodes';
import { debugLog } from '../DebugConsole';

interface Props {
  store: KeymapStore;
}

const LED_CSS: Record<LedColor, string> = {
  black: 'var(--led-black)', red: 'var(--led-red)', green: 'var(--led-green)',
  yellow: 'var(--led-yellow)', blue: 'var(--led-blue)', magenta: 'var(--led-magenta)',
  cyan: 'var(--led-cyan)', white: 'var(--led-white)',
};

// zmk_endpoint_instance_to_index(): 0=NONE (unused here), 1=USB, 2..6=BT profile 0..4.
const USB_ENDPOINT_INDEX = 1;
const BT_ENDPOINT_INDEX = (btProfile: number) => 2 + btProfile;

// Empty placeholder layers (7-11) available as per-device gesture overrides.
const GESTURE_LAYER_POOL = [7, 8, 9, 10, 11];
const SHARED_GESTURE_LAYER = 13;

type Direction = 'up' | 'down' | 'left' | 'right';
// Must match the DT `positions = <7 27 16 18>;` order on trackball_gestures
// (monokey_R.overlay / monokey_dongle.overlay): up=7=R02, down=27=R22,
// left=16=R11, right=18=R13.
const GESTURE_POSITIONS: Record<Direction, string> = { up: 'R02', down: 'R22', left: 'R11', right: 'R13' };
const DIRECTION_LABELS: Record<Direction, { icon: string; label: string }> = {
  up: { icon: '↑', label: '上' }, down: { icon: '↓', label: '下' },
  left: { icon: '←', label: '左' }, right: { icon: '→', label: '右' },
};
const MOD_BUTTONS: { key: Modifier; label: string }[] = [
  { key: 'lctrl', label: '⌃' }, { key: 'lshift', label: '⇧' },
  { key: 'lalt', label: '⌥' }, { key: 'lgui', label: '⌘' },
];

function bindingAt(store: KeymapStore, layerId: number, keyId: string): KeyBinding | undefined {
  return store.layers.find(l => l.index === layerId)?.keys.find(k => k.id === keyId)?.binding;
}

interface DeviceEntry {
  endpointIndex: number;
  label: string;
  ledColor?: LedColor;
  btIndex?: number; // present for BT rows only (renameable)
  status?: string;
}

export function BluetoothConfig({ store }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [gestureLayerMap, setGestureLayerMap] = useState<number[]>([]);
  const [gestureLoaded, setGestureLoaded] = useState(false);
  const [osMap, setOsMap] = useState<number[]>([]);
  const [osLoaded, setOsLoaded] = useState(false);
  const [expandedDevice, setExpandedDevice] = useState<number | null>(null); // endpoint index
  const [editingDirection, setEditingDirection] = useState<Direction | null>(null);
  const [gestureSearch, setGestureSearch] = useState('');
  const [gestureCategory, setGestureCategory] = useState<string | null>(null);
  const [gestureMods, setGestureMods] = useState<Modifier[]>([]);

  // Load real profile names/connection state from the device on mount.
  useEffect(() => {
    if (!isConnected() || loaded) return;
    (async () => {
      const result = await getBleProfiles();
      if (result) {
        store.setBluetoothProfiles(store.bluetoothProfiles.map((p, i) => ({
          ...p,
          name: result.profiles[i]?.name ?? p.name,
          connected: result.profiles[i]?.connected ?? p.connected,
          active: i === result.activeIndex,
        })));
        debugLog('INF', 'Bluetooth', `Loaded ${result.profiles.length} BT profiles (active: ${result.activeIndex})`);
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Load the per-device gesture layer overrides on mount.
  useEffect(() => {
    if (!isConnected() || gestureLoaded) return;
    (async () => {
      const result = await getGestureLayers();
      if (result) {
        setGestureEnabled(result.enabled);
        setGestureLayerMap(result.layerMap);
        debugLog('INF', 'Gesture', `Loaded gesture layer map: [${result.layerMap.join(',')}]`);
      }
      setGestureLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestureLoaded]);

  // Load the per-device keymap overlay assignments on mount.
  useEffect(() => {
    if (!isConnected() || osLoaded) return;
    (async () => {
      const result = await getOsConfig();
      if (result) {
        setOsMap(result.osMap);
        debugLog('INF', 'Keymap', `Loaded OS overlay map: [${result.osMap.join(',')}]`);
      }
      setOsLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osLoaded]);

  const startEdit = (index: number, currentName: string) => {
    setEditingIndex(index);
    setEditValue(currentName);
  };

  const commitEdit = async () => {
    if (editingIndex === null) return;
    const index = editingIndex;
    const name = editValue.trim();
    setEditingIndex(null);
    const ok = await setBleProfileName(index, name);
    if (ok) {
      store.setBluetoothProfiles(store.bluetoothProfiles.map((p, i) => i === index ? { ...p, name } : p));
    }
  };

  // Auto-allocates a layer from the placeholder pool (7-11) for gesture
  // overrides. If the device already has a manually-picked キーマップ overlay
  // layer (osMap), gestures reuse that same layer instead of taking a second
  // one from the pool. Returns the layer id, or null if the pool is exhausted.
  const resolveOrAllocateLayer = (endpointIndex: number): number | null => {
    const existing = gestureLayerMap[endpointIndex] || osMap[endpointIndex];
    if (existing) return existing;

    const used = new Set([...gestureLayerMap, ...osMap].filter(v => v !== 0));
    const free = GESTURE_LAYER_POOL.find(l => !used.has(l));
    if (free === undefined) {
      alert('デバイス別設定に使える空きレイヤーがありません（最大5台まで）。');
      return null;
    }
    return free;
  };

  const setKeymapOverlay = async (endpointIndex: number, layerId: number) => {
    const newMap = [...osMap];
    while (newMap.length <= endpointIndex) newMap.push(0);
    newMap[endpointIndex] = layerId;
    const ok = await setOsConfig(true, newMap);
    if (ok) setOsMap(newMap);
  };

  const toggleExpanded = (endpointIndex: number) => {
    if (expandedDevice === endpointIndex) {
      setExpandedDevice(null);
      setEditingDirection(null);
      return;
    }
    setExpandedDevice(endpointIndex);
    setEditingDirection(null);
  };

  const openDirection = (endpointIndex: number, direction: Direction) => {
    if (expandedDevice === endpointIndex && editingDirection === direction) {
      setEditingDirection(null);
      return;
    }
    setEditingDirection(direction);
    setGestureSearch('');
    setGestureCategory(null);
    const layerId = gestureLayerMap[endpointIndex] || SHARED_GESTURE_LAYER;
    const current = bindingAt(store, layerId, GESTURE_POSITIONS[direction]);
    setGestureMods(current?.modifiers ?? []);
  };

  const applyGestureBinding = async (binding: KeyBinding) => {
    if (expandedDevice === null || editingDirection === null) return;
    const layerId = resolveOrAllocateLayer(expandedDevice);
    if (layerId === null) return;

    if (!gestureLayerMap[expandedDevice]) {
      const newMap = [...gestureLayerMap];
      while (newMap.length <= expandedDevice) newMap.push(0);
      newMap[expandedDevice] = layerId;
      const ok = await setGestureLayers(true, newMap);
      if (!ok) return;
      setGestureEnabled(true);
      setGestureLayerMap(newMap);
    }

    const layerArrayIndex = store.layers.findIndex(l => l.index === layerId);
    if (layerArrayIndex === -1) return;
    store.updateKeyBinding(layerArrayIndex, GESTURE_POSITIONS[editingDirection], binding);
    setEditingDirection(null);
  };

  const resetToShared = () => {
    if (expandedDevice === null || editingDirection === null) return;
    const shared = bindingAt(store, SHARED_GESTURE_LAYER, GESTURE_POSITIONS[editingDirection]);
    applyGestureBinding(shared ?? { type: 'none', keyCode: 'NONE', label: '' });
  };

  const devices: DeviceEntry[] = [
    { endpointIndex: USB_ENDPOINT_INDEX, label: 'USB' },
    ...store.bluetoothProfiles.map(p => ({
      endpointIndex: BT_ENDPOINT_INDEX(p.index),
      label: `BT ${p.index}`,
      ledColor: p.ledColor,
      btIndex: p.index,
      status: p.active ? '使用中' : p.connected ? '接続済' : '未接続',
    })),
  ];

  return (
    <div>
      <div className="config-section">
        <div className="config-label">デバイス</div>
        <div className="config-description">
          出力先（USB・BT 0〜4）ごとの設定です。クリックしてトラックボールジェスチャを個別設定できます。未設定のデバイスは共有ジェスチャ（Layer {SHARED_GESTURE_LAYER}）を使います。
        </div>

        {!loaded && (
          <div className="config-description">
            デバイスを接続・アンロックすると一覧が表示されます
          </div>
        )}

        {devices.map(dev => {
          const layerId = gestureLayerMap[dev.endpointIndex] || 0;
          const effectiveLayer = layerId || SHARED_GESTURE_LAYER;
          const hasKeymapOverlay = (osMap[dev.endpointIndex] || 0) !== 0;
          const hasGestureOverride = layerId !== 0;
          const isExpanded = expandedDevice === dev.endpointIndex;
          return (
            <div key={dev.endpointIndex}>
              <div
                className={`bt-profile ${isExpanded ? 'active' : ''}`}
                onClick={() => toggleExpanded(dev.endpointIndex)}
              >
                {dev.ledColor && (
                  <span className="led-dot" style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: LED_CSS[dev.ledColor], flexShrink: 0,
                  }} />
                )}
                <span className="bt-profile-index">{dev.label}</span>
                <div className="bt-profile-info">
                  {dev.btIndex !== undefined && editingIndex === dev.btIndex ? (
                    <input
                      autoFocus
                      type="text"
                      style={{ fontSize: 12, padding: '2px 4px' }}
                      value={editValue}
                      maxLength={14}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit();
                        if (e.key === 'Escape') setEditingIndex(null);
                      }}
                    />
                  ) : (
                    <div className="bt-profile-name">
                      {dev.btIndex !== undefined ? (store.bluetoothProfiles[dev.btIndex]?.name || `Profile ${dev.btIndex}`) : 'USB接続'}
                    </div>
                  )}
                  <div className="bt-profile-status">
                    {dev.status && `${dev.status} ・ `}
                    {hasKeymapOverlay ? '個別キーマップ' : '共有キーマップ'}
                    {hasGestureOverride && ' ・ 個別ジェスチャ'}
                  </div>
                </div>
                {dev.btIndex !== undefined && (
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 10, padding: '2px 6px' }}
                    onClick={e => { e.stopPropagation(); startEdit(dev.btIndex!, store.bluetoothProfiles[dev.btIndex!]?.name || ''); }}
                  >✏️</button>
                )}
              </div>

              {isExpanded && (
                <div style={{ padding: '4px 8px 12px' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>キーマップ</span>
                    <select
                      value={osMap[dev.endpointIndex] || 0}
                      onChange={e => setKeymapOverlay(dev.endpointIndex, Number(e.target.value))}
                      style={{ fontSize: 11, padding: '2px 4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
                    >
                      <option value={0}>なし（共有キーマップ）</option>
                      {store.layers.filter(l => l.index !== 0).map(l => (
                        <option key={l.index} value={l.index}>{l.name} (Layer {l.index})</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ジェスチャ</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
                    {(['up', 'down', 'left', 'right'] as const).map(dir => {
                      const dl = DIRECTION_LABELS[dir];
                      const binding = bindingAt(store, effectiveLayer, GESTURE_POSITIONS[dir]);
                      const active = editingDirection === dir;
                      return (
                        <button
                          key={dir}
                          className={`btn btn-outline ${active ? 'btn-active' : ''}`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px', fontSize: 10, gap: 2 }}
                          onClick={() => openDirection(dev.endpointIndex, dir)}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>{dl.icon} {dl.label}</span>
                          <span style={{ fontWeight: 600 }}>{binding?.label || '---'}</span>
                        </button>
                      );
                    })}
                  </div>

                  {editingDirection && (() => {
                    const dir = editingDirection;
                    const dl = DIRECTION_LABELS[dir];
                    const filteredKeycodes = gestureSearch
                      ? searchKeyCodes(gestureSearch)
                      : KEYCODES.filter(kc => kc.category === (gestureCategory || 'Navigation'));
                    const toggleMod = (mod: Modifier) => {
                      setGestureMods(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]);
                    };
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                          {dl.icon} {dl.label}ジェスチャを編集
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          {MOD_BUTTONS.map(m => (
                            <button key={m.key}
                              className={`btn btn-outline ${gestureMods.includes(m.key) ? 'btn-active' : ''}`}
                              style={{ fontSize: 12, padding: '4px 8px', minWidth: 32 }}
                              onClick={() => toggleMod(m.key)}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                        <input
                          value={gestureSearch}
                          onChange={e => setGestureSearch(e.target.value)}
                          placeholder="キーを検索 (例: TAB, UP, C)"
                          style={{ width: '100%', padding: '4px 8px', fontSize: 11, marginBottom: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)' }}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 4 }}>
                          {KEY_CATEGORIES.filter(c => ['Letters', 'Numbers', 'Navigation', 'Symbols', 'Media', 'Function', 'Modifiers'].includes(c)).map(cat => (
                            <button key={cat} className={`btn btn-outline ${gestureCategory === cat ? 'btn-active' : ''}`}
                              style={{ fontSize: 9, padding: '2px 4px' }}
                              onClick={() => { setGestureCategory(cat); setGestureSearch(''); }}>
                              {cat}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, maxHeight: 120, overflowY: 'auto', marginBottom: 4 }}>
                          {filteredKeycodes.slice(0, 40).map(kc => (
                            <button key={kc.code} className="keycode-btn"
                              style={{ fontSize: 10, padding: '4px 2px' }}
                              onClick={() => applyGestureBinding({
                                type: 'basic', keyCode: kc.code, label: kc.label,
                                modifiers: gestureMods.length > 0 ? gestureMods : undefined,
                              })}>
                              {kc.label}
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, flex: 1 }} onClick={resetToShared}>デフォルト</button>
                          <button className="btn btn-outline" style={{ fontSize: 11, flex: 1 }}
                            onClick={() => applyGestureBinding({ type: 'none', keyCode: 'NONE', label: '' })}>なし</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        <div className="config-description" style={{ marginTop: 8 }}>
          BT 0〜4は1台ずつホスト（PC・スマホなど）とペアリングできます。BT_SEL キーで切り替え、鉛筆アイコンから名前（最大14バイト・日本語約4文字）を付けられます。
          「デフォルト」はその方向の共有ジェスチャ（Layer {SHARED_GESTURE_LAYER}）の現在の割り当てをコピーします。編集内容は「Write」で書き込みます。
        </div>
      </div>
    </div>
  );
}
