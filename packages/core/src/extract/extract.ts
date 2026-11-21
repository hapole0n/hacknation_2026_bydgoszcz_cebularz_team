import type { Chain } from '../chain.js';
import { addressKey, parseAddress, type AddressKind, type ParseResult } from './validate.js';

export interface ExtractOptions {
  /** Characters of context kept on each side of a match. Default 200. */
  contextRadius?: number;
  /** Re-join addresses broken by a line wrap. Default true. */
  joinSplitLines?: boolean;
  /** Re-join simply obfuscated addresses ("0x 12ab…", groups separated by spaces). Default true. */
  handleObfuscation?: boolean;
  /** Strip zero-width / soft-hyphen characters before matching. Default true. */
  stripInvisible?: boolean;
  /** Documentation / tutorial / burn addresses: found ones are flagged `isExample` (→ EXCL_EXAMPLE). */
  examples?: Iterable<string>;
}

export interface AddressCandidate {
  /** null = detect-only kinds (Monero, Lightning): shown as "nieprzejrzyste dla analizy". */
  chain: Chain | null;
  kind: AddressKind;
  /** Canonical form (see ParsedAddress.address). */
  address: string;
  /** As written in the text (re-joined when it was split). */
  raw: string;
  /** Offsets in `ExtractionResult.text` (the normalised input). */
  position: number;
  end: number;
  /** Text window around the match (± contextRadius), taken from the normalised text. */
  context: string;
  analyzable: boolean;
  isExample: boolean;
  /** True when found by the re-join pass (split line / obfuscation). */
  repaired: boolean;
}

export interface RejectedCandidate {
  /** Transaction hashes are shortened (a 64-hex string may be a private key). */
  raw: string;
  position: number;
  reason: 'TX_HASH' | 'BAD_CHECKSUM' | 'BAD_FORMAT';
}

export interface ExtractionResult {
  /** The normalised text all offsets refer to — store this as the evidence text. */
  text: string;
  addresses: AddressCandidate[];
  rejected: RejectedCandidate[];
}

export function normalizeText(text: string, stripInvisible = true): string {
  const t = text.replace(/\r\n?/g, '\n');
  return stripInvisible ? t.replace(/[​-‍⁠﻿­]/g, '') : t;
}

