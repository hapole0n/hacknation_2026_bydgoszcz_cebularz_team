import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  activeNearTrace,
  classifyContext,
  countClaimants,
  diffRuns,
  evaluateIdentity,
  exclusionForCategory,
  extractAddresses,
  labelKey,
  normalizeIdentifier,
  notificationsFor,
  parseAddress,
  scoreLink,
  sourceTypeFor,
  type AddressCandidate,
  type DiffRunInput,
  type ExclusionId,
  type IdentityRuleId,
  type RunDiffDoc,
  type SourceType,
} from '@kropka/core';
import { ChainAnalysisService, type ChainAnalysis } from '../chains/chain-analysis.service.js';
import { DEFAULT_CHAIN_MODE, type ChainMode } from '../chains/chain.registry.js';
import { DEFAULT_CONNECTORS, ConnectorRegistry } from '../connectors/connector.registry.js';
import type { ArchiveSource, EvidenceDraft, SearchIdentifier } from '../connectors/connector.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LabelService } from '../labels/label.service.js';
import { NoteError, noteOf, type Note } from '../notes.js';
import { APP_VERSION } from '../paths.js';
import { PrismaService } from '../prisma.service.js';
import { RulesService } from '../rules.service.js';
import { buildIdentities } from './identities.js';

type Ident = SearchIdentifier & { id: string };
type LinkDraft = Omit<Prisma.LinkCreateManyInput, 'addressId'> & { key: string };
interface EvidenceRec {
  id: string;
  draft: EvidenceDraft;
  sourceType: SourceType;
  snippet: string;
  matches: { identifierId: string; rules: IdentityRuleId[] }[];
  rejected: { raw: string; position: number; reason: string }[];
  /** 1 = search by the case identifiers, 2 = reverse lookup of an address, 3 = pivot on the handle of a publisher, 4 = earlier copies of the pages found (web archive). */
  round: 1 | 2 | 3 | 4;
}
interface TraceRec {
  id: string;
  evidenceId: string;
  cand: AddressCandidate;
  contextType: string;
  sourceType: SourceType;
}
interface AddressRow {
  chain: string;
  address: string;
  category: string;
  labels: unknown[];
  isContract: boolean | null;
  /** A label or an on-chain analysis spoke about the address; otherwise an existing row is left untouched. */
  known: boolean;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;
const SNIPPET_CHARS = 400;
/** Pages sent to the web archive per run (it is a rate-limited public service). */
const MAX_ARCHIVED_PAGES = 10;

type RunResults = Awaited<ReturnType<PipelineService['results']>>;

/** What the diff needs from `results()`; JSON columns are typed here once. */
const toDiffInput = (r: RunResults): DiffRunInput => {
  const params = r.run.paramsJson as unknown as { connectors?: string[]; chain?: string };
  return {
    id: r.run.id,
    startedAt: r.run.startedAt.toISOString(),
    params: { connectors: params.connectors ?? [], chain: params.chain ?? 'fixture' },
    links: r.links as unknown as DiffRunInput['links'],
    evidence: r.evidence as unknown as DiffRunInput['evidence'],
    traces: r.traces,
    chain: r.chain as unknown as DiffRunInput['chain'],
  };
};

@Injectable()
export class PipelineService {
  private readonly log = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly labels: LabelService,
    private readonly registry: ConnectorRegistry,
    private readonly chain: ChainAnalysisService,
  ) {}

