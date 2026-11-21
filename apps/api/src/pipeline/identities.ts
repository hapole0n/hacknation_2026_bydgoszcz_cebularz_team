import { normalizeIdentifier, type ScoreResult, type ScoringTrace, type SourceType } from '@kropka/core';

export interface IdEvidence {
  id: string;
  url?: string;
  platform: string;
  author?: { handle?: string; name?: string };
  publishedAt?: string;
  fetchedAt: string;
}
export interface IdTrace {
  evidenceId: string;
  /** labelKey of the address. */
  key: string;
  chain: string;
  address: string;
  sourceType: SourceType;
}

export interface Identity {
  /** "platform|handle" (or "platform|name:…" when the page shows a name only). */
  key: string;
  platform: string;
  handle: string | null;
  name: string | null;
  /**
   * PUBLISHER: this account published the searched address.
   * SAME_NICK_OTHER_PLATFORM: only the nick matches (found by pivoting on the handle) — possibly another person.
   */
  relation: 'PUBLISHER' | 'SAME_NICK_OTHER_PLATFORM';
  /** Evidence that carries the searched address (PUBLISHER) or all evidence of the account. */
  evidenceIds: string[];
  urls: string[];
  /** Confidence that the searched address belongs to this identity (PUBLISHER only). */
  targetAddress: string | null;
  score: ScoreResult | null;
  /** Other addresses published by the same account (on the same platform). */
  otherAddresses: { chain: string; address: string; category: string; excluded: boolean; evidenceIds: string[] }[];
}

/**
 * "Who is behind this address?" — groups the evidence by publishing account (platform + handle), scores each
 * account that published the searched address, and lists the other addresses of those accounts.
 */
export function buildIdentities(a: {
  targets: ReadonlySet<string>;
  evidence: readonly IdEvidence[];
  traces: readonly IdTrace[];
  /** Scores the traces of one account for one searched address (the caller adds exclusions, chain facts, conflicts). */
  scoreFor: (traces: ScoringTrace[], targetKey: string) => ScoreResult;
  describe: (key: string) => { category: string; excluded: boolean };
}): Identity[] {
  if (a.targets.size === 0) return []; // only address cases ask "who is behind this address?"
  const groups = new Map<string, { platform: string; handle: string | null; name: string | null; evidence: IdEvidence[] }>();
  for (const e of a.evidence) {
    const handle = e.author?.handle ? normalizeIdentifier('NICK', e.author.handle) : null;
    const name = e.author?.name?.trim() || null;
    if (!handle && !name) continue;
    const key = `${e.platform}|${handle ?? `name:${name!.toLowerCase()}`}`;
    const g = groups.get(key) ?? { platform: e.platform, handle, name, evidence: [] };
    g.name ??= name;
    g.evidence.push(e);
    groups.set(key, g);
  }

  const identities: Identity[] = [];
  for (const [key, g] of groups) {
    const ids = new Set(g.evidence.map((e) => e.id));
    const mine = a.traces.filter((t) => ids.has(t.evidenceId));
    const carrying = mine.filter((t) => a.targets.has(t.key));
    const target = carrying[0];
    const byKey = new Map<string, Identity['otherAddresses'][number]>();
    for (const t of mine.filter((x) => !a.targets.has(x.key))) {
      const known = byKey.get(t.key) ?? { chain: t.chain, address: t.address, ...a.describe(t.key), evidenceIds: [] };
      known.evidenceIds.push(t.evidenceId);
      byKey.set(t.key, known);
    }
    const carryingIds = [...new Set(carrying.map((t) => t.evidenceId))];
    identities.push({
      key,
      platform: g.platform,
      handle: g.handle,
      name: g.name,
      relation: target ? 'PUBLISHER' : 'SAME_NICK_OTHER_PLATFORM',
      evidenceIds: target ? carryingIds : [...ids],
      urls: g.evidence.filter((e) => (target ? carryingIds.includes(e.id) : true)).map((e) => e.url).filter((u): u is string => !!u),
      targetAddress: target?.address ?? null,
      score: target
        ? a.scoreFor(
            carrying.map((t) => {
              const e = g.evidence.find((x) => x.id === t.evidenceId)!;
              return { evidenceId: e.id, originKey: e.platform, sourceType: t.sourceType, identity: [], observedAt: e.publishedAt ?? e.fetchedAt };
            }),
            target.key,
          )
        : null,
      otherAddresses: [...byKey.values()],
    });
  }
  return identities.sort((x, y) => Number(y.relation === 'PUBLISHER') - Number(x.relation === 'PUBLISHER') || (y.score?.score ?? 0) - (x.score?.score ?? 0) || x.key.localeCompare(y.key));
}