const B58 = '[1-9A-HJ-NP-Za-km-z]';
const HEX64 = /^(?:0x)?[0-9a-fA-F]{64}$/;
const SHAPES: { re: RegExp; opaque?: AddressKind }[] = [
  { re: /^0x[0-9a-fA-F]{40}$/ },
  { re: /^bc1[0-9a-z]{11,71}$/i },
  { re: new RegExp(`^T${B58}{33}$`) },
  { re: new RegExp(`^[13]${B58}{25,34}$`) },
  { re: new RegExp(`^[48]${B58}{94}$|^4${B58}{105}$`), opaque: 'MONERO' }, // no checksum check: detect-only
  { re: /^lnbc[0-9a-z]{50,}$/i, opaque: 'LIGHTNING_INVOICE' },
];
const ENS_RE = /(?<![0-9A-Za-z@.-])(?:[0-9A-Za-z-]+\.)+eth(?![0-9A-Za-z-])/gi;
const LUD16_RE = /(?<![\w.+-])[a-z0-9._-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+(?![\w@-])/gi;
const LIGHTNING_HINT = /lightning|lnurl|lud16|⚡|\bzap|\bsats\b|\bln\b/i;

// Can `s` still grow into an address of its prefix kind? Prunes prose quickly in the re-join pass.
function feasible(s: string): boolean {
  if (/^0x/i.test(s)) return /^0x[0-9a-fA-F]*$/.test(s) && s.length <= 42;
  if (/^bc1/i.test(s)) return /^bc1[02-9ac-hj-np-z]*$/i.test(s) && s.length <= 62;
  if (s.startsWith('T')) return new RegExp(`^T${B58}*$`).test(s) && s.length <= 34;
  return new RegExp(`^[13]${B58}*$`).test(s) && s.length <= 35;
}
const startsAddress = (s: string) => s === '0x' || (s.length >= 4 && /^(?:0x[0-9a-fA-F]|bc1|BC1|[13T])/.test(s));

export function extractAddresses(input: string, options: ExtractOptions = {}): ExtractionResult {
  const { contextRadius = 200, joinSplitLines = true, handleObfuscation = true, stripInvisible = true } = options;
  const text = normalizeText(input, stripInvisible);

  const exampleKeys = new Set<string>();
  for (const e of options.examples ?? []) {
    const p = parseAddress(e.trim());
    exampleKeys.add(p.ok ? addressKey(p.kind, p.address) : e.trim());
  }

  const addresses: AddressCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  const add = (c: { chain: Chain | null; kind: AddressKind; address: string; raw: string; position: number; end: number; repaired?: boolean }) =>
    addresses.push({
      ...c,
      context: text.slice(Math.max(0, c.position - contextRadius), Math.min(text.length, c.end + contextRadius)),
      analyzable: c.chain !== null,
      isExample: exampleKeys.has(addressKey(c.kind, c.address)),
      repaired: c.repaired ?? false,
    });
  const addParsed = (p: Extract<ParseResult, { ok: true }>, raw: string, position: number, end: number, repaired = false) =>
    add({ chain: p.chain, kind: p.kind, address: p.address, raw, position, end, repaired });

  // Pass 1 — maximal alphanumeric runs, classified by shape, then validated.
  const tokens = [...text.matchAll(/[0-9A-Za-z]+/g)].map((m) => ({ s: m[0], start: m.index, end: m.index + m[0].length }));
  const used = tokens.map(() => false);
  // Address-shaped tokens that failed validation. Reported only after the re-join pass, because the
  // first half of a wrapped Bech32 address already looks like a (bad) address.
  const failed = new Map<number, 'BAD_CHECKSUM' | 'BAD_FORMAT'>();
  tokens.forEach((t, i) => {
    if (HEX64.test(t.s)) {
      rejected.push({ raw: `${t.s.slice(0, 8)}…${t.s.slice(-6)}`, position: t.start, reason: 'TX_HASH' });
      used[i] = true;
      return;
    }
    const shape = SHAPES.find((sh) => sh.re.test(t.s));
    if (!shape) return;
    if (shape.opaque) {
      used[i] = true;
      return add({ chain: null, kind: shape.opaque, address: t.s, raw: t.s, position: t.start, end: t.end });
    }
    const p = parseAddress(t.s);
    if (p.ok) {
      used[i] = true;
      addParsed(p, t.s, t.start, t.end);
    } else failed.set(i, p.reason);
  });

  // ENS names (contain dots/hyphens, so not covered by the token pass).
  for (const m of text.matchAll(ENS_RE)) {
    const p = parseAddress(m[0]);
    if (p.ok) addParsed(p, m[0], m.index, m.index + m[0].length);
  }

  // Lightning address (lud16) looks like an e-mail: only reported next to a Lightning keyword.
  for (const m of text.matchAll(LUD16_RE)) {
    const near = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
    if (LIGHTNING_HINT.test(near)) add({ chain: null, kind: 'LIGHTNING_ADDRESS', address: m[0].toLowerCase(), raw: m[0], position: m.index, end: m.index + m[0].length });
  }

  // Pass 2 — re-join split / obfuscated addresses. Only accepted when the join validates (checksum),
  // except ETH without mixed case, which has none: there the join must be exactly `0x` + 40 hex.
  if (joinSplitLines || handleObfuscation) {
    for (let i = 0; i < tokens.length; i++) {
      if (used[i] || !startsAddress(tokens[i]!.s)) continue;
      let joined = tokens[i]!.s;
      for (let j = i + 1; j < tokens.length && j - i <= 16 && !used[j]; j++) {
        const gap = text.slice(tokens[j - 1]!.end, tokens[j]!.start);
        const ok = (joinSplitLines && /^[ \t]*\n[ \t]*$/.test(gap)) || (handleObfuscation && /^[ \t]{1,3}$/.test(gap));
        joined += tokens[j]!.s;
        if (!ok || !feasible(joined)) break;
        const p = parseAddress(joined);
        if (p.ok) {
          addParsed(p, joined, tokens[i]!.start, tokens[j]!.end, true);
          for (let k = i; k <= j; k++) used[k] = true;
          i = j;
          break;
        }
      }
    }
  }

  for (const [i, reason] of failed) if (!used[i]) rejected.push({ raw: tokens[i]!.s, position: tokens[i]!.start, reason });

  addresses.sort((a, b) => a.position - b.position);
  rejected.sort((a, b) => a.position - b.position);
  return { text, addresses, rejected };
}
