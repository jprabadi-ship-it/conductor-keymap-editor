import { useState, useRef } from 'react';
import { version } from '../../../package.json';
import { KeymapStore } from '../../store/useKeymapStore';
import { applyDeviceSettingsSnapshot, collectDeviceSettingsSnapshot, setKeyboardLayout } from '../../services/usbService';
import { ConnectionPanel } from '../LeftPanel/ConnectionPanel';

interface Props {
  store: KeymapStore;
  showConsole: boolean;
  onToggleConsole: () => void;
  usbConnected: boolean;
  connectionType: 'usb' | 'bluetooth' | null;
  onConnectionChange: (connected: boolean, type: 'usb' | 'bluetooth' | null) => void;
  unsaved: boolean;
  onWrite: () => void;
  wroteToDevice?: boolean;
  onRead: () => void;
  onSave: () => void;
}

// Electron ships its own app -- only the plain web build (GitHub Pages)
// needs a way to get the desktop one.
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;
// Versioned filename so the downloaded file says which release it is. The
// web build and the app are released in lockstep (same version bump), so
// the latest release always carries the asset matching this web version.
// A version-less ConductorD-Studio-mac-arm64.dmg is also uploaded to each
// release for older links.
const MAC_APP_DOWNLOAD_URL = `https://github.com/jprabadi-ship-it/conductor-keymap-editor/releases/latest/download/ConductorD-Studio-${version}-mac-arm64.dmg`;

