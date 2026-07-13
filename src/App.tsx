import { useEffect, useState, useCallback, useRef } from 'react';
import { useKeymapStore } from './store/useKeymapStore';
import { readKeymap, writeKeymapToDevice, saveChanges, setLayerProps, getDeviceInfo, requestUnlock, isUnlocked, readMacrosFromDevice, onDeviceDisconnect, onActiveLayerChange, onKeyInputEvent, subscribeToInput, getRuntimeState, setKeyboardLayout, getBehaviorDisplayName, getCombosFromDevice, writeCombosToDevice } from './services/usbService';
import { isFirmwareVersionSupported, MIN_SUPPORTED_FW_VERSION } from './services/firmwareCompat';
import { LED_COLORS, type PanelTab } from './types';
import { debugLog } from './components/DebugConsole';
import { Header } from './components/Header/Header';
import { LayerList } from './components/LeftPanel/LayerList';
import { ComboList } from './components/LeftPanel/ComboList';
import { KeyboardView } from './components/KeyboardView/KeyboardView';
import { KeyConfig } from './components/RightPanel/KeyConfig';
import { TrackballConfig } from './components/RightPanel/TrackballConfig';
import { TimingConfig } from './components/RightPanel/TimingConfig';
import { BluetoothConfig } from './components/RightPanel/BluetoothConfig';
import { DiagnosticsPanel } from './components/RightPanel/DiagnosticsPanel';
import { MacroList } from './components/LeftPanel/MacroList';
import { MacroEditor } from './components/RightPanel/MacroEditor';
import { DebugConsole } from './components/DebugConsole';

