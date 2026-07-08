import { useState, useRef } from 'react';
import { version } from '../../../package.json';
import { KeymapStore } from '../../store/useKeymapStore';
import { setKeyboardLayout } from '../../services/usbService';

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

// Electron ships its own app -- only the plain web build (GitHub Pages)
// needs a way to get the desktop one.
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
const MAC_APP_DOWNLOAD_URL = 'https://github.com/jprabadi-ship-it/conductor-keymap-editor/releases/latest/download/ConductorD-Studio-mac-arm64.dmg';

export function Header({ store, showConsole, onToggleConsole, usbConnected, unsaved, onWrite, onRead, onSave }: Props) {
  const [showExport, setShowExport] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('conductor-theme') || 'light');
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
                { v: '0.13.0.0', at: '2026-06-30 07:43 JST', changes: ['AML持続時間のFW RPC対応（duration_ms）'] },
                { v: '0.12.4.0', at: '2026-06-30 07:31 JST', changes: ['AML詳細設定ボタンからコンボタブのAML編集を直接展開'] },
                { v: '0.12.3.0', at: '2026-06-30 07:27 JST', changes: ['ライトモードを初期テーマに変更'] },
                { v: '0.12.2.0', at: '2026-06-30 07:23 JST', changes: ['導線ボタンをアクセントカラーに統一'] },
                { v: '0.12.1.0', at: '2026-06-30 07:18 JST', changes: ['AML詳細設定をコンボタブに移動', 'トラボAMLタブはクイックON/OFFのみに'] },
                { v: '0.12.0.0', at: '2026-06-30 07:09 JST', changes: ['コンボごとのAML抑制フラグ追加'] },
                { v: '0.11.2.0', at: '2026-06-30 07:02 JST', changes: ['AML除外キーをミニキーボードで選択可能に'] },
                { v: '0.11.1.0', at: '2026-06-30 06:59 JST', changes: ['コンボタブのAML重複を削除（トラックボールAMLタブに一本化）'] },
                { v: '0.11.0.0', at: '2026-06-30 06:49 JST', changes: ['トラックボール設定を AML / ジェスチャ / カーソル の3タブに分割'] },
                { v: '0.10.2.0', at: '2026-06-30 06:44 JST', changes: ['保存ボタンの対象範囲をグループヘッダーで明示'] },
                { v: '0.10.1.0', at: '2026-06-30 06:41 JST', changes: ['トラックボール設定に機能キャプション追加', 'セクション間隔の調整'] },
                { v: '0.10.0.0', at: '2026-06-30 06:38 JST', changes: ['AML 持続時間スライダー追加', 'AML設定適用ボタンのデザイン改善'] },
                { v: '0.9.1.0', at: '2026-06-30 06:32 JST', changes: ['Record ボタンを目立つ位置に移動'] },
                { v: '0.9.0.0', at: '2026-06-30 06:23 JST', changes: ['マクロレコーディングモード（キー入力キャプチャ）'] },
                { v: '0.8.2.0', at: '2026-06-29 14:54 JST', changes: ['Export ボタンを File にリネーム'] },
                { v: '0.8.1.0', at: '2026-06-29 14:53 JST', changes: ['デバッグコンソール背景をテーマ変数に統一'] },
                { v: '0.8.0.0', at: '2026-06-29 14:52 JST', changes: ['トースト通知', 'Read 時の未保存確認ダイアログ', 'レイヤー名の保持', 'Undo スタック上限 50'] },
                { v: '0.7.4.0', at: '2026-06-29 14:46 JST', changes: ['レイヤースイッチャーの折り返し防止'] },
                { v: '0.7.3.0', at: '2026-06-29 14:43 JST', changes: ['「Click a key to configure」ヒント削除'] },
                { v: '0.7.2.0', at: '2026-06-29 14:42 JST', changes: ['バージョン履歴にパッチバージョンを含める'] },
                { v: '0.7.1.0', at: '2026-06-29 14:40 JST', changes: ['バージョン履歴ダイアログ'] },
                { v: '0.7.0.0', at: '2026-06-29 14:34 JST', changes: ['ダーク/ライトモード切替'] },
                { v: '0.6.15.0', at: '2026-06-29 14:23 JST', changes: ['マウスボタンのビットフラグ修正（MB3=4）'] },
                { v: '0.6.14.0', at: '2026-06-29 13:57 JST', changes: ['TS ビルドエラー修正'] },
                { v: '0.6.13.0', at: '2026-06-29 13:22 JST', changes: ['マウスキー（Click/R Click/M Click）の正しい書き込みと表示'] },
                { v: '0.6.12.0', at: '2026-06-29 13:15 JST', changes: ['デバッグコンソールのコピーボタン'] },
                { v: '0.6.11.0', at: '2026-06-29 13:11 JST', changes: ['Mod-Tap の param1=hold, param2=tap エンコード修正'] },
                { v: '0.6.10.0', at: '2026-06-29 13:05 JST', changes: ['Basic モディファイア（グレー）と Mod-Tap ホールド（オレンジ）の色分け'] },
                { v: '0.6.9.0', at: '2026-06-29 13:01 JST', changes: ['Read 時にモディファイア付き basic キーのモディファイアを分離'] },
                { v: '0.6.8.0', at: '2026-06-29 12:57 JST', changes: ['右 Shift 等でも Shifted シンボル表示（RS+; → :）'] },
                { v: '0.6.7.0', at: '2026-06-29 12:49 JST', changes: ['Basic キーのモディファイアを HID param にエンコード', 'モディファイア付きキーの左下表示'] },
                { v: '0.6.6.0', at: '2026-06-29 12:46 JST', changes: ['dirty keys の layer index 不一致修正'] },
                { v: '0.6.5.0', at: '2026-06-29 12:41 JST', changes: ['左モディファイアに L プレフィックス統一'] },
                { v: '0.6.4.0', at: '2026-06-29 12:38 JST', changes: ['デバイス読み込み mod-tap のホールドラベル表示'] },
                { v: '0.6.3.0', at: '2026-06-29 12:16 JST', changes: ['タップキー中央・ホールドアクション左下表示'] },
                { v: '0.6.2.0', at: '2026-06-29 12:12 JST', changes: ['選択キーの背景を明るく'] },
                { v: '0.6.1.0', at: '2026-06-29 12:08 JST', changes: ['ジェスチャキーピッカーにモディファイアトグル追加'] },
                { v: '0.6.0.0', at: '2026-06-29 12:05 JST', changes: ['ジェスチャショートカットのインラインキーピッカー'] },
                { v: '0.5.11.0', at: '2026-06-29 11:49 JST', changes: ['トラックボールクリックで Trackball タブを開く'] },
                { v: '0.5.10.0', at: '2026-06-29 11:46 JST', changes: ['トラックボールプレースホルダーを真円に'] },
                { v: '0.5.9.0', at: '2026-06-29 11:43 JST', changes: ['トラックボールプレースホルダーを円形表示'] },
                { v: '0.5.8.0', at: '2026-06-29 11:27 JST', changes: ['Read 後にマクロキーをエディタ名で表示'] },
                { v: '0.5.7.0', at: '2026-06-29 11:21 JST', changes: ['& キーのマクロ誤判定修正'] },
                { v: '0.5.6.0', at: '2026-06-29 10:59 JST', changes: ['None キーにキーコード選択時に type を basic に変更'] },
                { v: '0.5.5.0', at: '2026-06-29 10:52 JST', changes: ['Shifted シンボル（! @ # $ 等）をキーコードに追加'] },
                { v: '0.5.4.0', at: '2026-06-29 10:27 JST', changes: ['エクスポート/インポートに amlExcluded 追加', 'インポート時のレイアウト同期'] },
                { v: '0.5.3.0', at: '2026-06-29 10:24 JST', changes: ['Macros タブで右パネル自動最大化'] },
                { v: '0.5.2.0', at: '2026-06-29 10:21 JST', changes: ['右パネル最大幅を 800px に拡大'] },
                { v: '0.5.1.0', at: '2026-06-29 10:16 JST', changes: ['マクロモード時のキーボードビュー自動縮小'] },
                { v: '0.5.0.0', at: '2026-06-29 10:04 JST', changes: ['Macros タブでレイアウト入替（マクロ中央、キーボード右）'] },
                { v: '0.4.1.0', at: '2026-06-29 09:58 JST', changes: ['リアルタイム US/JIS レイアウト切替'] },
                { v: '0.4.0.0', at: '2026-06-29 09:52 JST', changes: ['US/JIS キーボードレイアウト切替'] },
                { v: '0.3.5.0', at: '2026-06-28 17:27 JST', changes: ['ファームウェアマクロ検出のデバッグログ追加'] },
                { v: '0.3.4.0', at: '2026-06-28 17:22 JST', changes: ['Read 時にファームウェアマクロを自動検出'] },
                { v: '0.3.3.0', at: '2026-06-28 17:13 JST', changes: ['kp/mkp 衝突とマクロ behavior 名検索を修正'] },
                { v: '0.3.2.0', at: '2026-06-28 17:10 JST', changes: ['マクロデバッグ用に全 behavior 名をログ出力'] },
                { v: '0.3.0.0', at: '2026-06-28 16:46 JST', changes: ['フルマクロエディタとキーピッカーを実装'] },
                { v: '0.2.1.0', at: '2026-06-28 16:17 JST', changes: ['デプロイ検証用のバージョン更新'] },
                { v: '0.2.0.0', at: '2026-06-28 16:10 JST', changes: ['ZMK Studio プロトコル対応', 'キーマップ Read/Write', 'トラックボール設定', 'タッピングターム設定'] },
                { v: '0.1.0.0', at: '2026-06-28 09:08 JST', changes: ['初期実装', 'レイアウトエディタ', 'USB 接続', 'デバッグコンソール'] },
              ].map(({ v, at, changes }) => (
                <div key={v}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>v{v}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>{at}</div>
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

      {!isElectron && (
        <a className="header-action-btn" href={MAC_APP_DOWNLOAD_URL} style={{ textDecoration: 'none' }}>
          <span>⬇</span> Macアプリダウンロード
        </a>
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
