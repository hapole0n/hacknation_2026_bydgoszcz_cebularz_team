import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  classifyContext,
  countClaimants,
  evaluateIdentity,
  exclusionForCategory,
  extractAddresses,
  labelKey,
  scoreLink,
  sourceTypeFor,
  type AddressCandidate,
  type ExclusionId,
  type IdentityRuleId,
  type SourceType,
} from '@olcys/core';
import { DEFAULT_CONNECTORS, ConnectorRegistry } from '../connectors/connector.registry.js';
import type { EvidenceDraft, SearchIdentifier } from '../connectors/connector.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LabelService } from '../labels/label.service.js';
import { APP_VERSION } from '../paths.js';
import { PrismaService } from '../prisma.service.js';
import { RulesService } from '../rules.service.js';

type Ident = SearchIdentifier & { id: string };
type LinkDraft = Omit<Prisma.LinkCreateManyInput, 'addressId'> & { key: string };
interface EvidenceRec {
  id: string;
  draft: EvidenceDraft;
  sourceType: SourceType;
  snippet: string;
  matches: { identifierId: string; rules: IdentityRuleId[] }[];
  rejected: { raw: string; position: number; reason: string }[];
  round: 1 | 2;
}
interface TraceRec {
  id: string;
  evidenceId: string;
  cand: AddressCandidate;
  contextType: string;
  sourceType: SourceType;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;
const SNIPPET_CHARS = 400;

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly labels: LabelService,
    private readonly registry: ConnectorRegistry,
  ) {}

  /**
   * One analysis run (PLAN §3 pipeline), synchronous at demo scale:
   *   identifiers → connectors.search → Evidence → extract + classify → Traces
   *   → reverse lookup of every found address (other places that publish it)
   *   → link identifier ↔ address, label / exclude, score → persist everything in one transaction.
   */
  async run(caseId: string, opts: { connectors?: string[]; asOf?: Date } = {}) {
    const kase = await this.prisma.case.findUnique({ where: { id: caseId }, include: { identifiers: true } });
    if (!kase) throw new NotFoundException(`case ${caseId} not found`);
    const connectors = this.registry.pick(opts.connectors ?? DEFAULT_CONNECTORS);
    const asOf = opts.asOf ?? new Date();
    const params = { connectors: connectors.map((c) => c.id), asOf: asOf.toISOString(), contextRadius: 200 };

    const run = await this.prisma.run.create({
      data: { caseId, status: 'RUNNING', rulesVersion: this.rules.rules.version, appVersion: APP_VERSION, paramsJson: json(params) },
    });

    try {
      const idents: Ident[] = kase.identifiers.map((i) => ({ id: i.id, type: i.type, value: i.value, normalized: i.normalized }));
      const ctx = { caseId, runId: run.id };
      const evidence: EvidenceRec[] = [];
      const traces: TraceRec[] = [];
      const errors: { connector: string; message: string }[] = [];
      const seen = new Set<string>();
      const people = idents.filter((i) => i.type !== 'ADDRESS');

      const ingest = (draft: EvidenceDraft, round: 1 | 2, onlyKey?: string) => {
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

      // Round 1: search by the case identifiers.
      for (const c of connectors) {
        try {
          for (const d of await c.search({ identifiers: idents, ...ctx })) ingest(d, 1);
        } catch (e) {
          errors.push({ connector: c.id, message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (errors.length === connectors.length) throw new Error(`all connectors failed: ${errors.map((e) => `${e.connector}: ${e.message}`).join('; ')}`);

      // Round 2: who else publishes each address we found? (feeds the multi-identity conflict rule)
      const labelOf = (c: AddressCandidate) => (c.chain ? this.labels.lookup(c.chain, c.address) : undefined);
      const lookups = new Map<string, AddressCandidate>();
      for (const t of traces) {
        if (t.cand.chain && !t.cand.isExample && !(labelOf(t.cand) && exclusionForCategory(labelOf(t.cand)!.category))) {
          lookups.set(labelKey(t.cand.chain, t.cand.address), t.cand);
        }
      }
      for (const [key, cand] of lookups) {
        const probe: Ident = { id: '', type: 'ADDRESS', value: cand.address, normalized: cand.address };
        for (const c of connectors) {
          try {
            for (const d of await c.search({ identifiers: [probe], ...ctx })) ingest(d, 2, key);
          } catch (e) {
            errors.push({ connector: c.id, message: `reverse lookup ${cand.address}: ${e instanceof Error ? e.message : String(e)}` });
          }
        }
      }

      // Links: one per (identifier, address) with at least one trace on evidence that matched the identifier.
      const evById = new Map(evidence.map((e) => [e.id, e]));
      const byAddress = new Map<string, TraceRec[]>();
      for (const t of traces) {
        if (!t.cand.chain) continue; // detect-only kinds (Monero, Lightning) are not analysable
        const key = labelKey(t.cand.chain, t.cand.address);
        byAddress.set(key, [...(byAddress.get(key) ?? []), t]);
      }

      const addressRows = new Map<string, { chain: string; address: string; category: string; labels: unknown[]; isContract: boolean | null }>();
      const links: LinkDraft[] = [];
      for (const [key, trs] of byAddress) {
        const first = trs[0]!.cand;
        const label = labelOf(first);
        const exclusions = new Set<ExclusionId>();
        const byLabel = label && exclusionForCategory(label.category);
        if (byLabel) exclusions.add(byLabel);
        if (trs.some((t) => t.cand.isExample)) exclusions.add('EXCL_EXAMPLE');
        addressRows.set(key, {
          chain: first.chain!,
          address: first.address,
          category: label?.category ?? 'UNHOSTED',
          labels: label ? [{ name: label.name, category: label.category, sourceUrl: label.sourceUrl ?? null, note: label.note ?? null }] : [],
          isContract: label?.isContract ?? null,
        });

        const claimants = countClaimants(
          trs.map((t) => ({ platform: evById.get(t.evidenceId)!.draft.platform, handle: evById.get(t.evidenceId)!.draft.author?.handle })),
          idents,
        );
        for (const ident of people) {
          const mine = trs.filter((t) => evById.get(t.evidenceId)!.matches.some((m) => m.identifierId === ident.id));
          if (mine.length === 0) continue;
          const result = scoreLink(this.rules.rules, {
            asOf: asOf.toISOString(),
            exclusions: [...exclusions],
            unrelatedIdentities: claimants,
            traces: mine.map((t) => {
              const ev = evById.get(t.evidenceId)!;
              return {
                evidenceId: ev.id,
                originKey: ev.draft.platform,
                sourceType: t.sourceType,
                identity: ev.matches.find((m) => m.identifierId === ident.id)!.rules,
                observedAt: ev.draft.publishedAt ?? ev.draft.fetchedAt.toISOString(),
              };
            }),
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
          const row = await tx.address.upsert({
            where: { chain_address: { chain: a.chain, address: a.address } },
            create: { chain: a.chain, address: a.address, ...data },
            update: data,
          });
          addressIds.set(key, row.id);
        }
        await tx.link.createMany({ data: links.map(({ key, ...l }) => ({ ...l, addressId: addressIds.get(key)! })) });
        await tx.run.update({
          where: { id: run.id },
          data: {
            status: 'DONE',
            finishedAt: new Date(),
            paramsJson: json({ ...params, connectorErrors: errors, stats: { evidence: evidence.length, traces: traces.length, links: links.length } }),
          },
        });
      });
    } catch (e) {
      await this.prisma.run.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), paramsJson: json({ ...params, error: e instanceof Error ? e.message : String(e) }) },
      });
      throw e;
    }
    return this.results(run.id);
  }

  async results(runId: string) {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      include: {
        evidence: { orderBy: { fetchedAt: 'asc' } },
        traces: true,
        links: { include: { identifier: true, address: true } },
      },
    });
    if (!run) throw new NotFoundException(`run ${runId} not found`);
    const { evidence, traces, links, ...head } = run;
    return {
      run: head,
      links: links
        .map(({ identifier, address, ...l }) => ({
          ...l,
          identifier: { id: identifier.id, type: identifier.type, value: identifier.value },
          address: { chain: address.chain, address: address.address, category: address.category, labels: address.labelsJson, isContract: address.isContract },
        }))
        .sort((a, b) => b.score - a.score || a.address.address.localeCompare(b.address.address)),
      evidence,
      traces,
    };
  }
}