function App() {
  const store = useKeymapStore();
  const [showConsole, setShowConsole] = useState(false);
  const [usbConnected, setUsbConnected] = useState(false); // true for either transport (USB or BLE)
  const [connType, setConnType] = useState<'usb' | 'bluetooth' | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'device' | 'local' | 'error' | 'progress' } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highestLayer, setHighestLayer] = useState(0);
  const [pressedPositions, setPressedPositions] = useState<number[]>([]);
  const [popupBattery, setPopupBattery] = useState<{ l: number | null; r: number | null } | null>(null);
  // Once a Write lands on the device, offer the "back to the minimap"
  // shortcut in the header (Electron only).
  const [wroteToDevice, setWroteToDevice] = useState(false);

  const showToast = useCallback((message: string, type: 'device' | 'local' | 'error' | 'progress' = 'device', opts?: { persist?: boolean }) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    if (!opts?.persist) {
      toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
    }
  }, []);

  useEffect(() => {
    onDeviceDisconnect(() => { setUsbConnected(false); setConnType(null); setPressedPositions([]); });
    onActiveLayerChange(setHighestLayer);
    onKeyInputEvent((position, pressed) => {
      setPressedPositions(prev => {
        if (pressed) return prev.includes(position) ? prev : [...prev, position];
        return prev.includes(position) ? prev.filter(p => p !== position) : prev;
      });
    });
    setKeyboardLayout(store.osLayout);
  }, []);

  // Active layer isn't reliably pushed by every firmware build yet, so poll
  // as a fallback alongside the layerChanged notification handled above --
  // whichever arrives first wins, the other just confirms the same value.
  useEffect(() => {
    if (!usbConnected) return;
    let cancelled = false;
    const poll = async () => {
      const state = await getRuntimeState();
      if (!cancelled && state) {
        setHighestLayer(state.highestLayer);
        // Keep the same object reference when values haven't changed, so the
        // IPC relay effect below doesn't re-fire on every 1s poll tick.
        setPopupBattery(prev =>
          prev && prev.l === state.peripheralL && prev.r === state.peripheralR
            ? prev
            : { l: state.peripheralL, r: state.peripheralR });
      }
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); setPopupBattery(null); };
  }, [usbConnected]);

  // Live key-press streaming, for the tray popup's light-up-on-press guide.
  useEffect(() => {
    if (usbConnected) subscribeToInput(true);
  }, [usbConnected]);

  // Relays live layer state to the Electron main process, which forwards it
  // to the menu-bar tray's small popup window (see electron/main.cjs). A
  // no-op in a plain browser tab, where window.electronAPI doesn't exist.
  useEffect(() => {
    (window as any).electronAPI?.sendLayerState?.({
      layers: store.layers, combos: store.combos, amlExcluded: store.amlExcluded,
      highestLayer, connected: usbConnected, pressedPositions, battery: popupBattery,
    });
  }, [store.layers, store.combos, store.amlExcluded, highestLayer, usbConnected, pressedPositions, popupBattery]);

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(() => store.autoSave(), 500);
    if (usbConnected) setUnsaved(true);
    return () => clearTimeout(timer);
  }, [store.layers, store.combos, store.macros, store.osLayout]);

  // Pulls the keymap from the device and applies it to the local store.
  // Called both from the header's explicit "Read" button and automatically
  // right after connecting, so the editor never starts from stale local
  // state that could get pushed back to the device on the next Write.
  const handleRead = async () => {
    if (unsaved) {
      if (!confirm('未保存の変更があります。デバイスから読み込むと上書きされます。続けますか？')) return;
    }
    const result = await readKeymap();
    if (result?.layers) {
      const project = store.exportProject();
      project.layers = result.layers.map((dl: any, i: number) => {
        const existing = project.layers[i] || project.layers[0];
        const keys = existing.keys.map((k: any) => ({
          id: k.id,
          binding: dl.bindings[k.id] || { type: 'none', keyCode: 'NONE', label: '' },
        }));
        const isGenericName = !dl.name || dl.name.length === 0 || /^Layer \d+$/.test(dl.name);
        const name = isGenericName && existing.name ? existing.name : (dl.name || existing.name);
        const ledColor = dl.ledColor ?? existing.ledColor;
        return { ...existing, name, ledColor, index: dl.id ?? i, keys };
      });
      // Load firmware macros via RPC (with step data)
      const deviceMacros = await readMacrosFromDevice();
      if (deviceMacros && deviceMacros.length > 0) {
        project.macros = deviceMacros;
        // Re-map macro key labels: DT name → editor name
        for (const layer of project.layers) {
          for (const key of layer.keys) {
            if (key.binding.keyCode?.startsWith('&') && key.binding.keyCode.length > 1) {
              const dtName = key.binding.keyCode.substring(1);
              const macro = deviceMacros.find(m => m.deviceId !== undefined &&
                getBehaviorDisplayName(m.deviceId) === dtName);
              if (macro && macro.name !== dtName) {
                key.binding.label = `&${macro.name}`;
                key.binding.keyCode = `&${macro.name}`;
              }
            }
          }
        }
        debugLog('INF', 'Editor', `Firmware macros loaded with steps: ${deviceMacros.map(m => `${m.name}(${m.bindings.length})`).join(', ')}`);
      } else if (result.firmwareMacros?.length > 0) {
        const fwMacros = result.firmwareMacros.map((m: any) => ({
          name: m.name,
          waitMs: 30,
          tapMs: 30,
          bindings: [],
        }));
        project.macros = fwMacros;
        debugLog('INF', 'Editor', `Firmware macros loaded (no step data): ${fwMacros.map((m: any) => m.name).join(', ')}`);
      }
      // Combos: read after macros so binding labels referencing a macro
      // (&macro_name) resolve to the editor's friendly name, not the raw
      // device behavior name.
      const deviceCombos = await getCombosFromDevice();
      if (deviceCombos) {
        project.combos = deviceCombos;
        debugLog('INF', 'Editor', `Combos loaded: ${deviceCombos.length}`);
      }
      store.importProject(project);
      store.clearDirtyKeys();
      setUnsaved(false);
      debugLog('INF', 'Editor', `Keymap applied: ${result.layers.length} layers`);
      showToast(`${result.layers.length} layers loaded from device`);
    }
  };

  // Single unified tab bar below the keyboard -- only one of these eight
  // panels is ever showing at a time (see PanelTab in types.ts).
  const TABS: { key: PanelTab; label: string; badge?: number }[] = [
    { key: 'layers', label: '⚙ Layers' },
    { key: 'combos', label: '⌨ Combos', badge: store.combos.length },
    { key: 'macros', label: '⚡ Macros', badge: store.macros.length },
    { key: 'key-config', label: '⚙ Key Config' },
    { key: 'trackball', label: '🖲 Trackball' },
    { key: 'timing', label: '⏱ Timing' },
    { key: 'bluetooth', label: '📡 デバイス' },
    { key: 'diagnostics', label: '🩺 診断' },
  ];

  const panelContent = () => {
    switch (store.activeTab) {
      case 'layers': return <LayerList store={store} />;
      case 'combos': return <ComboList store={store} />;
      case 'macros': return store.selectedMacroIndex !== null ? <MacroEditor store={store} /> : <MacroList store={store} />;
      case 'key-config': return <KeyConfig store={store} />;
      case 'trackball': return <TrackballConfig store={store} />;
      case 'timing': return <TimingConfig store={store} />;
      case 'bluetooth': return <BluetoothConfig store={store} />;
      case 'diagnostics': return <DiagnosticsPanel />;
    }
  };

  return (
    <>
      <Header
        store={store}
        showConsole={showConsole}
        onToggleConsole={() => setShowConsole(v => !v)}
        usbConnected={usbConnected}
        connectionType={connType}
        onConnectionChange={async (conn, type) => {
          setUsbConnected(conn);
          setConnType(conn ? type : null);
          if (conn) {
            const info = await getDeviceInfo();
            if (info) {
              debugLog('INF', 'USB', `Device: ${info.name} (FW: ${info.firmwareVersion})`);
              if (isFirmwareVersionSupported(info.firmwareVersion) === false) {
                debugLog('WRN', 'USB', `Firmware ${info.firmwareVersion} is older than the minimum supported ${MIN_SUPPORTED_FW_VERSION} -- some RPCs (device slot switching, peripheral connection status, etc.) may silently fail or time out.`);
                alert(`接続中のファームウェア (${info.firmwareVersion}) は、このStudioが前提とする最小バージョン (${MIN_SUPPORTED_FW_VERSION}) より古いです。\n\n一部の機能（デバイス設定バックアップ、接続状態表示など）が動作しない、または反応が遅くなることがあります。ファームウェアの更新をおすすめします。`);
              }
            }
            const ok = await requestUnlock();
            if (!ok) {
              debugLog('WRN', 'USB', 'Device is locked. Write operations will fail. Press studio_unlock combo on keyboard.');
            }
          }
        }}
        unsaved={unsaved}
        wroteToDevice={wroteToDevice}
        onWrite={async () => {
          try {
            if (!isUnlocked()) {
              debugLog('WRN', 'Editor', 'Device is locked. Attempting unlock...');
              const unlocked = await requestUnlock();
              if (!unlocked) {
                debugLog('ERR', 'Editor', 'Cannot write: device is locked. Press studio_unlock combo on keyboard.');
                alert('デバイスがロックされています。キーボードのstudio_unlockコンボを押してからもう一度試してください。');
                return;
              }
            }
            showToast('書き込み処理中...', 'progress', { persist: true });
            debugLog('INF', 'Editor', `Writing keymap to device... (${store.dirtyKeys.size} keys modified)`);
            // Write layer names + LED colors
            for (const layer of store.layers) {
              await setLayerProps(layer.index, layer.name, LED_COLORS.indexOf(layer.ledColor));
            }
            debugLog('INF', 'Editor', `Layer names and LED colors written (${store.layers.length} layers)`);
            // Write key bindings
            const ok = await writeKeymapToDevice(store.layers, store.dirtyKeys);
            // Combos persist themselves per-RPC (no separate save step, unlike
            // the keymap subsystem's saveChanges() below) -- write regardless
            // of keymap dirty-key tracking, same as layer names/colors above.
            const combosOk = await writeCombosToDevice(store.combos);
            if (!combosOk) {
              debugLog('WRN', 'Editor', 'Some combos failed to write -- check the console for details');
            } else {
              debugLog('INF', 'Editor', `Combos written (${store.combos.length})`);
            }
            if (!ok) {
              debugLog('ERR', 'Editor', 'Write failed: device not connected');
              showToast('書き込みに失敗しました（未接続）', 'error');
              return;
            }
            const saved = await saveChanges();
            if (!saved) {
              debugLog('ERR', 'Editor', 'Write failed: could not save to device flash -- check the console for details');
              showToast('書き込みに失敗しました（Flash保存エラー）', 'error');
              return;
            }
            store.clearDirtyKeys();
            setUnsaved(false);
            setWroteToDevice(true);
            debugLog('INF', 'Editor', 'Keymap written and saved to device flash');
            showToast('実機のFlashに書き込みました', 'device');
          } catch (e: any) {
            debugLog('ERR', 'Editor', `Write failed: ${e.message}`);
            showToast(`書き込みに失敗しました: ${e.message}`, 'error');
          }
        }}
        onRead={handleRead}
        onSave={() => {
          store.autoSave();
          setUnsaved(false);
          debugLog('INF', 'Editor', 'Saved to LocalStorage');
          showToast('ブラウザのLocalStorageに保存しました', 'local');
        }}
      />

      <div className="app-layout">
        <div className="center-column">
          <KeyboardView store={store} />
          <div className="tab-panel">
            <div className="panel-tabs">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`panel-tab ${store.activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => store.setActiveTab(tab.key)}
                >
                  {tab.label}
                  {tab.badge !== undefined && <span className="badge">{tab.badge}</span>}
                </button>
              ))}
            </div>
            <div className="panel-content">
              {panelContent()}
            </div>
          </div>
        </div>
      </div>

      <DebugConsole visible={showConsole} />

      {/* Footer */}
      <footer className="footer">
        <span className="footer-item">Conductor Monokey</span>
        <span className="footer-item">{store.layers.length} layers</span>
        <span className="footer-item">40 keys</span>
        <span className="footer-item">Cached</span>
        <span className="footer-spacer" />
        <span className="footer-item">Auto-saved to LocalStorage</span>
      </footer>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'device' ? 'var(--success)' : toast.type === 'local' ? 'var(--info)' : toast.type === 'progress' ? 'var(--warning)' : 'var(--danger)',
          color: 'white', padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          zIndex: 2000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.type === 'device' ? '🔌' : toast.type === 'local' ? '💾' : toast.type === 'progress' ? '⏳' : '✗'} {toast.message}
        </div>
      )}
    </>
  );
}

export default App;
