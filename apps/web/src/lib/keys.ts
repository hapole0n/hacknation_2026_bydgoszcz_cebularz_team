import { useEffect } from 'react';
import { altCombo, markReserved, showNotice } from '@/lib/ui';

export type ShortcutId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9' | 'F10' | 'Esc';
export type ShortcutMap = Partial<Record<ShortcutId, () => void>>;

/** Which shortcut a key event stands for: F1–F10, Alt+1…Alt+0 (the same keys, for browsers that keep some F-keys), Esc. */
export function shortcutOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): { id: ShortcutId; viaF: boolean } | null {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (!e.altKey && /^F([1-9]|10)$/.test(e.key)) return { id: e.key as ShortcutId, viaF: true };
  const digit = /^Digit([0-9])$/.exec(e.code);
  if (e.altKey && digit) return { id: `F${digit[1] === '0' ? 10 : digit[1]}` as ShortcutId, viaF: false };
  if (!e.altKey && e.key === 'Escape') return { id: 'Esc', viaF: false };
  return null;
}

// Page-level handlers: the latest registered one for a key wins; a screen unregisters on unmount.
const stack: { owner: symbol; map: ShortcutMap }[] = [];
const handlerFor = (id: ShortcutId) => [...stack].reverse().find((s) => s.map[id])?.map[id];

/** A screen's own shortcuts (F5 re-run, F6 graph, F7 report, Esc back …). Pass a stable object per render; it is re-read on every key. */
export function useShortcuts(map: ShortcutMap) {
  useEffect(() => {
    const entry = { owner: Symbol('shortcuts'), map };
    stack.push(entry);
    return () => {
      stack.splice(stack.indexOf(entry), 1);
    };
  });
}

let installed = false;
/**
 * One listener for the whole app. Keys with no handler on the current screen are left to the browser. A handled F-key is
 * `preventDefault`-ed; when the window loses focus right after it (F6 / F10 in some browsers), the browser kept the key for
 * itself: it is remembered and the labels switch to Alt+digit (`useKeyLabel`).
 */
export function installGlobalKeys(fallback: ShortcutMap, stolenText: (f: string, alt: string) => string) {
  if (installed) return () => undefined;
  installed = true;
  const onKey = (e: KeyboardEvent) => {
    const s = shortcutOf(e);
    if (!s || e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (s.id === 'Esc' && target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return; // Esc while typing is not "back"
    const run = handlerFor(s.id) ?? fallback[s.id];
    if (!run) return;
    e.preventDefault();
    run();
    if (s.viaF && s.id !== 'Esc') {
      window.setTimeout(() => {
        if (!document.hasFocus()) {
          markReserved(s.id);
          showNotice(stolenText(s.id, altCombo(s.id)));
        }
      }, 150);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    installed = false;
  };
}
