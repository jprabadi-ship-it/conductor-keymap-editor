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
  const modSymbols: Record<string, string> = {
    lshift: 'L⇧', rshift: 'R⇧', lgui: 'L⌘', rgui: 'R⌘',
    lctrl: 'L⌃', rctrl: 'R⌃', lalt: 'L⌥', ralt: 'R⌥',
  };

  if (binding.type === 'basic' && binding.modifiers?.length) {
    holdLabel = binding.modifiers.map(m => modSymbols[m] || m).join('');
  }

  if (binding.type === 'mod-tap') {
    const labelSymbols: Record<string, string> = {
      'L Shift': 'L⇧', 'R Shift': 'R⇧', 'L GUI': 'L⌘', 'R GUI': 'R⌘',
      'L Ctrl': 'L⌃', 'R Ctrl': 'R⌃', 'L Alt': 'L⌥', 'R Alt': 'R⌥',
    };
    if (binding.modifiers?.length) {
      holdLabel = binding.modifiers.map(m => modSymbols[m] || m).join('');
    } else if (binding.keyCode && labelSymbols[binding.keyCode]) {
      holdLabel = labelSymbols[binding.keyCode];
    } else if (binding.keyCode && binding.keyCode !== binding.tapLabel) {
      holdLabel = binding.keyCode;
    }
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
      {holdLabel && <span className={`key-holdlabel ${binding.type === 'basic' ? 'basic-mod' : ''}`}>{holdLabel}</span>}
      {isAmlExcluded && <span className="key-aml-badge">AML</span>}
    </button>
  );
}
