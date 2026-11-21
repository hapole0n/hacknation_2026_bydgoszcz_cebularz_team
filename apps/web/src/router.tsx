import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/** Minimal client-side router (4 routes) — no dependency needed. */
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener('popstate', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('popstate', fn);
  };
};
const snapshot = () => window.location.pathname;

export function navigate(to: string) {
  if (to === window.location.pathname) return;
  window.history.pushState(null, '', to);
  listeners.forEach((fn) => fn());
  window.scrollTo(0, 0);
}

export const usePath = () => useSyncExternalStore(subscribe, snapshot);

export function Link({ to, onClick, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={click} {...rest}>
      {children}
    </a>
  );
}

export interface Match {
  page: 'cases' | 'new' | 'case' | 'run' | 'report' | 'notFound';
  id?: string;
}

export function matchPath(path: string): Match {
  if (path === '/' || path === '') return { page: 'cases' };
  if (path === '/cases/new') return { page: 'new' };
  const c = /^\/cases\/([^/]+)$/.exec(path);
  if (c) return { page: 'case', id: c[1] };
  const r = /^\/runs\/([^/]+)$/.exec(path);
  if (r) return { page: 'run', id: r[1] };
  const rep = /^\/runs\/([^/]+)\/report$/.exec(path);
  if (rep) return { page: 'report', id: rep[1] };
  return { page: 'notFound' };
}
