import { useEffect, useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { KeyBinding, LedColor, Modifier } from '../../types';
import { isConnected, getBleProfiles, setBleProfileName, getGestureLayers, setGestureLayers } from '../../services/usbService';
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
const GESTURE_POSITIONS: Record<Direction, string> = { up: 'R22', down: 'R02', left: 'R13', right: 'R11' };
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

export function BluetoothConfig({ store }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [gestureLayerMap, setGestureLayerMap] = useState<number[]>([]);
  const [gestureLoaded, setGestureLoaded] = useState(false);
  const [editingDevice, setEditingDevice] = useState<number | null>(null); // endpoint index
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

  // Ensures the given endpoint has an override layer assigned, allocating one
  // from the free pool if needed. Returns the layer id, or null if the pool
  // is exhausted.
  const ensureOverrideLayer = async (endpointIndex: number): Promise<number | null> => {
    const existing = gestureLayerMap[endpointIndex];
    if (existing) return existing;

    const used = new Set(gestureLayerMap.filter(v => v !== 0));
    const free = GESTURE_LAYER_POOL.find(l => !used.has(l));
    if (free === undefined) {
      alert('デバイス別ジェスチャに使える空きレイヤーがありません（最大5台まで）。');
      return null;
    }

    const newMap = [...gestureLayerMap];
    while (newMap.length <= endpointIndex) newMap.push(0);
    newMap[endpointIndex] = free;

    const ok = await setGestureLayers(true, newMap);
    if (!ok) return null;
    setGestureEnabled(true);
    setGestureLayerMap(newMap);
    return free;
  };

  const openGestureEditor = (endpointIndex: number, direction: Direction) => {
    if (editingDevice === endpointIndex && editingDirection === direction) {
      setEditingDevice(null);
      setEditingDirection(null);
      return;
    }
    setEditingDevice(endpointIndex);
    setEditingDirection(direction);
    setGestureSearch('');
    setGestureCategory(null);
    const layerId = gestureLayerMap[endpointIndex] || SHARED_GESTURE_LAYER;
    const current = bindingAt(store, layerId, GESTURE_POSITIONS[direction]);
    setGestureMods(current?.modifiers ?? []);
  };

  const applyGestureBinding = async (binding: KeyBinding) => {
    if (editingDevice === null || editingDirection === null) return;
    const layerId = await ensureOverrideLayer(editingDevice);
    if (layerId === null) return;
    const layerArrayIndex = store.layers.findIndex(l => l.index === layerId);
    if (layerArrayIndex === -1) return;
    store.updateKeyBinding(layerArrayIndex, GESTURE_POSITIONS[editingDirection], binding);
    setEditingDevice(null);
    setEditingDirection(null);
  };

  const resetToShared = () => {
    if (editingDevice === null || editingDirection === null) return;
    const shared = bindingAt(store, SHARED_GESTURE_LAYER, GESTURE_POSITIONS[editingDirection]);
    applyGestureBinding(shared ?? { type: 'none', keyCode: 'NONE', label: '' });
  };

  const devices: { endpointIndex: number; label: string; sub?: string }[] = [
    { endpointIndex: USB_ENDPOINT_INDEX, label: 'USB' },
    ...store.bluetoothProfiles.map(p => ({
      endpointIndex: BT_ENDPOINT_INDEX(p.index),
      label: `BT ${p.index}`,
      sub: p.name || undefined,
    })),
  ];

  return (
    <div>
      <div className="config-section">
        <div className="config-label">デバイス</div>
        <div className="config-description">
          出力先（USB・BT 0〜4）ごとにトラックボールジェスチャを個別設定できます。未設定のデバイスは共有ジェスチャ（Layer {SHARED_GESTURE_LAYER}）を使います。
        </div>

        {devices.map(dev => {
          const layerId = gestureLayerMap[dev.endpointIndex] || 0;
          const effectiveLayer = layerId || SHARED_GESTURE_LAYER;
          const isOverridden = layerId !== 0;
          return (
            <div key={dev.endpointIndex} className="config-section" style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{dev.label}</span>
                {dev.sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dev.sub}</span>}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {isOverridden ? `個別 (Layer ${layerId})` : '共有'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
                {(['up', 'down', 'left', 'right'] as const).map(dir => {
                  const dl = DIRECTION_LABELS[dir];
                  const binding = bindingAt(store, effectiveLayer, GESTURE_POSITIONS[dir]);
                  const active = editingDevice === dev.endpointIndex && editingDirection === dir;
                  return (
                    <button
                      key={dir}
                      className={`btn btn-outline ${active ? 'btn-active' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px', fontSize: 10, gap: 2 }}
                      onClick={() => openGestureEditor(dev.endpointIndex, dir)}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{dl.icon} {dl.label}</span>
                      <span style={{ fontWeight: 600 }}>{binding?.label || '---'}</span>
                    </button>
                  );
                })}
              </div>

              {editingDevice === dev.endpointIndex && editingDirection && (() => {
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
                      {dl.icon} {dl.label}ジェスチャを編集（{dev.label}）
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
          );
        })}

        <div className="config-description" style={{ marginTop: 8 }}>
          「デフォルト」はその方向の共有ジェスチャ（Layer {SHARED_GESTURE_LAYER}）の現在の割り当てをコピーします。編集内容は「Write」で書き込みます。
        </div>
      </div>

      <div className="config-section">
        <div className="config-label">Bluetooth プロファイル</div>
        <div className="config-description">
          キーボードがペアリングできるホスト枠（BT 0〜4）の一覧です。BT_SEL キーでこの番号を切り替えます。
        </div>

        {!loaded && (
          <div className="config-description">
            デバイスを接続・アンロックするとプロファイル一覧が表示されます
          </div>
        )}

        {store.bluetoothProfiles.map(profile => (
          <div key={profile.index} className={`bt-profile ${profile.active ? 'active' : ''}`}>
            <span className="led-dot" style={{
              width: 10, height: 10, borderRadius: '50%',
              background: LED_CSS[profile.ledColor], flexShrink: 0,
            }} />
            <span className="bt-profile-index">BT {profile.index}</span>
            <div className="bt-profile-info">
              {editingIndex === profile.index ? (
                <input
                  autoFocus
                  type="text"
                  style={{ fontSize: 12, padding: '2px 4px' }}
                  value={editValue}
                  maxLength={14}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') setEditingIndex(null);
                  }}
                />
              ) : (
                <div className="bt-profile-name">{profile.name || `Profile ${profile.index}`}</div>
              )}
              <div className="bt-profile-status">
                {profile.active ? '使用中' : profile.connected ? '接続済' : '未接続'}
              </div>
            </div>
            <button
              className="btn btn-outline"
              style={{ fontSize: 10, padding: '2px 6px' }}
              onClick={() => startEdit(profile.index, profile.name)}
            >✏️</button>
          </div>
        ))}

        <div className="config-description" style={{ marginTop: 12 }}>
          各プロファイルは1台のホスト（PC・スマホなど）とペアリングできます。
          「使用中」は現在の出力先として選択中の番号です。
        </div>
        <div className="config-description">
          BT番号の下の色は、そのプロファイル選択時に右（セントラル）側の LED が点灯する色です。
          鉛筆アイコンから各スロットに名前（最大14バイト・日本語約4文字）を付けられます。
          空にして保存するとアドレス表示に戻ります。
        </div>
      </div>
    </div>
  );
}
