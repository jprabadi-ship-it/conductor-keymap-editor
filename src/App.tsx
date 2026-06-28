import { useEffect } from 'react';
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

function App() {
  const store = useKeymapStore();

  // Auto-save on changes
  useEffect(() => {
    const timer = setTimeout(() => store.autoSave(), 500);
    return () => clearTimeout(timer);
  }, [store.layers, store.combos, store.osLayout]);

  const rightPanelContent = () => {
    switch (store.rightPanelTab) {
      case 'key-config': return <KeyConfig store={store} />;
      case 'trackball': return <TrackballConfig store={store} />;
      case 'timing': return <TimingConfig store={store} />;
      case 'bluetooth': return <BluetoothConfig store={store} />;
    }
  };

  return (
    <>
      <Header store={store} />

      <div className="app-layout">
        {/* Left Panel */}
        <aside className="left-panel">
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
          </div>

          <div className="panel-content">
            {store.leftPanelTab === 'layers' ? <LayerList store={store} /> : <ComboList store={store} />}
          </div>

          <ConnectionPanel />
        </aside>

        {/* Main keyboard view */}
        <KeyboardView store={store} />

        {/* Right Panel */}
        <aside className="right-panel">
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
