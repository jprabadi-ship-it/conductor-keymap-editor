import { useState, useRef } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';

interface Props {
  store: KeymapStore;
}

export function Header({ store }: Props) {
  const [showExport, setShowExport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = store.exportProject();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'conductor-keymap.json';
    a.click();
    URL.revokeObjectURL(url);
    setShowExport(false);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
    setShowExport(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        store.importProject(data);
      } catch { /* ignore invalid files */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const layerName = store.selectedLayer?.name || '';

  return (
    <header className="header">
      <div className="header-title">
        <span>←</span>
        <a href="/">Conductor Studio 2.0</a>
      </div>
      <div className="header-breadcrumb">
        <span className="led-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--led-${store.selectedLayer?.ledColor || 'white'})`, display: 'inline-block' }} />
        <span>{layerName}</span>
      </div>

      <div className="header-spacer" />

      <div className="btn-group">
        <button
          className={`btn ${store.osLayout === 'us' ? 'btn-active' : ''}`}
          onClick={() => store.setOsLayout('us')}
        >US</button>
        <button
          className={`btn ${store.osLayout === 'jis' ? 'btn-active' : ''}`}
          onClick={() => store.setOsLayout('jis')}
        >JIS</button>
      </div>

      <div className="header-group">
        <button className="btn btn-icon" onClick={store.undo} disabled={!store.canUndo} title="Undo">↩</button>
        <button className="btn btn-icon" onClick={store.redo} disabled={!store.canRedo} title="Redo">↪</button>
        <button className="btn btn-icon" onClick={store.reset} title="Reset">⟳</button>
      </div>

      <div style={{ position: 'relative' }}>
        <button className="btn btn-primary" onClick={() => setShowExport(!showExport)}>
          ↓ Export
        </button>
        {showExport && (
          <div className="export-dropdown">
            <button className="export-item" onClick={handleExport}>
              <span className="export-item-title">Export .json</span>
              <span className="export-item-desc">Full project (layers + combos + macros)</span>
            </button>
            <button className="export-item" onClick={handleImport}>
              <span className="export-item-title">Import .json</span>
              <span className="export-item-desc">Load saved project file</span>
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </header>
  );
}
