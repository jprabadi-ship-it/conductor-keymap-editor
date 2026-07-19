import { useState } from 'react';
import type { FirmwareUnitInfo } from '../../services/usbService';

type UnitKey = 'dongle' | 'R' | 'L';

type Uf2File = { name: string; data: string }; // data: base64
type DownloadResult =
  | { ok: true; sha: string; files: Record<UnitKey, Uf2File> }
  | { ok: false; error: string };

type UnitPlan = {
  key: UnitKey;
  label: string;
  info: FirmwareUnitInfo | undefined;
  needsUpdate: boolean;
};

const UNIT_INSTRUCTIONS: Record<UnitKey, string> = {
  dongle: 'ドングル本体のリセットボタンを素早く2回押してください。PCに「CONDUCTORD」のようなドライブが出現します。',
  R: 'Rユニットのリセットボタンを素早く2回押してください。PCに「CONDUCTORD」のようなドライブが出現します。',
  L: 'Lユニットのリセットボタンを素早く2回押してください。PCに「CONDUCTORD」のようなドライブが出現します。',
};

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function buildUnitPlan(self: FirmwareUnitInfo | undefined, peripherals: FirmwareUnitInfo[] | undefined, latestSha: string | null): UnitPlan[] {
  const r = peripherals?.[0];
  const l = peripherals?.[1];
  const needs = (u: FirmwareUnitInfo | undefined, isSelf: boolean) => {
    if (!u) return false;
    if (!isSelf && !u.connected) return false;
    if (!latestSha) return false;
    return u.buildId !== latestSha;
  };
  return [
    { key: 'dongle', label: 'Dongle', info: self, needsUpdate: needs(self, true) },
    { key: 'R', label: 'R', info: r, needsUpdate: needs(r, false) },
    { key: 'L', label: 'L', info: l, needsUpdate: needs(l, false) },
  ];
}

export function FirmwareUpdateWizard({
  self,
  peripherals,
  onClose,
}: {
  self: FirmwareUnitInfo | undefined;
  peripherals: FirmwareUnitInfo[] | undefined;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'summary' | 'downloading' | 'flashing' | 'done'>('summary');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [result, setResult] = useState<DownloadResult & { ok: true } | null>(null);
  const [queue, setQueue] = useState<UnitPlan[]>([]);
  const [flashIndex, setFlashIndex] = useState(0);
  const [pickedDir, setPickedDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [dirError, setDirError] = useState<string | null>(null);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const plan = buildUnitPlan(self, peripherals, result?.sha ?? null);
  const staleUnits = plan.filter((u) => u.needsUpdate);

  const startDownload = async () => {
    setStep('downloading');
    setDownloadError(null);
    const api = (window as any).electronAPI;
    const res: DownloadResult = await api.downloadFirmwareRelease();
    if (!res.ok) {
      setDownloadError(res.error);
      setStep('summary');
      return;
    }
    setResult(res);
    const nextPlan = buildUnitPlan(self, peripherals, res.sha).filter((u) => u.needsUpdate);
    if (nextPlan.length === 0) {
      setStep('done');
      return;
    }
    setQueue(nextPlan);
    setFlashIndex(0);
    setStep('flashing');
  };

  const currentUnit = queue[flashIndex];

  const pickDrive = async () => {
    setDirError(null);
    setPickedDir(null);
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      // A real UF2 bootloader drive always carries this file.
      try {
        await handle.getFileHandle('INFO_UF2.TXT');
      } catch {
        setDirError('これはUF2ドライブではないようです（INFO_UF2.TXTが見つかりません）。正しいドライブを選び直してください。');
        return;
      }
      setPickedDir(handle);
    } catch {
      // user cancelled the picker -- not an error
    }
  };

  const writeUf2 = async () => {
    if (!currentUnit || !pickedDir || !result) return;
    setFlashing(true);
    setFlashError(null);
    try {
      const file = result.files[currentUnit.key];
      const fileHandle = await pickedDir.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(base64ToBytes(file.data));
      await writable.close();
      const nextIndex = flashIndex + 1;
      setPickedDir(null);
      setConfirming(false);
      if (nextIndex >= queue.length) {
        setStep('done');
      } else {
        setFlashIndex(nextIndex);
      }
    } catch (e: any) {
      setFlashError(e?.message || String(e));
    }
    setFlashing(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8,
        width: 480, maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto', padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>ファームウェア更新ウィザード</h3>
          <button className="btn btn-icon" onClick={onClose} style={{ fontSize: 16 }}>✕</button>
        </div>

        {step === 'summary' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              最新リリースのビルドIDと現在の各ユニットを比較します。
            </div>
            {downloadError && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12, padding: '6px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 4 }}>
                ダウンロードに失敗しました: {downloadError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {plan.map((u) => (
                <div key={u.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{u.label}</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {u.info?.buildId ? `#${u.info.buildId}` : '不明'}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={startDownload} style={{ width: '100%' }}>
              最新ファームウェアを確認
            </button>
          </>
        )}

        {step === 'downloading' && (
          <div style={{ fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            ダウンロード中...
          </div>
        )}

        {step === 'flashing' && currentUnit && (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              {flashIndex + 1} / {queue.length} — {currentUnit.label} を更新します
            </div>
            <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
              {UNIT_INSTRUCTIONS[currentUnit.key]}
            </div>
            {dirError && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12, padding: '6px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 4 }}>
                {dirError}
              </div>
            )}
            {flashError && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12, padding: '6px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 4 }}>
                書き込みに失敗しました: {flashError}
              </div>
            )}
            {!pickedDir && (
              <button className="btn btn-primary" onClick={pickDrive} style={{ width: '100%' }}>
                ドライブを選択
              </button>
            )}
            {pickedDir && !confirming && (
              <>
                <div style={{ fontSize: 12, marginBottom: 12, padding: '6px 8px', background: 'var(--bg-tertiary)', borderRadius: 4 }}>
                  「{pickedDir.name}」を検出しました。
                </div>
                <button className="btn btn-primary" onClick={() => setConfirming(true)} style={{ width: '100%' }}>
                  次へ
                </button>
              </>
            )}
            {pickedDir && confirming && (
              <>
                <div style={{ fontSize: 12, marginBottom: 12, padding: '6px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: 4, lineHeight: 1.6 }}>
                  「{result?.files[currentUnit.key].name}」を「{pickedDir.name}」へ書き込みます。よろしいですか？
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => setConfirming(false)} disabled={flashing} style={{ flex: 1 }}>
                    戻る
                  </button>
                  <button className="btn btn-primary" onClick={writeUf2} disabled={flashing} style={{ flex: 1 }}>
                    {flashing ? '書き込み中...' : '書き込む'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              {staleUnits.length === 0
                ? 'すべてのユニットが最新です。更新の必要はありません。'
                : '完了しました。デバイスを再接続し、診断タブでビルドIDが一致していることを確認してください。'}
            </div>
            <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
              閉じる
            </button>
          </>
        )}
      </div>
    </div>
  );
}
