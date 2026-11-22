import { describe, expect, it } from 'vitest';
import { shortcutOf } from '../src/lib/keys';
import { altCombo } from '../src/lib/ui';

const ev = (o: Partial<Parameters<typeof shortcutOf>[0]>) => ({ key: '', code: '', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...o });

describe('shortcutOf', () => {
  it('F1–F10 and Esc are shortcuts; the same keys are reachable as Alt+1 … Alt+0', () => {
    for (let n = 1; n <= 10; n++) expect(shortcutOf(ev({ key: `F${n}` }))).toEqual({ id: `F${n}`, viaF: true });
    expect(shortcutOf(ev({ key: '5', code: 'Digit5', altKey: true }))).toEqual({ id: 'F5', viaF: false });
    expect(shortcutOf(ev({ key: '0', code: 'Digit0', altKey: true }))).toEqual({ id: 'F10', viaF: false });
    expect(shortcutOf(ev({ key: 'Escape' }))).toEqual({ id: 'Esc', viaF: false });
  });

  it('other keys and combinations with Ctrl / Meta / Shift are left to the browser', () => {
    expect(shortcutOf(ev({ key: 'a', code: 'KeyA' }))).toBeNull();
    expect(shortcutOf(ev({ key: 'F5', ctrlKey: true }))).toBeNull(); // Ctrl+F5 = hard reload
    expect(shortcutOf(ev({ key: 'F5', shiftKey: true }))).toBeNull();
    expect(shortcutOf(ev({ key: '1', code: 'Digit1' }))).toBeNull(); // a digit without Alt
    expect(shortcutOf(ev({ key: 'F11' }))).toBeNull();
  });

  it('the alternative shown for a key the browser keeps', () => {
    expect(altCombo('F6')).toBe('Alt+6');
    expect(altCombo('F10')).toBe('Alt+0');
  });
});
