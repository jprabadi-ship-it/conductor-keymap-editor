import { useEffect, useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { KeyBinding, LedColor, Modifier } from '../../types';
import {
  isConnected, getBleProfiles, setBleProfileName, getOsConfig, setOsConfig, getUsbName, setUsbName,
  getGestureConfig, setGestureEnabled, setGestureBinding, resolveKeyBindingRpc, gestureBindingLabel,
  ensureBehaviorsLoaded, GestureBindingValue,
} from '../../services/usbService';
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

// Shared/default gesture bindings live on this fixed keymap layer (DT
// `layer-id = <13>;`), read-only from here — used only to preview/copy the
// fallback binding. Per-device overrides are a separate value, not a layer
// position (see conductor_gesture.c / get/set_gesture_config RPC).
const SHARED_GESTURE_LAYER = 13;

type Direction = 'up' | 'down' | 'left' | 'right';
// Must match the DT `positions = <7 27 16 18>;` order on trackball_gestures
// (monokey_R.overlay / monokey_dongle.overlay): up=7=R02, down=27=R22,
// left=16=R11, right=18=R13.
const GESTURE_POSITIONS: Record<Direction, string> = { up: 'R02', down: 'R22', left: 'R11', right: 'R13' };
// Matches the firmware's internal gesture_direction enum and the wire
// SetGestureBindingRequest.direction encoding: 0=up, 1=down, 2=left, 3=right.
const DIRECTION_INDEX: Record<Direction, number> = { up: 0, down: 1, left: 2, right: 3 };
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
  const [editingIndex, setEditingIndex] = useState<number | 'usb' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [usbName, setUsbNameState] = useState('');
  const [usbNameLoaded, setUsbNameLoaded] = useState(false);

  const [gestureHasOverride, setGestureHasOverride] = useState<boolean[]>([]);
  const [gestureOverrides, setGestureOverrides] = useState<GestureBindingValue[]>([]);
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

  // Load the per-device gesture binding overrides on mount.
  useEffect(() => {
    if (!isConnected() || gestureLoaded) return;
    (async () => {
      await ensureBehaviorsLoaded(); // so gestureBindingLabel() can resolve names
      const result = await getGestureConfig();
      if (result) {
        setGestureHasOverride(result.hasOverride);
        setGestureOverrides(result.overrides);
        debugLog('INF', 'Gesture', `Loaded gesture config: enabled=${result.enabled}, ${result.hasOverride.filter(Boolean).length} override(s)`);
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

  // Load the USB device name on mount.
  useEffect(() => {
    if (!isConnected() || usbNameLoaded) return;
    (async () => {
      const name = await getUsbName();
      if (name !== null) {
        setUsbNameState(name);
        debugLog('INF', 'USB', `Loaded USB name: "${name}"`);
      }
      setUsbNameLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usbNameLoaded]);

  const startEdit = (index: number | 'usb', currentName: string) => {
    setEditingIndex(index);
    setEditValue(currentName);
  };

  const commitEdit = async () => {
    if (editingIndex === null) return;
    const index = editingIndex;
    const name = editValue.trim();
    setEditingIndex(null);
    if (index === 'usb') {
      const ok = await setUsbName(name);
      if (ok) setUsbNameState(name);
      return;
    }
    const ok = await setBleProfileName(index, name);
    if (ok) {
      store.setBluetoothProfiles(store.bluetoothProfiles.map((p, i) => i === index ? { ...p, name } : p));
    }
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

  const overrideSlot = (endpointIndex: number, direction: Direction) => endpointIndex * 4 + DIRECTION_INDEX[direction];

  const openDirection = (endpointIndex: number, direction: Direction) => {
    if (expandedDevice === endpointIndex && editingDirection === direction) {
      setEditingDirection(null);
      return;
    }
    setEditingDirection(direction);
    setGestureSearch('');
    setGestureCategory(null);
    // Only the shared/default binding carries structured modifiers here (an
    // override is a raw behaviorId/param1 value); seed from that when there's
    // no override yet, otherwise start blank.
    const idx = overrideSlot(endpointIndex, direction);
    if (!gestureHasOverride[idx]) {
      const shared = bindingAt(store, SHARED_GESTURE_LAYER, GESTURE_POSITIONS[direction]);
      setGestureMods(shared?.modifiers ?? []);
    } else {
      setGestureMods([]);
    }
  };

  const applyGestureBinding = async (binding: KeyBinding) => {
    if (expandedDevice === null || editingDirection === null) return;
    const resolved = await resolveKeyBindingRpc(binding);
    if (!resolved) {
      alert('このキーの変換に失敗しました（ファームウェアにKey Press/Noneビヘイビアが見つかりません）。');
      return;
    }
    const idx = overrideSlot(expandedDevice, editingDirection);
    const ok = await setGestureBinding(expandedDevice, DIRECTION_INDEX[editingDirection], false, resolved);
    if (!ok) return;
    await setGestureEnabled(true);
    setGestureHasOverride(prev => { const next = [...prev]; next[idx] = true; return next; });
    setGestureOverrides(prev => { const next = [...prev]; next[idx] = resolved; return next; });
    setEditingDirection(null);
  };

  const resetToShared = async () => {
    if (expandedDevice === null || editingDirection === null) return;
    const idx = overrideSlot(expandedDevice, editingDirection);
    const ok = await setGestureBinding(expandedDevice, DIRECTION_INDEX[editingDirection], true);
    if (!ok) return;
    setGestureHasOverride(prev => { const next = [...prev]; next[idx] = false; return next; });
    setEditingDirection(null);
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
          出力先（USB・BT 0〜4）ごとの設定です。クリックしてトラックボールジェスチャを個別設定できます。未設定の方向は共有ジェスチャ（Layer {SHARED_GESTURE_LAYER}）を使います。
        </div>

        {!loaded && (
          <div className="config-description">
            デバイスを接続・アンロックすると一覧が表示されます
          </div>
        )}

        {devices.map(dev => {
          const hasKeymapOverlay = (osMap[dev.endpointIndex] || 0) !== 0;
          const hasGestureOverride = (['up', 'down', 'left', 'right'] as const)
            .some(dir => gestureHasOverride[overrideSlot(dev.endpointIndex, dir)]);
          const isExpanded = expandedDevice === dev.endpointIndex;
          const editKey: number | 'usb' = dev.btIndex !== undefined ? dev.btIndex : 'usb';
          const currentName = dev.btIndex !== undefined ? (store.bluetoothProfiles[dev.btIndex]?.name || '') : usbName;
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
                  {editingIndex === editKey ? (
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
                      {currentName || (dev.btIndex !== undefined ? `Profile ${dev.btIndex}` : 'USB接続')}
                    </div>
                  )}
                  <div className="bt-profile-status">
                    {dev.status && `${dev.status} ・ `}
                    {hasKeymapOverlay ? '個別キーマップ' : '共有キーマップ'}
                    {hasGestureOverride && ' ・ 個別ジェスチャ'}
                  </div>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 10, padding: '2px 6px' }}
                  onClick={e => { e.stopPropagation(); startEdit(editKey, currentName); }}
                >✏️</button>
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
                      const idx = overrideSlot(dev.endpointIndex, dir);
                      const label = gestureHasOverride[idx]
                        ? gestureBindingLabel(gestureOverrides[idx])
                        : (bindingAt(store, SHARED_GESTURE_LAYER, GESTURE_POSITIONS[dir])?.label || '---');
                      const active = editingDirection === dir;
                      return (
                        <button
                          key={dir}
                          className={`btn btn-outline ${active ? 'btn-active' : ''}`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px', fontSize: 10, gap: 2 }}
                          onClick={() => openDirection(dev.endpointIndex, dir)}
                        >
                          <span style={{ color: 'var(--text-muted)' }}>{dl.icon} {dl.label}</span>
                          <span style={{ fontWeight: 600 }}>{label}</span>
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
          「デフォルト」はその方向のオーバーライドを解除し、共有ジェスチャ（Layer {SHARED_GESTURE_LAYER}）に戻します。ジェスチャの変更は即座に反映されます（Write不要）。
        </div>
      </div>
    </div>
  );
}