  /**
   * One analysis run (PLAN §3 pipeline), synchronous at demo scale:
   *   identifiers → connectors.search → Evidence → extract + classify → Traces
   *   → reverse lookup of every found address (who else publishes it) [+ profile pivot for address cases]
   *   → on-chain step: history, bytecode / deposit / service classification, NBP valuation, indicators, chronology
   *   → link identifier ↔ address, label / exclude, score → persist everything in one transaction.
   */
  async run(caseId: string, opts: { connectors?: string[]; asOf?: Date; chain?: ChainMode; trigger?: 'manual' | 'scheduled' } = {}) {
    const kase = await this.prisma.case.findUnique({ where: { id: caseId }, include: { identifiers: true } });
    if (!kase) throw new NotFoundException(`case ${caseId} not found`);
    const connectors = this.registry.pick(opts.connectors ?? DEFAULT_CONNECTORS);
    const asOf = opts.asOf ?? new Date();
    const chainMode = opts.chain ?? DEFAULT_CHAIN_MODE;
    const params = { connectors: connectors.map((c) => c.id), asOf: asOf.toISOString(), contextRadius: 200, chain: chainMode };

    const run = await this.prisma.run.create({
      data: { caseId, status: 'RUNNING', trigger: opts.trigger ?? 'manual', rulesVersion: this.rules.rules.version, appVersion: APP_VERSION, paramsJson: json(params) },
    });

    try {
      const idents: Ident[] = kase.identifiers.map((i) => ({ id: i.id, type: i.type, value: i.value, normalized: i.normalized }));
      const ctx = { caseId, runId: run.id };
      const evidence: EvidenceRec[] = [];
      const traces: TraceRec[] = [];
      const errors: { connector: string; round: number; note: Note }[] = [];
      const seen = new Set<string>();
      const people = idents.filter((i) => i.type !== 'ADDRESS');

      const ingest = (draft: EvidenceDraft, round: 1 | 2 | 3 | 4, onlyKey?: string) => {
        const dedupe = draft.url ?? draft.resourceId ?? draft.sha256;
        if (seen.has(dedupe)) return;
        const extraction = extractAddresses(draft.text, { examples: this.labels.exampleAddresses() });
        const cands = extraction.addresses.filter((c) => !onlyKey || (c.chain !== null && labelKey(c.chain, c.address) === onlyKey));
        if (onlyKey && cands.length === 0) return;
        seen.add(dedupe);

        const signals = { text: extraction.text, authorHandle: draft.author?.handle, authorName: draft.author?.name };
        const matches = people
          .map((i) => ({ identifierId: i.id, ...evaluateIdentity(i, signals, idents) }))
          .filter((m) => m.matched)
          .map(({ identifierId, rules }) => ({ identifierId, rules }));

        const id = randomUUID();
        const mine = cands.map((cand): TraceRec => {
          const contextType = classifyContext(cand.context).contextType;
          return { id: randomUUID(), evidenceId: id, cand, contextType, sourceType: sourceTypeFor(contextType, draft.origin) };
        });
        traces.push(...mine);
        evidence.push({
          id,
          draft,
          round,
          matches,
          rejected: extraction.rejected,
          sourceType: mine[0]?.sourceType ?? sourceTypeFor('DISCUSSION', draft.origin),
          snippet: cands[0]?.context ?? extraction.text.slice(0, SNIPPET_CHARS),
        });
      };
      const search = async (identifiers: Ident[], round: 1 | 2 | 3, accept: (d: EvidenceDraft) => boolean, onlyKey?: string) => {
        for (const c of connectors) {
          try {
            for (const d of await c.search({ identifiers, ...ctx })) if (accept(d)) ingest(d, round, onlyKey);
          } catch (e) {
            errors.push({ connector: c.id, round, note: noteOf(e) });
          }
        }
      };

      // Round 1: search by the case identifiers.
      await search(idents, 1, () => true);
      if (errors.length === connectors.length) {
        const detail = errors.map((e) => `${e.connector}: ${e.note.params?.detail ?? e.note.code}`).join('; ');
        throw new NoteError({ code: 'ALL_CONNECTORS_FAILED', params: { detail } }, `all connectors failed: ${detail}`);
      }

      // Round 4 (web archives): earlier copies of the pages that carry addresses — which address was there, and when.
      const archives = connectors.filter((c) => c.archive);
      if (archives.length > 0) {
        const pages: ArchiveSource[] = evidence
          .filter((e) => e.draft.url && !e.draft.snapshotOf && /^https?:/.test(e.draft.url) && traces.some((t) => t.evidenceId === e.id))
          .slice(0, MAX_ARCHIVED_PAGES)
          .map((e) => ({ url: e.draft.url!, platform: e.draft.platform, origin: e.draft.origin, author: e.draft.author, title: e.draft.title }));
        for (const c of archives) {
          try {
            for (const d of await c.archive!(pages, { identifiers: idents, ...ctx })) ingest(d, 4);
          } catch (e) {
            errors.push({ connector: c.id, round: 4, note: noteOf(e) });
          }
        }
      }

      const labelOf = (c: AddressCandidate) => (c.chain ? this.labels.lookup(c.chain, c.address) : undefined);
      const personal = (c: AddressCandidate) => c.chain !== null && !c.isExample && !(labelOf(c) && exclusionForCategory(labelOf(c)!.category));

      // Round 2: who else publishes each address we found? (feeds the multi-identity conflict rule)
      const lookups = new Map<string, AddressCandidate>();
      for (const t of traces) if (personal(t.cand)) lookups.set(labelKey(t.cand.chain!, t.cand.address), t.cand);
      for (const [key, cand] of lookups) await search([{ id: '', type: 'ADDRESS', value: cand.address, normalized: cand.address }], 2, () => true, key);

      // Round 3 (address cases only): which accounts published the address, and what else do they publish?
      const targets = new Set(
        idents
          .filter((i) => i.type === 'ADDRESS')
          .flatMap((i) => {
            const p = parseAddress(i.normalized);
            return p.ok ? [labelKey(p.chain, p.address)] : [];
          }),
      );
      if (targets.size > 0) {
        const handles = new Set<string>();
        for (const e of evidence) {
          if (e.draft.author?.handle && traces.some((t) => t.evidenceId === e.id && t.cand.chain && targets.has(labelKey(t.cand.chain, t.cand.address)))) handles.add(normalizeIdentifier('NICK', e.draft.author.handle));
        }
        for (const handle of handles) {
          await search([{ id: '', type: 'NICK', value: handle, normalized: handle }], 3, (d) => !!d.author?.handle && normalizeIdentifier('NICK', d.author.handle) === handle);
        }
      }

      // Group the traces by address.
      const evById = new Map(evidence.map((e) => [e.id, e]));
      const byAddress = new Map<string, TraceRec[]>();
      for (const t of traces) {
        if (!t.cand.chain) continue; // detect-only kinds (Monero, Lightning) are not analysable
        const key = labelKey(t.cand.chain, t.cand.address);
        byAddress.set(key, [...(byAddress.get(key) ?? []), t]);
      }
      // An address the analyst typed in is analysed on-chain even when no page mentions it.
      const subjectCand = new Map<string, AddressCandidate>();
      for (const i of idents) {
        const cand = i.type === 'ADDRESS' ? extractAddresses(i.normalized, { examples: this.labels.exampleAddresses() }).addresses[0] : undefined;
        if (cand?.chain) subjectCand.set(labelKey(cand.chain, cand.address), cand);
      }
      for (const key of subjectCand.keys()) if (!byAddress.has(key)) byAddress.set(key, []);
      const candOf = (key: string, trs: TraceRec[]) => trs[0]?.cand ?? subjectCand.get(key)!;

      // On-chain step for every address that may belong to a person (labelled institutions are not worth a lookup).
      const adAddresses = new Set(traces.filter((t) => t.sourceType === 'P2P_OFFER' || t.sourceType === 'SALE_AD').map((t) => t.cand.address));
      const analyses = new Map<string, ChainAnalysis>();
      const chainNotes: { address: string; notes: Note[] }[] = [];
      const chainWarnings: { address: string; warnings: Note[] }[] = [];
      if (chainMode !== 'off') {
        for (const [key, trs] of byAddress) {
          const first = candOf(key, trs);
          if (!personal(first) || first.isExample || trs.some((t) => t.cand.isExample)) continue;
          try {
            const { analysis, notes } = await this.chain.analyse({ mode: chainMode, chain: first.chain!, address: first.address, adAddresses, ctx });
            if (analysis) {
              analyses.set(key, analysis);
              if (analysis.warnings.length > 0) chainWarnings.push({ address: first.address, warnings: analysis.warnings });
            } else if (notes) chainNotes.push({ address: first.address, notes });
          } catch (e) {
            chainNotes.push({ address: first.address, notes: [noteOf(e)] }); // a failing provider never fails the run
          }
        }
      }

      // Addresses (category from label, else from the on-chain classification) and exclusions.
      const addressRows = new Map<string, AddressRow>();
      const exclusionsOf = new Map<string, ExclusionId[]>();
      for (const [key, trs] of byAddress) {
        const first = candOf(key, trs);
        const label = labelOf(first);
        const analysis = analyses.get(key);
        const exclusions = new Set<ExclusionId>();
        const byLabel = label && exclusionForCategory(label.category);
        if (byLabel) exclusions.add(byLabel);
        if (trs.some((t) => t.cand.isExample)) exclusions.add('EXCL_EXAMPLE');
        const byChain = !label && analysis && exclusionForCategory(analysis.category);
        if (byChain) exclusions.add(byChain);
        exclusionsOf.set(key, [...exclusions]);
        addressRows.set(key, {
          chain: first.chain!,
          address: first.address,
          category: label?.category ?? analysis?.category ?? 'UNHOSTED',
          labels: label
            ? [{ name: label.name, category: label.category, source: 'label', sourceUrl: label.sourceUrl ?? null, note: label.note ?? null }]
            : analysis && analysis.category !== 'UNHOSTED'
              ? [{ name: analysis.basis, category: analysis.category, source: 'heuristic' }]
              : [],
          isContract: label?.isContract ?? analysis?.isContract ?? null,
          known: !!label || !!analysis,
        });
      }
      for (const a of analyses.values()) {
        for (const cp of a.counterparties) {
          const key = labelKey(cp.chain, cp.address);
          if (!addressRows.has(key)) {
            addressRows.set(key, { chain: cp.chain, address: cp.address, category: cp.category, labels: [{ name: cp.name, category: cp.category, source: cp.source }], isContract: cp.category === 'CONTRACT' || cp.category === 'DEX' ? true : null, known: true });
          }
        }
      }

      // Links: one per (identifier, address) with at least one trace on evidence that matched the identifier.
      const claimantsOf = (trs: TraceRec[]) =>
        countClaimants(trs.map((t) => ({ platform: evById.get(t.evidenceId)!.draft.platform, handle: evById.get(t.evidenceId)!.draft.author?.handle })), idents);
      const observed = (ev: EvidenceRec) => ev.draft.publishedAt ?? ev.draft.fetchedAt.toISOString();
      const chainFacts = (key: string, dates: string[]) => {
        const a = analyses.get(key);
        return a ? { everUsed: a.everUsed, activeNearTrace: activeNearTrace(a.transferTimes, dates) } : undefined;
      };
      const links: LinkDraft[] = [];
      for (const [key, trs] of byAddress) {
        const claimants = claimantsOf(trs);
        for (const ident of people) {
          const mine = trs.filter((t) => evById.get(t.evidenceId)!.matches.some((m) => m.identifierId === ident.id));
          if (mine.length === 0) continue;
          const scoringTraces = mine.map((t) => {
            const ev = evById.get(t.evidenceId)!;
            return { evidenceId: ev.id, originKey: ev.draft.platform, sourceType: t.sourceType, identity: ev.matches.find((m) => m.identifierId === ident.id)!.rules, observedAt: observed(ev) };
          });
          const result = scoreLink(this.rules.rules, {
            asOf: asOf.toISOString(),
            exclusions: exclusionsOf.get(key),
            unrelatedIdentities: claimants,
            chain: chainFacts(key, scoringTraces.map((t) => t.observedAt)),
            traces: scoringTraces,
          });
          links.push({
            key,
            runId: run.id,
            identifierId: ident.id,
            score: result.score,
            band: result.band,
            breakdownJson: json(result.breakdown),
            hintsJson: json(result.hints),
            excludedReason: result.excludedReason ?? null,
          });
        }
      }

      // Address cases: who is behind the address?
      const identities = buildIdentities({
        targets,
        evidence: evidence.map((e) => ({ id: e.id, url: e.draft.url, platform: e.draft.platform, author: e.draft.author, publishedAt: e.draft.publishedAt, fetchedAt: e.draft.fetchedAt.toISOString() })),
        traces: traces.filter((t) => t.cand.chain).map((t) => ({ evidenceId: t.evidenceId, key: labelKey(t.cand.chain!, t.cand.address), chain: t.cand.chain!, address: t.cand.address, sourceType: t.sourceType })),
        describe: (key) => ({ category: addressRows.get(key)?.category ?? 'UNHOSTED', excluded: (exclusionsOf.get(key) ?? []).length > 0 }),
        scoreFor: (scoringTraces, key) =>
          scoreLink(this.rules.rules, {
            asOf: asOf.toISOString(),
            exclusions: exclusionsOf.get(key),
            unrelatedIdentities: claimantsOf(byAddress.get(key) ?? []),
            chain: chainFacts(key, scoringTraces.map((t) => t.observedAt!)),
            traces: scoringTraces,
          }),
      });

      // Persist everything or nothing.
      await this.prisma.$transaction(async (tx) => {
        await tx.evidence.createMany({
          data: evidence.map((e) => ({
            id: e.id,
            runId: run.id,
            connectorId: e.draft.connectorId,
            url: e.draft.url ?? null,
            resourceId: e.draft.resourceId ?? null,
            fetchedAt: e.draft.fetchedAt,
            sha256: e.draft.sha256,
            snippet: e.snippet,
            archiveUrl: e.draft.archiveUrl ?? null,
            sourceType: e.sourceType,
            metaJson: json({
              platform: e.draft.platform,
              origin: e.draft.origin,
              author: e.draft.author ?? null,
              publishedAt: e.draft.publishedAt ?? null,
              title: e.draft.title ?? null,
              snapshotOf: e.draft.snapshotOf ?? null,
              round: e.round,
              matches: e.matches,
              rejected: e.rejected,
            }),
          })),
        });
        await tx.trace.createMany({
          data: traces.map((t) => ({
            id: t.id,
            runId: run.id,
            evidenceId: t.evidenceId,
            identifierId: evById.get(t.evidenceId)!.matches[0]?.identifierId ?? null,
            chain: t.cand.chain ?? t.cand.kind,
            address: t.cand.address,
            contextType: t.contextType,
            contextSnippet: t.cand.context,
            position: t.cand.position,
          })),
        });
        const addressIds = new Map<string, string>();
        for (const [key, a] of addressRows) {
          const data = { category: a.category as never, labelsJson: json(a.labels), isContract: a.isContract };
          const row = await tx.address.upsert({ where: { chain_address: { chain: a.chain, address: a.address } }, create: { chain: a.chain, address: a.address, ...data }, update: a.known ? data : {} });
          addressIds.set(key, row.id);
        }
        await tx.link.createMany({ data: links.map(({ key, ...l }) => ({ ...l, addressId: addressIds.get(key)! })) });
        await tx.chainSnapshot.createMany({
          data: [...analyses].map(([key, a]) => ({
            runId: run.id,
            addressId: addressIds.get(key)!,
            indicatorsJson: json(a.indicators),
            flowsJson: json(a.flows),
            fetchedAt: new Date(a.fetchedAt),
            provider: a.provider,
          })),
        });
        await tx.run.update({
          where: { id: run.id },
          data: {
            status: 'DONE',
            finishedAt: new Date(),
            summaryJson: json({
              stats: { evidence: evidence.length, traces: traces.length, links: links.length, chainSnapshots: analyses.size, identities: identities.length },
              connectorErrors: errors,
              chainNotes,
              chainWarnings,
              identities,
            }),
          },
        });
      });
    } catch (e) {
      await this.prisma.run.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), summaryJson: json({ error: noteOf(e) }) } });
      throw e;
    }
    // The comparison is an extra: if it fails the run stays DONE and the analyst still has the results.
    await this.compareWithPrevious(run.id, caseId, run.startedAt).catch((e: Error) => this.log.warn(`comparison of run ${run.id} failed: ${e.message}`));
    return this.results(run.id);
  }

  /** RunDiff against the latest earlier finished run of the case, and the notifications that diff deserves (PLAN 3.8). */
  private async compareWithPrevious(runId: string, caseId: string, startedAt: Date) {
    const prev = await this.prisma.run.findFirst({ where: { caseId, status: 'DONE', startedAt: { lt: startedAt } }, orderBy: { startedAt: 'desc' }, select: { id: true } });
    if (!prev) return; // the first run has nothing to be compared with
    const diff = diffRuns(toDiffInput(await this.results(prev.id)), toDiffInput(await this.results(runId)));
    await this.prisma.$transaction([
      this.prisma.runDiff.create({ data: { caseId, fromRunId: prev.id, toRunId: runId, diffJson: json(diff) } }),
      this.prisma.notification.createMany({ data: notificationsFor(diff).map((n) => ({ caseId, runId, kind: n.kind, paramsJson: json(n.params) })) }),
    ]);
  }

  /** The stored comparison of a run with the one before it; null for the first run of a case. */
  async diffOf(runId: string) {
    const row = await this.prisma.runDiff.findFirst({ where: { toRunId: runId }, orderBy: { id: 'asc' } });
    if (!row) {
      const exists = await this.prisma.run.findUnique({ where: { id: runId }, select: { id: true } });
      if (!exists) throw new NotFoundException(`run ${runId} not found`);
    }
    return { diff: (row?.diffJson ?? null) as unknown as RunDiffDoc | null };
  }

  async results(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: {
        evidence: { orderBy: [{ fetchedAt: 'asc' }, { url: 'asc' }, { id: 'asc' }] },
        traces: { orderBy: [{ address: 'asc' }, { evidenceId: 'asc' }, { position: 'asc' }] },
        links: { include: { identifier: true, address: true } },
        snapshots: { include: { address: true } },
      },
    });
    if (!run) throw new NotFoundException(`run ${runId} not found`);
    const { evidence, traces, links, snapshots, ...head } = run;
    return {
      run: head,
      links: links
        .map(({ identifier, address, ...l }) => ({
          ...l,
          identifier: { id: identifier.id, type: identifier.type, value: identifier.value },
          address: { chain: address.chain, address: address.address, category: address.category, labels: address.labelsJson, isContract: address.isContract },
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.address.address.localeCompare(b.address.address) ||
            a.identifier.type.localeCompare(b.identifier.type) ||
            a.identifier.value.localeCompare(b.identifier.value),
        ),
      evidence,
      traces,
      /** On-chain indicators and chronology per analysed address. */
      chain: snapshots
        .map((s) => ({
          address: { chain: s.address.chain, address: s.address.address, category: s.address.category },
          provider: s.provider,
          fetchedAt: s.fetchedAt,
          indicators: s.indicatorsJson,
          flows: s.flowsJson,
        }))
        .sort((a, b) => a.address.address.localeCompare(b.address.address)),
    };
  }
}
