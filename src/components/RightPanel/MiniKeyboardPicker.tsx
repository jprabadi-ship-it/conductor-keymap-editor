import { KEYBOARD_LAYOUT } from '../../data/layout';

interface Props {
  selected: string[];
  onToggle: (id: string) => void;
}

export function MiniKeyboardPicker({ selected, onToggle }: Props) {
  const leftKeys = KEYBOARD_LAYOUT.filter(k => k.half === 'left');
  const rightKeys = KEYBOARD_LAYOUT.filter(k => k.half === 'right');
  const maxColL = Math.max(...leftKeys.map(k => k.col));
  const maxColR = Math.max(...rightKeys.map(k => k.col));
  const maxRow = Math.max(...KEYBOARD_LAYOUT.map(k => k.row));
  const S = 18;
  const G = 1;

  const renderHalf = (keys: typeof KEYBOARD_LAYOUT, maxCol: number) => {
    const cells: React.ReactNode[] = [];
    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        const pos = keys.find(p => p.row === row && p.col === col);
        if (pos) {
          const isSelected = selected.includes(pos.id);
          cells.push(
            <button key={pos.id} onClick={() => onToggle(pos.id)} style={{
              width: S, height: S, borderRadius: 2, border: '1px solid',
              borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
              background: isSelected ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: isSelected ? 'white' : 'var(--text-muted)',
              fontSize: 5, cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title={pos.id}>{pos.id.substring(1)}</button>
          );
        } else {
          cells.push(<div key={`e-${row}-${col}`} style={{ width: S, height: S }} />);
        }
      }
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maxCol + 1}, ${S}px)`, gap: G }}>
        {cells}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', padding: '4px 0' }}>
      {renderHalf(leftKeys, maxColL)}
      {renderHalf(rightKeys, maxColR)}
    </div>
  );
}
