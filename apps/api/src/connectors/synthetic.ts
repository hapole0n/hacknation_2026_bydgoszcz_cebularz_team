import { readFileSync } from 'node:fs';
import { repoPath } from '../paths.js';

let known: Set<string> | undefined;

/**
 * The addresses of the synthetic demo personas (fixtures/addresses.json): they belong to nobody, so a live service (an RPC node,
 * an explorer) is never asked about them. A missing file means no address is known as synthetic.
 */
export function isSyntheticAddress(address: string): boolean {
  if (!known) {
    try {
      const doc = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8')) as Record<string, unknown>;
      known = new Set(Object.values(doc).flatMap((v) => (typeof v === 'object' && v !== null && typeof (v as { address?: unknown }).address === 'string' ? [(v as { address: string }).address.toLowerCase()] : [])));
    } catch {
      known = new Set();
    }
  }
  return known.has(address.toLowerCase());
}