export function Header({ store, showConsole, onToggleConsole, usbConnected, connectionType, onConnectionChange, unsaved, onWrite, wroteToDevice, onRead, onSave }: Props) {
  const [showExport, setShowExport] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('conductor-theme') || 'light');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    const data = store.exportProject();
    if (usbConnected) {
      // Backing up every USB slot / BLE profile's trackball settings means
      // briefly cycling the device's active output through all of them
      // (real transport switches, not just reads) — surface that before
      // doing it rather than silently changing what host the keyboard is
      // talking to.
      const includeAllSlotProfiles = window.confirm(
        '全スロット分のトラックボール設定もバックアップするには、実機の出力先を一時的に順番に切り替えます（BLE接続の場合、切断されることがあります）。続行しますか？\n\n「キャンセル」を選ぶと、現在のスロットの設定のみバックアップします。'
      );
      data.deviceSettings = await collectDeviceSettingsSnapshot({ includeAllSlotProfiles });
    }
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
    reader.onload = async (ev) => {
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
          if (data.deviceSettings && usbConnected) {
            const ok = await applyDeviceSettingsSnapshot(data.deviceSettings);
            if (!ok) alert('一部の実機設定を復元できませんでした。Debug Consoleを確認してください。');
          }
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
                { v: '0.25.1.0', at: '2026-07-13 JST', changes: ['「デバイス機能」を専用リスト（ピンチズーム・AML切替・スリープ）に変更し、AML切替を実際に選択・保存できるように対応（firmwareの&aml_togに接続）。ピンチズーム・スリープは現行firmwareで未実装のため選択不可表示。あわせて、前バージョンで追加したMouse/DeviceカテゴリのキーコードがWrite時に正しいbehaviorへ解決されていなかった不具合を修正'] },
                { v: '0.25.0.0', at: '2026-07-12 JST', changes: ['コンボ編集画面を強化。BINDING TYPEに「Mouse Button」「デバイス機能」を追加（クリックでOUTPUT KEYのカテゴリ欄も自動でジャンプ）、OUTPUT KEYを単純なテキスト入力からカテゴリ別キーコードピッカー（検索・Letters/Numbers/Mouse/Deviceなど全カテゴリ表示）に変更'] },
                { v: '0.24.3.0', at: '2026-07-12 JST', changes: ['キーボード左右の隙間が不自然に広かった不具合を修正。可変グリッド設定がCSSの詳細度不足で固定48pxグリッドに上書きされ、各半分の箱の中でキーが左寄せになり右端に余白ができていたのが原因'] },
                { v: '0.24.2.0', at: '2026-07-12 JST', changes: ['キーボードが左右均等にセンタリングされていなかった不具合を修正。縦スクロールバーを画面全体ではなくタブ内容の領域だけに持たせるよう変更し、スクロールバー分の幅のズレが解消'] },
                { v: '0.24.1.0', at: '2026-07-12 JST', changes: ['統合タブバーの幅を672px→820pxに拡大し、「診断」タブが2行目に折り返されていたのを修正（8タブ全てが1行に収まるように）'] },
                { v: '0.24.0.0', at: '2026-07-12 JST', changes: ['レイアウトを再設計。Layers/Combos/Macros と Key Config/Trackball/Timing/デバイス/診断 の8タブを1本の横並びタブバーに統合し、キーボード直下に配置。常に1つのパネルだけを表示する形に変更（前バージョンの「横並び2パネル」表示は撤回）'] },
                { v: '0.23.1.0', at: '2026-07-12 JST', changes: ['キーボード・レイヤー/コンボ/マクロ一覧・右側の設定パネルを、通常の横長ウィンドウでは横並び表示に変更（縦長ウィンドウ時のみ従来通り縦積み）。今週の変更で常時縦積みになっていたのを、横幅がある場合は横並びに戻した'] },
                { v: '0.23.0.0', at: '2026-07-12 JST', changes: ['接続パネル・実機診断に peripheral(L/R) の実際の接続状態を表示（要ファームウェア0.6.12+、バッテリー値からの推測表示だった旧FWでは引き続き推測表示）。あわせて、接続時にファームウェアが最小対応バージョンより古い場合に警告するように変更'] },
                { v: '0.22.0.0', at: '2026-07-12 JST', changes: ['実機診断タブに「📋 コピー」ボタンを追加。表示中の診断内容をテキストとしてクリップボードにコピーし、不具合報告時に貼り付けやすく'] },
                { v: '0.21.0.0', at: '2026-07-12 JST', changes: ['デバイス(BT/USB)設定コピーを複数選択・一括適用に対応。コピー先を個別にチェック、または「すべて選択」で全デバイスへ一度に、キーマップオーバーレイとジェスチャ4方向をコピーできるように変更'] },
                { v: '0.20.9.0', at: '2026-07-12 JST', changes: ['実機設定バックアップの安全性を修正: Export/トラックボール比較が確認なしに全スロットの出力先を切り替えていた挙動に確認ダイアログを追加、比較表がタブを開くだけで自動巡回していた不具合を修正、ロック中のExportが空データを黙って出力していた問題を修正、複数スロット走査後の出力先復元が不明な場合に0番へ誤って固定されていた不具合を修正、復元不能なcursor比率のバックアップ項目を削除'] },
                { v: '0.20.8.0', at: '2026-07-12 JST', changes: ['接続パネルに dongle connection health 表示を追加。active output、L/R online 状態、battery、layer state、OS profile を接続直下で確認可能にし、未露出の last-received / layer sync は未対応と明示'] },
                { v: '0.20.7.0', at: '2026-07-12 JST', changes: ['右ペインに「診断」タブを追加。接続中の実機から device info、レイヤー状態、バッテリー、AML、トラックボール設定、BT/USBスロット、デバイス別キーマップ/ジェスチャ設定を一覧表示'] },
                { v: '0.20.6.0', at: '2026-07-12 JST', changes: ['Export .json / Import .json が、接続中の実機設定（トラックボール、AML、デバイス別キーマップ、デバイス別ジェスチャ、BT/USB名など）もバックアップ・復元するように変更'] },
                { v: '0.20.5.0', at: '2026-07-12 JST', changes: ['シリアル/Bluetoothのポート選択ダイアログを、接続操作をしたウィンドウ（ミニマップ等）にシート表示するように変更（別ディスプレイに出る問題を解消）'] },
                { v: '0.20.4.0', at: '2026-07-12 JST', changes: ['ダウンロードされるDMGのファイル名にバージョン番号を含めるように変更'] },
                { v: '0.20.3.0', at: '2026-07-12 JST', changes: ['ミニマップの切断ボタンをmac風の✕ボタン（左上）に変更、未接続時も閉じるボタンとして機能', 'StudioでWrite成功後、ヘッダーに「ミニマップを起動」ボタンを表示（ミニマップを出してStudioを片付ける・接続は維持）'] },
                { v: '0.20.2.0', at: '2026-07-12 JST', changes: ['ミニマップがダーク設定なのにライトで起動する不具合を修正（初期テーマIPCの取りこぼしを解消）', 'グリップを目立つピル型ハンドルに変更（初期画面にも表示）', '初期表示位置をメインモニター最下段の中央に変更'] },
                { v: '0.20.1.0', at: '2026-07-12 JST', changes: ['アプリ起動時にStudioではなくミニマップを表示', 'ミニマップに「Editorへ」ボタン（Studioを開く）', 'ミニマップのデフォルトをダークテーマ・不透明度55%に', '切断ボタンでミニマップも閉じる（トレイから再表示可）', 'ドラッグできる位置に⠿グリップマークを表示'] },
                { v: '0.20.0.0', at: '2026-07-12 JST', changes: ['Studioとミニマップの接続ハンドオフ（アプリ版）: ミニマップ接続中でもStudioのConnectを押すだけで接続を自動で引き継ぎ、Studioを切断するとミニマップ(USB)が自動で取り返す'] },
                { v: '0.19.9.0', at: '2026-07-11 JST', changes: ['スクロールバーを背景と同系の控えめな色に変更（ライト/ダーク両テーマ）'] },
                { v: '0.19.8.0', at: '2026-07-11 JST', changes: ['マクロ録画がプレス/リリースを正しく記録するように修正（修飾キー押しっぱなしがPress/Releaseで残り、通常キーはTapに自動圧縮）、オートリピートの重複記録も防止'] },
                { v: '0.19.7.0', at: '2026-07-11 JST', changes: ['デバイス設定（キーマップオーバーレイ＋ジェスチャ4方向）を他のデバイスへコピーする機能'] },
                { v: '0.19.6.0', at: '2026-07-11 JST', changes: ['ミニマップ単体で接続した場合の切断ボタンをヘッダーに追加'] },
                { v: '0.19.5.0', at: '2026-07-11 JST', changes: ['バッテリーバッジの位置を内側親指キー（BSPC/Enter）上に変更'] },
                { v: '0.19.4.0', at: '2026-07-11 JST', changes: ['ミニマップ（ポップアップ）の英数/かなキー上に、それぞれL/Rのバッテリー残量バッジを表示'] },
                { v: '0.19.3.0', at: '2026-07-09 JST', changes: ['ポップアップを別ディスプレイに移動後、移動できなくなる不具合を修正（macOS alwaysOnTop + 複数ディスプレイの既知バグを回避）'] },
                { v: '0.19.2.0', at: '2026-07-09 09:15 JST', changes: ['ポップアップの「読み込み中」表示時に接続ボタンが出ていなかった不具合を修正'] },
                { v: '0.19.1.0', at: '2026-07-09 09:00 JST', changes: ['ポップアップ単体でUSB/Bluetooth接続可能に（メインエディタ不要）', '隠し機能: ポップアップ上でスクロールして不透明度を無段階調整'] },
                { v: '0.19.0.0', at: '2026-07-09 08:16 JST', changes: ['Electronデスクトップアプリ化（メニューバー常駐）', 'トレイ右クリックからレイヤー配列ポップアップ（移動/リサイズ/不透明度/ライト・ダーク切替）', 'ポップアップに押下キーの発光表示、リサイズ時の自動フィット表示', 'Web版ヘッダーにMacアプリダウンロードボタン追加'] },
                { v: '0.18.22.0', at: '2026-07-07 17:04 JST', changes: ['Diffモードとデバイス別キーマップオーバーレイのチップグリッド選択機能'] },
                { v: '0.18.21.0', at: '2026-07-07 16:31 JST', changes: ['トラックボールのドラッグ精密モード（ボタン長押しで感度スケール）'] },
                { v: '0.18.20.0', at: '2026-07-07 12:20 JST', changes: ['コンボRPCで実機とコンボ設定を同期'] },
                { v: '0.18.19.0', at: '2026-07-07 12:03 JST', changes: ['接続時の自動キーマップ読み込みを停止（明示的なReadのみに）'] },
                { v: '0.18.18.0', at: '2026-07-07 11:59 JST', changes: ['マクロ記録中にテンキー入力を正しく記録するよう修正'] },
                { v: '0.18.17.0', at: '2026-07-07 11:47 JST', changes: ['IMEキーコードに日本語の機能名ラベルを追加'] },
                { v: '0.18.16.0', at: '2026-07-07 11:43 JST', changes: ['スクロールバーを背景色になじませるスタイル調整'] },
                { v: '0.18.15.0', at: '2026-07-07 10:03 JST', changes: ['BT5（Studio）キーコードを削除（ドングルに存在しないプロファイルのため）'] },
                { v: '0.18.14.0', at: '2026-07-06 19:24 JST', changes: ['公式zmk-studio-ts-clientの接続フローに合わせて修正'] },
                { v: '0.18.13.0', at: '2026-07-06 19:13 JST', changes: ['BLEサービスUUIDフィルタを削除（無効な候補が出る不具合の修正）'] },
                { v: '0.18.12.0', at: '2026-07-06 13:19 JST', changes: ['既に接続済みのドングルをBLEデバイス選択に表示するよう修正'] },
                { v: '0.18.11.0', at: '2026-07-06 13:13 JST', changes: ['BluetoothでのStudio接続に対応（Web Bluetoothトランスポート）'] },
                { v: '0.18.10.0', at: '2026-07-06 12:01 JST', changes: ['L/Rバッテリー残量を物理的な左右順で個別表示'] },
                { v: '0.18.9.0', at: '2026-07-06 11:44 JST', changes: ['デバッグコンソールをオンデマンド表示に変更、保存トーストを色分け'] },
                { v: '0.18.8.0', at: '2026-07-06 11:36 JST', changes: ['左右半分の間隔を広げ、トラックボール円の潰れを修正'] },
                { v: '0.18.7.0', at: '2026-07-06 11:22 JST', changes: ['トラックボールに慣性（グライド）タブ追加、ON/OFFと調整機能'] },
                { v: '0.18.6.0', at: '2026-07-05 17:06 JST', changes: ['IMEキーコードカテゴリにmacOSのGlobe/fnキーを追加'] },
                { v: '0.18.5.0', at: '2026-07-05 16:26 JST', changes: ['レイヤースイッチャー下部の余白調整'] },
                { v: '0.18.4.0', at: '2026-07-05 13:02 JST', changes: ['接続時に自動でキーマップを読み込むように修正（明示的なReadだけでなく）'] },
                { v: '0.18.3.0', at: '2026-07-05 12:56 JST', changes: ['カスタムビヘイビアをファームウェアマクロと誤検出する不具合を修正'] },
                { v: '0.18.2.0', at: '2026-07-05 11:50 JST', changes: ['デバイスパネルを常にキーボード下に中央揃えで配置'] },
                { v: '0.18.1.0', at: '2026-07-05 11:37 JST', changes: ['USB仮想スロット、デバイスタブ刷新、ジェスチャレイヤーのデバイス選択、縦画面レイアウト対応'] },
                { v: '0.18.0.0', at: '2026-07-04 12:54 JST', changes: ['全体Resetでマウス加速度を「弱」にリセット'] },
                { v: '0.17.4.0', at: '2026-07-04 07:07 JST', changes: ['Key ConfigのKey Codeクリックでレイヤータップ/Mod-TapがBasicに戻ってしまう不具合を修正'] },
                { v: '0.17.3.0', at: '2026-07-02 11:41 JST', changes: ['bindingベースジェスチャRPC用にproto JSONを再生成'] },
                { v: '0.17.2.0', at: '2026-07-02 10:34 JST', changes: ['Readでレイヤーのledカラーを実際には取得していなかった不具合を修正'] },
                { v: '0.17.1.0', at: '2026-07-02 10:04 JST', changes: ['ジェスチャ4方向を1クリックで共有設定に一括リセット'] },
                { v: '0.17.0.0', at: '2026-07-02 09:08 JST', changes: ['ジェスチャ編集を新しいbindingベースのRPCに切り替え'] },
                { v: '0.16.1.0', at: '2026-07-02 08:23 JST', changes: ['保護されていないレイヤーのLEDドット表示ズレ修正'] },
                { v: '0.16.0.0', at: '2026-07-02 08:20 JST', changes: ['USBデバイス名の編集機能（get/set_usb_name）'] },
                { v: '0.15.1.0', at: '2026-07-02 08:07 JST', changes: ['キーマップドロップダウンでオーバーレイレイヤーを直接選択可能に'] },
                { v: '0.15.0.0', at: '2026-07-02 08:01 JST', changes: ['デバイスごとのキーマップオーバーレイ切り替え機能'] },
                { v: '0.14.2.0', at: '2026-07-02 07:51 JST', changes: ['デバイスジェスチャ一覧をBluetoothプロファイル行に統合'] },
                { v: '0.14.1.0', at: '2026-07-02 07:44 JST', changes: ['ジェスチャの上下左右位置マッピング修正'] },
                { v: '0.14.0.0', at: '2026-07-02 07:32 JST', changes: ['出力デバイスごとのトラックボールジェスチャ編集（デバイスタブ）'] },
                { v: '0.13.3.0', at: '2026-07-02 06:51 JST', changes: ['BluetoothプロファイルのリネームAPIと実プロファイル状態読み込みを配線'] },
                { v: '0.13.2.0', at: '2026-07-01 21:43 JST', changes: ['Write時にレイヤーLEDカラーをデバイスに送信するよう修正'] },
                { v: '0.13.1.0', at: '2026-07-01 16:14 JST', changes: ['位置限定ホールドタップ設定パネル追加'] },
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

      <ConnectionPanel
        connected={usbConnected}
        connectionType={connectionType}
        onConnectionChange={onConnectionChange}
        compact
      />

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
          {isElectron && wroteToDevice && (
            <button className="header-action-btn" title="ミニマップを表示してStudioを片付ける（接続は維持されます）"
              onClick={() => (window as any).electronAPI?.switchToMinimap?.()}>
              <span>🗺</span> ミニマップを起動
            </button>
          )}
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
              <span className="export-item-desc">Full project + device settings</span>
            </button>
            <button className="export-item" onClick={handleImport}>
              <span className="export-item-title">Import .json</span>
              <span className="export-item-desc">Load project and restore device settings</span>
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
