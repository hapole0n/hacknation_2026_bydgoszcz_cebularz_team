import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractAddresses, parseAddress } from '@kropka/core';
import { LabelService } from '../src/labels/label.service.js';
import { repoPath } from '../src/paths.js';

const read = (p: string) => readFileSync(repoPath(p), 'utf8');
const addresses: Record<string, { chain: string; address: string; onPages?: boolean }> = JSON.parse(read('fixtures/addresses.json'));
delete (addresses as Record<string, unknown>)._comment;
const expected = JSON.parse(read('fixtures/expected.json'));
const index = JSON.parse(read('fixtures/sandbox-web/index.json'));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}
const root = repoPath('fixtures/sandbox-web');
const pageFiles = walk(root).map((f) => relative(root, f).replaceAll('\\', '/')).filter((f) => !['index.html', 'index.json'].includes(f));

describe('sandbox fixtures', () => {
  it('every synthetic address is valid and published on at least one page', () => {
    const all = pageFiles.map((f) => read(`fixtures/sandbox-web/${f}`)).join('\n');
    for (const [name, a] of Object.entries(addresses)) {
      expect(parseAddress(a.address), name).toMatchObject({ ok: true });
      if (a.onPages !== false) expect(all, name).toContain(a.address); // D1 lives in fixtures/chain only
    }
  });

  it('every valid address on any page is a known one (synthetic, or a labelled public institutional address)', () => {
    const known = new Set([...Object.values(addresses).map((a) => a.address), ...Object.values<string>(expected.realAddresses)]);
    for (const f of pageFiles) {
      for (const a of extractAddresses(read(`fixtures/sandbox-web/${f}`)).addresses) expect(known, `${f}: ${a.address}`).toContain(a.address);
    }
  });

  it('the catalogue lists exactly the page files', () => {
    expect(index.pages.map((p: { path: string }) => p.path.slice(1)).sort()).toEqual([...pageFiles].sort());
  });

  it('real addresses of expected.json are in config/labels, the synthetic kantor is labelled', () => {
    const labels = new LabelService();
    for (const a of Object.values<string>(expected.realAddresses)) expect(labels.lookup('ETH', a), a).toBeDefined();
    expect(labels.lookup('TRON', addresses.K1!.address)?.category).toBe('CASP_KANTOR');
    expect(labels.lookup('ETH', addresses.A1!.address)).toBeUndefined();
  });
});

describe('labels', () => {
  it('every label file declares source, licence and retrieval date', () => {
    const labels = new LabelService();
    expect(labels.sources.map((s) => s.file)).toEqual(['charity.json', 'dex.json', 'examples.json', 'exchanges-tron.json', 'exchanges.json', 'synthetic-demo.json']);
    for (const s of labels.sources) expect([s.source, s.license, s.retrieved].every(Boolean), s.file).toBe(true);
  });

  it('TRON exchange wallets come from the published OKX Proof-of-Reserves file (official source, dated header) and exclude attribution', () => {
    const doc = JSON.parse(read('config/labels/exchanges-tron.json'));
    expect(doc.header).toMatchObject({ sourceUrl: expect.stringContaining('okx.com'), retrieved: '2026-11-21' });
    expect(doc.entries.length).toBeGreaterThan(50);
    const labels = new LabelService();
    for (const e of doc.entries) {
      expect(parseAddress(e.address), e.address).toMatchObject({ ok: true, chain: 'TRON' });
      expect(labels.lookup('TRON', e.address)?.category).toBe('CEX_CUSTODIAL');
    }
    expect(labels.lookup('TRON', 'TEonzwFMXhEWwoxNLdM13MBs99T9xAGZey')).toBeUndefined(); // an ordinary address is not labelled
  });

  it('flags documentation / burn addresses for the extractor', () => {
    expect(new LabelService().exampleAddresses()).toEqual(expect.arrayContaining(['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0x000000000000000000000000000000000000dEaD']));
  });
});
