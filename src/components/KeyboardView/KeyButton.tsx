import { KeyConfig } from '../../types';

interface Props {
  keyConfig: KeyConfig;
  selected: boolean;
  onClick: () => void;
  comboName?: string;
  isAmlExcluded?: boolean;
  macroHighlight?: 'assigned' | 'other';
}

export function KeyButton({ keyConfig, selected, onClick, comboName, isAmlExcluded, macroHighlight }: Props) {
  const { binding } = keyConfig;
  const isTrans = binding.type === 'trans';
  const isNone = binding.type === 'none';
  const isMacro = binding.keyCode?.startsWith('&') && binding.keyCode.length > 1;

  let mainLabel = binding.label;
  let subLabel = '';
  let topLabel = '';
  let topClass = '';

  let holdLabel = '';

  if (binding.type === 'mod-tap') {
    const modSymbols: Record<string, string> = {
      lshift: '⇧', rshift: 'R⇧', lgui: '⌘', rgui: 'R⌘',
      lctrl: '⌃', rctrl: 'R⌃', lalt: '⌥', ralt: 'R⌥',
    };
    holdLabel = binding.modifiers?.map(m => modSymbols[m] || m).join('') || '';
    mainLabel = binding.tapLabel || binding.label;
  }

  if (binding.type === 'layer-tap' && binding.layer !== undefined) {
    holdLabel = `L${binding.layer}`;
    mainLabel = binding.tapLabel || binding.label;
  }

  if (binding.type === 'momentary' && binding.layer !== undefined) {
    mainLabel = `L${binding.layer}`;
    topLabel = `MO`;
    topClass = 'layer';
  }

  if (isMacro) {
    mainLabel = binding.keyCode!.substring(1);
    topLabel = 'macro';
    topClass = 'macro';
  }

  if (comboName) {
    topLabel = comboName;
    topClass = comboName === 'Boot' || comboName === 'boot' ? 'boot' : 'combo';
  }

  let extraClass = '';
  if (macroHighlight === 'assigned') extraClass = ' macro-assigned';
  else if (macroHighlight === 'other') extraClass = ' macro-other';

  return (
    <button
      className={`key-btn ${selected ? 'selected' : ''} ${isTrans || isNone ? 'trans' : ''}${extraClass}`}
      onClick={onClick}
    >
      {topLabel && (
        <span className={`key-toplabel ${topClass}`}>{topLabel}</span>
      )}
      <span className="key-label">{isTrans ? '' : isNone ? '∅' : mainLabel}</span>
      {holdLabel && <span className="key-holdlabel">{holdLabel}</span>}
      {isAmlExcluded && <span className="key-aml-badge">AML</span>}
    </button>
  );
}
