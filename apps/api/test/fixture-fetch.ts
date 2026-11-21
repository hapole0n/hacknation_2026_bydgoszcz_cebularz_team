import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { repoPath } from '../src/paths.js';

const root = repoPath('fixtures/sandbox-web');

/** Offline `fetch`: serves http://sandbox-web/… from fixtures/sandbox-web, refuses every other host. */
export function sandboxFetch(): typeof fetch & { requested: string[] } {
  const requested: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requested.push(url.href);
    if (url.hostname !== 'sandbox-web') throw new Error(`network disabled in tests: ${url.href}`);
    const file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root) || !existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(file, 'utf8'), { status: 200 });
  }) as typeof fetch & { requested: string[] };
  fn.requested = requested;
  return fn;
}
