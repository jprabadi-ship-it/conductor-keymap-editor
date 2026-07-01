import { useEffect, useState } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';
import { LedColor } from '../../types';
import { isConnected, getBleProfiles, setBleProfileName } from '../../services/usbService';
import { debugLog } from '../DebugConsole';

interface Props {
  store: KeymapStore;
}

const LED_CSS: Record<LedColor, string> = {
  black: 'var(--led-black)', red: 'var(--led-red)', green: 'var(--led-green)',
  yellow: 'var(--led-yellow)', blue: 'var(--led-blue)', magenta: 'var(--led-magenta)',
  cyan: 'var(--led-cyan)', white: 'var(--led-white)',
};

export function BluetoothConfig({ store }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

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

  return (
    <div>
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
