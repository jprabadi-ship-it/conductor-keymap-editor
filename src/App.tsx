import { useEffect, useState, useCallback } from 'react';
import { useKeymapStore } from './store/useKeymapStore';
import { readKeymap, writeKeymapToDevice, saveChanges, setLayerProps, getDeviceInfo, requestUnlock, isUnlocked, connectUsb as connectUsbService, disconnectUsb, readMacrosFromDevice } from './services/usbService';
import { debugLog } from './components/DebugConsole';
import { Header } from './components/Header/Header';
import { LayerList } from './components/LeftPanel/LayerList';
import { ComboList } from './components/LeftPanel/ComboList';
import { ConnectionPanel } from './components/LeftPanel/ConnectionPanel';
import { KeyboardView } from './components/KeyboardView/KeyboardView';
import { KeyConfig } from './components/RightPanel/KeyConfig';
import { TrackballConfig } from './components/RightPanel/TrackballConfig';
import { TimingConfig } from './components/RightPanel/TimingConfig';
import { BluetoothConfig } from './components/RightPanel/BluetoothConfig';
import { MacroList } from './components/LeftPanel/MacroList';
import { MacroEditor } from './components/RightPanel/MacroEditor';
import { ResizeHandle } from './components/ResizeHandle';
import { DebugConsole } from './components/DebugConsole';

const LEFT_MIN = 200;
const LEFT_MAX = 500;
const RIGHT_MIN = 200;
const RIGHT_MAX = 480;

