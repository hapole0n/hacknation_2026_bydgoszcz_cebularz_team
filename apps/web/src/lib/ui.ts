import { useEffect, useSyncExternalStore } from 'react';

/** localStorage key of the analyst's name (shown next to every decision). */
export const ANALYST_KEY = 'kropka.analyst';

/** A tiny external store: `get()` for the current value, `set()` to change it, `useStore` to subscribe from React. */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
type Store<T> = ReturnType<typeof createStore<T>>;
const useStore = <T,>(s: Store<T>) => useSyncExternalStore(s.subscribe, s.get);

// ---- dialogs (F1 help, F10 settings) and the one-line notice in the status bar ---------------------------------------

export type DialogId = 'help' | 'settings' | null;
const dialog = createStore<DialogId>(null);
export const openDialog = (d: DialogId) => dialog.set(d);
export const useDialog = () => useStore(dialog);

const notice = createStore<string | null>(null);
let noticeTimer: number | undefined;
/** Shows `text` in the status bar for a few seconds. */
export function showNotice(text: string) {
  notice.set(text);
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => notice.set(null), 6000);
}
export const useNotice = () => useStore(notice);

// ---- function keys the browser keeps for itself: the label then shows the other combination (Alt+digit) --------------------

const RESERVED_KEY = 'kropka.reservedKeys';
const readReserved = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RESERVED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const reserved = createStore<readonly string[]>(readReserved());
export function markReserved(id: string) {
  if (reserved.get().includes(id)) return;
  const next = [...reserved.get(), id];
  localStorage.setItem(RESERVED_KEY, JSON.stringify(next));
  reserved.set(next);
}
export const clearReserved = () => {
  localStorage.removeItem(RESERVED_KEY);
  reserved.set([]);
};
/** `F6`, or `Alt+6` once the browser has been seen to take F6 for itself. Re-renders when that changes. */
export function useKeyLabel(): (id: string) => string {
  const list = useStore(reserved);
  return (id) => (list.includes(id) ? altCombo(id) : id);
}
export const altCombo = (id: string) => `Alt+${id.slice(1) === '10' ? 0 : id.slice(1)}`;
export const useReservedKeys = () => useStore(reserved);

// ---- the taskbar: windows opened in this session -----------------------------------------------------------------------

export interface OpenWindow {
  path: string;
  label: string;
}
const windows = createStore<readonly OpenWindow[]>([]);
const MAX_WINDOWS = 4;
/** Registers (or relabels) the current screen in the taskbar; the oldest one drops out when there are more than four. */
export function useOpenWindow(path: string, label: string) {
  useEffect(() => {
    const list = windows.get();
    const i = list.findIndex((w) => w.path === path);
    const next = i >= 0 ? list.map((w, j) => (j === i ? { path, label } : w)) : [...list, { path, label }].slice(-MAX_WINDOWS);
    if (JSON.stringify(next) !== JSON.stringify(list)) windows.set(next);
  }, [path, label]);
}
export const useOpenWindows = () => useStore(windows);
