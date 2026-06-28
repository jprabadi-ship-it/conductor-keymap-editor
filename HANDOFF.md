# ConductorD Studio — セッション引き継ぎ

## 現在の状態

### デプロイ済み
- URL: https://jprabadi-ship-it.github.io/conductor-keymap-editor/
- バージョン: v0.3.5
- リポジトリ: https://github.com/jprabadi-ship-it/conductor-keymap-editor

### 動作確認済み機能
- **キーマップ編集**: 全14レイヤー、40キーの編集・Read・Write
- **USB接続**: Web Serial API (12500 baud) + ZMK Studio Protobuf + SLIP framing
- **Read**: デバイスからキーマップ読み取り → UI反映（HID Usage Code変換済み）
- **Write**: ユーザーが変更したキーのみ setLayerBinding RPC で送信（dirty tracking）
- **レイヤー名**: Read/Write 対応（setLayerProps RPC）
- **トラックボール設定**: CPI、スクロール感度、精密モード、加速度のRead/Write/リアルタイムプレビュー
- **タイミング設定**: Tapping Term のRead/Write
- **コンボ**: 展開式詳細表示、ミニキーボードでトリガーキー選択、編集
- **マクロ**: ファームウェアのmacro behaviorを自動検出、キーボードビューで割当て
- **Export/Import**: v2形式のJSON対応
- **デバッグコンソール**: ログレベルフィルタ、リサイズ可能

### 未完了タスク（次のセッション）

#### マクロ編集RPC拡張（ファームウェア側）
ファームウェアにマクロステップの読み書きAPIを追加する。3層の変更が必要：

**1. protobufスキーマ (`zmk-studio-messages`)**
- リポジトリ: `pite1222/zmk-studio-messages` (branch: release/conductor-0.6.3)
- `zmk.macros` サブシステムを追加
- RPC: listAllMacros, getMacroData, setMacro
- メッセージ: MacroSequence, MacroStep (keyPress/keyRelease/wait)

**2. ファームウェアRPCハンドラ (`conductor-dongle`)**
- ZMKフォーク: `jprabadi-ship-it/zmk-1@release/conductor-0.6.3-dongle-battfix`
- マクロデータのNVS保存/読み出し
- RXバッファサイズ拡張（現在128バイト）
- `config/west.yml` で zmk-studio-messages のrevisionを更新

**3. エディタUI (`conductor-keymap-editor`)**
- `zmk-studio-proto.json` にmacrosサブシステムを追加
- `usbService.ts` に listAllMacros, getMacroData, setMacro を追加
- MacroEditor のステップ編集をデバイス通信に接続

## 技術的な重要事項

### ZMK Studio プロトコル
- **通信**: Web Serial API, 12500 baud
- **フレーミング**: SLIP (SOF=171, EOF=173, ESC=172)
- **シリアライズ**: Protobuf3 (zmk.studio.Request/Response)
- **アンロック**: デバイスはデフォルトでロック。getLockState → 1 でアンロック確認

### Behavior ID マッピング（デバイス固有）
```
7: Key Press (kp)
1: Mouse Key Press (mkp)
4: None
13: Momentary Layer (mo)
21: Layer-Tap (lt)
22: Mod-Tap (mt)
25: Toggle Layer (tog)
26: Transparent
18: Bluetooth
19: Bootloader
27-30: ファームウェアマクロ (m_cmd_sp_1, m_pws_1, m_vol_dn, m_vol_up)
```

### HID Usage Code エンコーディング
param1の32bit構造: `(implicit_mods << 24) | (page << 16) | usage`
- page 0x07: キーボード (A=4, Z=29, 1=30, Enter=40, etc.)
- page 0x0C: コンシューマ (Vol+=0xE9, Bri-=0x70, etc.)
- mods: 0x01=Ctrl, 0x02=Shift, 0x04=Alt, 0x08=GUI

### KEY_ORDER（protobuf bindings配列の順序）
行ごとに左右交互: L00-L04, R00-R04, L10-L14, R10-R14, ...

### キーボード物理レイアウト
- 左半分: 21キー (Row 0-2: 5列, Row 3: 6列)
- 右半分: 19キー (Row 0-2: 5列, Row 3: 4キー+トラックボール2マス)
- トラックボール: Row 3 col 2-3（M・,の下）

## ファイル構造
```
src/
├── services/usbService.ts    # ZMK Studio通信（最重要）
├── store/useKeymapStore.ts   # 状態管理（dirty tracking含む）
├── data/
│   ├── zmk-studio-proto.json # Protobufスキーマ
│   ├── defaultKeymap.ts      # デフォルトキーマップ
│   ├── keycodes.ts           # キーコード定義
│   └── layout.ts             # 物理レイアウト
├── components/
│   ├── Header/Header.tsx     # USB接続UI、Export/Import
│   ├── LeftPanel/            # Layers, Combos, Macros タブ
│   ├── KeyboardView/         # 中央キーボードビュー
│   ├── RightPanel/           # Key Config, Trackball, Timing, Bluetooth, MacroEditor
│   ├── DebugConsole.tsx      # デバッグコンソール
│   └── ResizeHandle.tsx      # パネルリサイズ
```

## 関連リポジトリ
- conductor-dongle: `/Users/miyashitakazuya/conductor-dongle` — ZMKファームウェア
- conductor-macro-editor: `/Users/miyashitakazuya/conductor-macro-editor` — GitHub CI/CD方式のマクロエディタ
- 元サイト: https://studio.plotoftheprototype.com/editor — Conductor Studio 2.0
