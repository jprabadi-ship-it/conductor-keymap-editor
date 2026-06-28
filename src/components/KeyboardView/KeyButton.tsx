import { KeyConfig } from '../../types';

interface Props {
  keyConfig: KeyConfig;
  selected: boolean;
  onClick: () => void;
  comboName?: string;
  isAmlExcluded?: boolean;
}

export function KeyButton({ keyConfig, selected, onClick, comboName, isAmlExcluded }: Props) {
  const { binding } = keyConfig;
  const isTrans = binding.type === 'trans';
  const isNone = binding.type === 'none';

  let mainLabel = binding.label;
  let subLabel = '';
  let topLabel = '';
  let topClass = '';

  if (binding.type === 'mod-tap') {
    const modStr = binding.modifiers?.map(m => {
      switch (m) {
        case 'lshift': return 'LSHIFT';
        case 'rshift': return 'RSHIFT';
        case 'lgui': return 'LGUI';
        case 'rgui': return 'RGUI';
        case 'lctrl': return 'LCTRL';
        case 'rctrl': return 'RCTRL';
        case 'lalt': return 'LALT';
        case 'ralt': return 'RALT';
        default: return m;
      }
    }).join('+') || '';
    subLabel = modStr;
    mainLabel = binding.tapLabel || binding.label;
  }

  if (binding.type === 'layer-tap' && binding.layer !== undefined) {
    topLabel = `L${binding.layer}`;
    topClass = 'layer';
    mainLabel = binding.tapLabel || binding.label;
  }

  if (binding.type === 'momentary' && binding.layer !== undefined) {
    mainLabel = `L${binding.layer}`;
    topLabel = `MO`;
    topClass = 'layer';
  }

  if (comboName) {
    topLabel = comboName;
    topClass = comboName === 'Boot' ? 'boot' : 'combo';
  }

  return (
    <button
      className={`key-btn ${selected ? 'selected' : ''} ${isTrans || isNone ? 'trans' : ''}`}
      onClick={onClick}
    >
      {topLabel && (
        <span className={`key-toplabel ${topClass}`}>{topLabel}</span>
      )}
      <span className="key-label">{isTrans ? '' : isNone ? '∅' : mainLabel}</span>
      {subLabel && <span className="key-sublabel">{subLabel}</span>}
      {isAmlExcluded && <span className="key-aml-badge">AML</span>}
    </button>
  );
}
