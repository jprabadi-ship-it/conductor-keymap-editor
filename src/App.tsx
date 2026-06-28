import { useEffect, useState, useCallback } from 'react';
import { useKeymapStore } from './store/useKeymapStore';
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

const LEFT_MIN = 160;
const LEFT_MAX = 400;
const RIGHT_MIN = 200;
const RIGHT_MAX = 480;

function App() {
  const store = useKeymapStore();
  const [leftWidth, setLeftWidth] = useState(224);
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
        onWrite={() => { setUnsaved(false); }}
        onRead={() => {}}
        onSave={() => { setUnsaved(false); }}
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
            onConnectionChange={(conn, type) => {
              setUsbConnected(conn && type === 'usb');
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
