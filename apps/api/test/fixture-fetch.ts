import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { repoPath } from '../src/paths.js';

const root = repoPath('fixtures/sandbox-web');

/** SYNTHETIC NBP table A rates: constant, so the expected values in fixtures/expected.json are easy to check by hand. */
export const SYNTHETIC_NBP = { USD: 4.0, EUR: 4.4 };
const WINDOWS: [string, string][] = [['2021-02-01', '2021-03-31'], ['2026-09-01', '2026-11-30']]; // days for which "NBP" has data
const HOLIDAYS = new Set(['2026-11-11']);

const days = (start: string, end: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};
const quoted = (day: string) => {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !HOLIDAYS.has(day) && WINDOWS.some(([a, b]) => day >= a && day <= b);
};

export interface FetchOptions {
  /** Override the synthetic NBP mid rate (return undefined for "no quotation that day"). */
  nbpMid?: (code: 'USD' | 'EUR', day: string) => number | undefined;
}

/**
 * Offline `fetch`: serves http://sandbox-web/… from fixtures/sandbox-web, answers api.nbp.pl like the real
 * NBP Web API (JSON shape and 404 for days without a quotation) and the public Ethereum RPC with an empty chain; refuses every other host.
 */
export function sandboxFetch(opts: FetchOptions = {}): typeof fetch & { requested: string[] } {
  const requested: string[] = [];
  const mid = opts.nbpMid ?? ((code, day) => (quoted(day) ? SYNTHETIC_NBP[code] : undefined));

  const nbp = (url: URL) => {
    const m = /\/exchangerates\/rates\/a\/(usd|eur)\/(\d{4}-\d{2}-\d{2})(?:\/(\d{4}-\d{2}-\d{2}))?\/?$/.exec(url.pathname);
    if (!m) return new Response('400 Bad Request', { status: 400 });
    const code = m[1]!.toUpperCase() as 'USD' | 'EUR';
    const rates = days(m[2]!, m[3] ?? m[2]!).flatMap((d, i) => {
      const v = mid(code, d);
      return v === undefined ? [] : [{ no: `${i + 1}/A/NBP/${d.slice(0, 4)}`, effectiveDate: d, mid: v }];
    });
    if (rates.length === 0) return new Response('404 NotFound - Not Found - Brak danych', { status: 404 });
    return new Response(JSON.stringify({ table: 'A', currency: code === 'USD' ? 'dolar amerykański' : 'euro', code, rates }), { status: 200 });
  };

  const fn = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requested.push(url.href);
    if (url.hostname === 'api.nbp.pl') return nbp(url);
    // an "empty" Ethereum: every eth_call answers 0x (no resolver, no record), so no address has an ENS name outside the sandbox
    if (url.hostname === 'ethereum-rpc.publicnode.com') return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' }), { status: 200 });
    if (url.hostname !== 'sandbox-web') throw new Error(`network disabled in tests: ${url.href}`);
    const file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root) || !existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(file, 'utf8'), { status: 200 });
  }) as typeof fetch & { requested: string[] };
  fn.requested = requested;
  return fn;
}
