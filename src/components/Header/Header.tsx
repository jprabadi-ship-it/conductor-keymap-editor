import { useState, useRef } from 'react';
import { KeymapStore } from '../../store/useKeymapStore';

interface Props {
  store: KeymapStore;
  showConsole: boolean;
  onToggleConsole: () => void;
  usbConnected: boolean;
  unsaved: boolean;
  onWrite: () => void;
  onRead: () => void;
  onSave: () => void;
}

export function Header({ store, showConsole, onToggleConsole, usbConnected, unsaved, onWrite, onRead, onSave }: Props) {
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
        if (data.version === 2 && data.layers && Array.isArray(data.layers)) {
          // Convert Conductor Studio export format to internal format
          const project = store.exportProject();
          project.layers = data.layers.map((dl: any, i: number) => {
            const existing = project.layers[i] || project.layers[0];
            const keys = existing.keys.map((k: any) => {
              const b = dl.bindings?.[k.id];
              if (!b) return { id: k.id, binding: { type: 'none', keyCode: 'NONE', label: '' } };
              const binding: any = { type: b.type === 'transparent' ? 'trans' : b.type, keyCode: b.keyCode, label: b.label };
              if (b.holdAction) {
                if (b.type === 'layer-tap') binding.layer = parseInt(b.holdAction.replace('Layer ', ''));
                if (b.type === 'mod-tap') binding.modifiers = [b.holdAction.toLowerCase()];
                binding.tapLabel = b.tapAction || b.label;
                binding.tapKeyCode = b.tapAction;
              }
              if (b.modifiers) binding.modifiers = b.modifiers.map((m: string) => m.toLowerCase());
              return { id: k.id, binding };
            });
            return { ...existing, name: dl.name || existing.name, index: dl.id ?? i, keys };
          });
          if (data.combos) project.combos = data.combos;
          if (data.macros) project.macros = data.macros;
          store.importProject(project);
        } else if (data.layers) {
          store.importProject(data);
        }
      } catch (err) {
        console.error('Import failed:', err);
        alert('ファイルの読み込みに失敗しました');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const layerName = store.selectedLayer?.name || '';

  return (
    <header className="header">
      <div className="header-title">
        <span>Conductor Studio 2.0</span>
      </div>
      <div className="header-breadcrumb">
        <span className="led-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--led-${store.selectedLayer?.ledColor || 'white'})`, display: 'inline-block' }} />
        <span>{layerName}</span>
      </div>

      <div className="header-spacer" />

      {/* USB connection status & device actions */}
      {usbConnected && (
        <>
          <button className="header-pill header-pill-live">
            <span className="header-pill-icon">⚡</span>
            USB Live
            <span className="header-pill-dot header-pill-dot-green" />
          </button>

          <button className={`header-pill ${unsaved ? 'header-pill-unsaved' : ''}`}>
            <span className="header-pill-dot" style={{ background: unsaved ? 'var(--warning)' : 'var(--success)' }} />
            {unsaved ? 'Unsaved' : 'Saved'}
          </button>

          <button className="header-action-btn" onClick={onWrite}>
            <span>↑</span> Write
          </button>
          <button className="header-action-btn" onClick={onRead}>
            <span>↓</span> Read
          </button>
          <button className="header-action-btn" onClick={onSave}>
            <span>💾</span> Save
          </button>
        </>
      )}

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
      </div>

      <button
        className="btn btn-outline"
        onClick={() => {
          if (confirm('キーマップを初期値にリセットしますか？\n現在の設定は失われます。')) {
            store.reset();
          }
        }}
        title="初期値にリセット"
        style={{ fontSize: 12 }}
      >⟳ Reset</button>

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

      <button
        className={`btn btn-icon ${showConsole ? 'btn-active' : ''}`}
        onClick={onToggleConsole}
        title="Toggle Debug Console"
        style={{ fontFamily: 'monospace', fontSize: 14 }}
      >&gt;_</button>

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
