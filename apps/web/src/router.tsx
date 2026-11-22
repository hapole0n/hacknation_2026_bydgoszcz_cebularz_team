import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/** Minimal client-side router — no dependency needed. */
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
  page: 'new' | 'cases' | 'case' | 'run' | 'address' | 'graph' | 'report' | 'audit' | 'notifications' | 'notFound';
  id?: string;
  /** Address card only: the address and its network. */
  chain?: string;
  address?: string;
}

/** Routes: `/` new case, `/cases` register, `/cases/:id`, `/runs/:id` (+ `/address/:chain/:address`, `/graph`, `/report`), `/audit`, `/notifications`. */
export function matchPath(path: string): Match {
  if (path === '/' || path === '' || path === '/cases/new') return { page: 'new' };
  if (path === '/cases') return { page: 'cases' };
  if (path === '/audit') return { page: 'audit' };
  if (path === '/notifications') return { page: 'notifications' };
  const c = /^\/cases\/([^/]+)$/.exec(path);
  if (c) return { page: 'case', id: c[1] };
  const r = /^\/runs\/([^/]+)$/.exec(path);
  if (r) return { page: 'run', id: r[1] };
  const a = /^\/runs\/([^/]+)\/address\/([^/]+)\/([^/]+)$/.exec(path);
  if (a) return { page: 'address', id: a[1], chain: decodeURIComponent(a[2]!), address: decodeURIComponent(a[3]!) };
  const g = /^\/runs\/([^/]+)\/graph$/.exec(path);
  if (g) return { page: 'graph', id: g[1] };
  const rep = /^\/runs\/([^/]+)\/report$/.exec(path);
  if (rep) return { page: 'report', id: rep[1] };
  return { page: 'notFound' };
}

export const addressPath = (runId: string, chain: string, address: string) => `/runs/${runId}/address/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`;
