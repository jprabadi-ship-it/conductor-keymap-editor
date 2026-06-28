import { KeymapStore } from '../../store/useKeymapStore';

interface Props {
  store: KeymapStore;
}

const DIRECTION_LABELS: Record<string, string> = {
  up: '上', down: '下', left: '左', right: '右',
};

export function TrackballConfig({ store }: Props) {
  return (
    <div>
      <div className="config-section">
        <div className="config-label">トラックボール設定</div>
        <div className="locked-message">
          デバイスに接続してアンロックしてください
        </div>
      </div>

      <div className="config-section">
        <div className="config-label">ジェスチャショートカット</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Layer {store.gestures[0]?.layer ?? 13}
        </div>
        <div className="gesture-grid">
          {store.gestures.map(g => (
            <div key={g.direction} className="gesture-item">
              <span className="gesture-direction">{DIRECTION_LABELS[g.direction]}</span>
              <span className="gesture-binding">{g.label}</span>
              <button className="btn btn-outline" style={{ fontSize: 10, padding: '2px 8px' }}>
                {DIRECTION_LABELS[g.direction]}ジェスチャを編集
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
