type Pattern = 'tap' | 'success' | 'warn';
const PATTERNS: Record<Pattern, number | number[]> = { tap: 12, success: [18, 40, 28], warn: 200 };

let iosSwitch: HTMLInputElement | null = null;

export function haptic(kind: Pattern = 'tap') {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(PATTERNS[kind]);
    return;
  }
  // iOS: a <input type="checkbox" switch> toggled inside a user gesture emits the
  // system selection haptic. It is the only web haptic Safari exposes.
  if (typeof document === 'undefined') return;
  if (!iosSwitch) {
    iosSwitch = document.createElement('input');
    iosSwitch.type = 'checkbox';
    iosSwitch.setAttribute('switch', '');
    iosSwitch.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0';
    document.body.appendChild(iosSwitch);
  }
  iosSwitch.checked = !iosSwitch.checked;
}