function App() {
  const store = useKeymapStore();
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(340);
  const [showConsole, setShowConsole] = useState(false);
  const [usbConnected, setUsbConnected] = useState(false);
  const [unsaved, setUnsaved] = useState(false);

  const onResizeLeft = useCallback((delta: number) => {
    setLeftWidth(prev => Math.max(LEFT_MIN, Math.min(LEFT_MAX, prev + delta)));
  }, []);

  const onResizeRight = useCallback((delta: number) => {
    setRightWidth(prev => Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, prev + delta)));
  }, []);

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(() => store.autoSave(), 500);
    if (usbConnected) setUnsaved(true);
    return () => clearTimeout(timer);
  }, [store.layers, store.combos, store.macros, store.osLayout]);

  const rightPanelContent = () => {
    switch (store.rightPanelTab) {
      case 'key-config': return <KeyConfig store={store} />;
      case 'trackball': return <TrackballConfig store={store} />;
      case 'timing': return <TimingConfig store={store} />;
      case 'macro-edit': return <MacroEditor store={store} />;
      case 'bluetooth': return <BluetoothConfig store={store} />;
    }
  };

  return (
    <>
      <Header
        store={store}
        showConsole={showConsole}
        onToggleConsole={() => setShowConsole(v => !v)}
        usbConnected={usbConnected}
        unsaved={unsaved}
        onWrite={async () => {
          if (!isUnlocked()) {
            debugLog('WRN', 'Editor', 'Device is locked. Attempting unlock...');
            const unlocked = await requestUnlock();
            if (!unlocked) {
              debugLog('ERR', 'Editor', 'Cannot write: device is locked. Press studio_unlock combo on keyboard.');
              alert('デバイスがロックされています。キーボードのstudio_unlockコンボを押してからもう一度試してください。');
              return;
            }
          }
          debugLog('INF', 'Editor', `Writing keymap to device... (${store.dirtyKeys.size} keys modified)`);
          // Write layer names
          for (const layer of store.layers) {
            await setLayerProps(layer.index, layer.name);
          }
          debugLog('INF', 'Editor', `Layer names written (${store.layers.length} layers)`);
          // Write key bindings
          const ok = await writeKeymapToDevice(store.layers, store.dirtyKeys);
          if (ok) {
            const saved = await saveChanges();
            if (saved) {
              store.clearDirtyKeys();
              setUnsaved(false);
              debugLog('INF', 'Editor', 'Keymap written and saved to device flash');
            }
          }
        }}
        onRead={async () => {
          const result = await readKeymap();
          if (result?.layers) {
            const project = store.exportProject();
            project.layers = result.layers.map((dl: any, i: number) => {
              const existing = project.layers[i] || project.layers[0];
              const keys = existing.keys.map((k: any) => ({
                id: k.id,
                binding: dl.bindings[k.id] || { type: 'none', keyCode: 'NONE', label: '' },
              }));
              const name = dl.name && dl.name.length > 0 ? dl.name : existing.name;
              return { ...existing, name, index: dl.id ?? i, keys };
            });
            // Load firmware macros via RPC (with step data)
            const deviceMacros = await readMacrosFromDevice();
            if (deviceMacros && deviceMacros.length > 0) {
              project.macros = deviceMacros;
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
            store.importProject(project);
            store.clearDirtyKeys();
            setUnsaved(false);
            debugLog('INF', 'Editor', `Keymap applied: ${result.layers.length} layers`);
          }
        }}
        onSave={() => {
          store.autoSave();
          setUnsaved(false);
          debugLog('INF', 'Editor', 'Saved to LocalStorage');
        }}
      />

      <div className="app-layout">
        {/* Left Panel */}
        <aside className="left-panel" style={{ width: leftWidth }}>
          <div className="panel-tabs">
            <button
              className={`panel-tab ${store.leftPanelTab === 'layers' ? 'active' : ''}`}
              onClick={() => store.setLeftPanelTab('layers')}
            >
              ⚙ Layers
            </button>
            <button
              className={`panel-tab ${store.leftPanelTab === 'combos' ? 'active' : ''}`}
              onClick={() => store.setLeftPanelTab('combos')}
            >
              ⌨ Combos <span className="badge">{store.combos.length}</span>
            </button>
            <button
              className={`panel-tab ${store.leftPanelTab === 'macros' ? 'active' : ''}`}
              onClick={() => store.setLeftPanelTab('macros')}
            >
              ⚡ Macros <span className="badge">{store.macros.length}</span>
            </button>
          </div>

          <div className="panel-content">
            {store.leftPanelTab === 'layers' ? <LayerList store={store} />
              : store.leftPanelTab === 'combos' ? <ComboList store={store} />
              : <MacroList store={store} />}
          </div>

          <ConnectionPanel
            connected={usbConnected}
            connectionType={usbConnected ? 'usb' : null}
            onConnectionChange={async (conn, type) => {
              setUsbConnected(conn && type === 'usb');
              if (conn) {
                setShowConsole(true);
                const info = await getDeviceInfo();
                if (info) {
                  debugLog('INF', 'USB', `Device: ${info.name} (FW: ${info.firmwareVersion})`);
                }
                const ok = await requestUnlock();
                if (!ok) {
                  debugLog('WRN', 'USB', 'Device is locked. Write operations will fail. Press studio_unlock combo on keyboard.');
                }
              }
            }}
          />
        </aside>

        <ResizeHandle side="left" onResize={onResizeLeft} />

        {/* Main keyboard view */}
        <KeyboardView store={store} />

        <ResizeHandle side="right" onResize={onResizeRight} />

        {/* Right Panel */}
        <aside className="right-panel" style={{ width: rightWidth }}>
          <div className="right-panel-tabs">
            {(['key-config', 'trackball', 'timing', 'bluetooth'] as const).map(tab => (
              <button
                key={tab}
                className={`right-panel-tab ${store.rightPanelTab === tab ? 'active' : ''}`}
                onClick={() => store.setRightPanelTab(tab)}
              >
                {tab === 'key-config' ? '⚙ Key Config' :
                 tab === 'trackball' ? '🖲 Trackball' :
                 tab === 'timing' ? '⏱ Timing' : '📡 Bluetooth'}
              </button>
            ))}
          </div>
          <div className="right-panel-content">
            {rightPanelContent()}
          </div>
        </aside>
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
    </>
  );
}

export default App;
