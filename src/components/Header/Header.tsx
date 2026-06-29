import { useState, useRef } from 'react';
import { version } from '../../../package.json';
import { KeymapStore } from '../../store/useKeymapStore';
import { setKeyboardLayout, relabelBindings } from '../../services/usbService';

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
  const [showChangelog, setShowChangelog] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('conductor-theme') || 'dark');
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
          setKeyboardLayout(project.osLayout || 'us');
        } else if (data.layers) {
          store.importProject(data);
          if (data.osLayout) setKeyboardLayout(data.osLayout);
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
        <span style={{ cursor: 'pointer' }} onClick={() => setShowChangelog(true)}>ConductorD Studio v{version}</span>
      </div>

      {showChangelog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowChangelog(false)}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, maxWidth: 520, maxHeight: '70vh', overflowY: 'auto', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>Version History</h2>
              <button className="btn btn-icon" onClick={() => setShowChangelog(false)} style={{ fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { v: '0.10.1', changes: ['トラックボール設定に機能キャプション追加', 'セクション間隔の調整'] },
                { v: '0.10.0', changes: ['AML 持続時間スライダー追加', 'AML設定適用ボタンのデザイン改善'] },
                { v: '0.9.1', changes: ['Record ボタンを目立つ位置に移動'] },
                { v: '0.9.0', changes: ['マクロレコーディングモード（キー入力キャプチャ）'] },
                { v: '0.8.2', changes: ['Export ボタンを File にリネーム'] },
                { v: '0.8.1', changes: ['デバッグコンソール背景をテーマ変数に統一'] },
                { v: '0.8.0', changes: ['トースト通知', 'Read 時の未保存確認ダイアログ', 'レイヤー名の保持', 'Undo スタック上限 50'] },
                { v: '0.7.4', changes: ['レイヤースイッチャーの折り返し防止'] },
                { v: '0.7.3', changes: ['「Click a key to configure」ヒント削除'] },
                { v: '0.7.2', changes: ['バージョン履歴にパッチバージョンを含める'] },
                { v: '0.7.1', changes: ['バージョン履歴ダイアログ'] },
                { v: '0.7.0', changes: ['ダーク/ライトモード切替'] },
                { v: '0.6.15', changes: ['マウスボタンのビットフラグ修正（MB3=4）'] },
                { v: '0.6.14', changes: ['TS ビルドエラー修正'] },
                { v: '0.6.13', changes: ['マウスキー（Click/R Click/M Click）の正しい書き込みと表示'] },
                { v: '0.6.12', changes: ['デバッグコンソールのコピーボタン'] },
                { v: '0.6.11', changes: ['Mod-Tap の param1=hold, param2=tap エンコード修正'] },
                { v: '0.6.10', changes: ['Basic モディファイア（グレー）と Mod-Tap ホールド（オレンジ）の色分け'] },
                { v: '0.6.9', changes: ['Read 時にモディファイア付き basic キーのモディファイアを分離'] },
                { v: '0.6.8', changes: ['右 Shift 等でも Shifted シンボル表示（RS+; → :）'] },
                { v: '0.6.7', changes: ['Basic キーのモディファイアを HID param にエンコード', 'モディファイア付きキーの左下表示'] },
                { v: '0.6.6', changes: ['dirty keys の layer index 不一致修正'] },
                { v: '0.6.5', changes: ['左モディファイアに L プレフィックス統一'] },
                { v: '0.6.4', changes: ['デバイス読み込み mod-tap のホールドラベル表示'] },
                { v: '0.6.3', changes: ['タップキー中央・ホールドアクション左下表示'] },
                { v: '0.6.2', changes: ['選択キーの背景を明るく'] },
                { v: '0.6.1', changes: ['ジェスチャキーピッカーにモディファイアトグル追加'] },
                { v: '0.6.0', changes: ['ジェスチャショートカットのインラインキーピッカー'] },
                { v: '0.5.11', changes: ['トラックボールクリックで Trackball タブを開く'] },
                { v: '0.5.10', changes: ['トラックボールプレースホルダーを真円に'] },
                { v: '0.5.9', changes: ['トラックボールプレースホルダーを円形表示'] },
                { v: '0.5.8', changes: ['Read 後にマクロキーをエディタ名で表示'] },
                { v: '0.5.7', changes: ['& キーのマクロ誤判定修正'] },
                { v: '0.5.6', changes: ['None キーにキーコード選択時に type を basic に変更'] },
                { v: '0.5.5', changes: ['Shifted シンボル（! @ # $ 等）をキーコードに追加'] },
                { v: '0.5.4', changes: ['エクスポート/インポートに amlExcluded 追加', 'インポート時のレイアウト同期'] },
                { v: '0.5.3', changes: ['Macros タブで右パネル自動最大化'] },
                { v: '0.5.2', changes: ['右パネル最大幅を 800px に拡大'] },
                { v: '0.5.1', changes: ['マクロモード時のキーボードビュー自動縮小'] },
                { v: '0.5.0', changes: ['Macros タブでレイアウト入替（マクロ中央、キーボード右）'] },
                { v: '0.4.1', changes: ['リアルタイム US/JIS レイアウト切替'] },
                { v: '0.4.0', changes: ['US/JIS キーボードレイアウト切替'] },
                { v: '0.3.0', changes: ['動的マクロスロット対応', 'マクロ Write to Device → NVS 永続化', 'マクロのランタイム反映', 'マクロ削除時の NVS クリア', 'USB 切断時の UI リセット', 'pite1222 依存の除去'] },
                { v: '0.2.0', changes: ['ZMK Studio プロトコル対応', 'キーマップ Read/Write', 'トラックボール設定', 'タッピングターム設定'] },
                { v: '0.1.0', changes: ['初期実装', 'レイアウトエディタ', 'USB 接続', 'デバッグコンソール'] },
              ].map(({ v, changes }) => (
                <div key={v}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>v{v}</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {changes.map((c, i) => <li key={i} style={{ color: 'var(--text-secondary)' }}>{c}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
          onClick={() => { store.setOsLayout('us'); setKeyboardLayout('us'); store.relabelLayers(); }}
        >US</button>
        <button
          className={`btn ${store.osLayout === 'jis' ? 'btn-active' : ''}`}
          onClick={() => { store.setOsLayout('jis'); setKeyboardLayout('jis'); store.relabelLayers(); }}
        >JIS</button>
      </div>

      <button
        className="btn btn-icon"
        title="Toggle dark/light mode"
        onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('conductor-theme', next);
          setTheme(next);
        }}
        style={{ fontSize: 14 }}
      >{theme === 'light' ? '🌙' : '☀️'}</button>

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
          📁 File
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
