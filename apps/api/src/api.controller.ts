import { readFileSync } from 'node:fs';
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { IDENTIFIER_TYPES, normalizeIdentifier, type IdentifierType } from '@kropka/core';
import { ChainRegistry, isChainMode } from './chains/chain.registry.js';
import { ConnectorRegistry } from './connectors/connector.registry.js';
import { repoPath } from './paths.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { PrismaService } from './prisma.service.js';
import { ReportService, type ReportFile } from './report/report.service.js';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, field: string, max: number): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > max) throw new BadRequestException(`${field}: expected a non-empty string of at most ${max} characters`);
  return v.trim();
};

/** Validates POST /api/cases at the trust boundary and normalises the identifiers. */
export function parseCaseBody(body: unknown) {
  if (!isObj(body)) throw new BadRequestException('expected a JSON object');
  if (!Array.isArray(body.identifiers) || body.identifiers.length === 0 || body.identifiers.length > 50) {
    throw new BadRequestException('identifiers: expected 1–50 items');
  }
  const seen = new Set<string>();
  const identifiers = body.identifiers.flatMap((raw: unknown, i: number) => {
    if (!isObj(raw) || !(IDENTIFIER_TYPES as readonly unknown[]).includes(raw.type)) {
      throw new BadRequestException(`identifiers[${i}].type: one of ${IDENTIFIER_TYPES.join(', ')}`);
    }
    const type = raw.type as IdentifierType;
    const value = text(raw.value, `identifiers[${i}].value`, 300);
    let normalized: string;
    try {
      normalized = normalizeIdentifier(type, value);
    } catch (e) {
      throw new BadRequestException(`identifiers[${i}]: ${(e as Error).message}`);
    }
    return seen.has(`${type}:${normalized}`) ? [] : (seen.add(`${type}:${normalized}`), [{ type, value, normalized }]);
  });
  const retentionDays = body.retentionDays;
  if (retentionDays !== undefined && !(Number.isInteger(retentionDays) && (retentionDays as number) > 0)) {
    throw new BadRequestException('retentionDays: expected a positive integer');
  }
  return {
    title: text(body.title, 'title', 200),
    createdBy: body.createdBy === undefined ? 'analyst' : text(body.createdBy, 'createdBy', 100),
    scheduleCron: body.scheduleCron === undefined ? null : text(body.scheduleCron, 'scheduleCron', 100),
    retentionDays: (retentionDays as number | undefined) ?? null,
    identifiers,
  };
}

/** Validates POST /api/links/:id/decision: the analyst's call on a computed link (kept apart from the score). */
export function parseDecisionBody(body: unknown) {
  if (!isObj(body)) throw new BadRequestException('expected a JSON object');
  const { decision } = body;
  if (decision !== null && decision !== 'CONFIRMED' && decision !== 'REJECTED') throw new BadRequestException('decision: expected "CONFIRMED", "REJECTED" or null (to withdraw)');
  if (decision === null) return { analystDecision: null, analystNote: null, analystName: null, decidedAt: null };
  const note = body.note === undefined || body.note === '' ? null : text(body.note, 'note', 1000);
  return { analystDecision: decision as 'CONFIRMED' | 'REJECTED', analystNote: note, analystName: text(body.analyst, 'analyst', 100), decidedAt: new Date() };
}

@Controller()
export class ApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly registry: ConnectorRegistry,
    private readonly chains: ChainRegistry,
    private readonly reports: ReportService,
  ) {}

  /** Sources and their policies (terms of service, method, rate limit) — shown to the analyst. */
  @Get('connectors')
  connectors() {
    return this.registry.list().map(({ id, kind, version, policy }) => ({ id, kind, version, policy }));
  }

  /** On-chain data sources and whether each is ready (live ones need an API key in .env). */
  @Get('chain-adapters')
  chainAdapters() {
    return this.chains.list();
  }

  @Post('cases')
  createCase(@Body() body: unknown) {
    const { identifiers, ...data } = parseCaseBody(body);
    return this.prisma.case.create({ data: { ...data, identifiers: { create: identifiers } }, include: { identifiers: true } });
  }

  @Get('cases')
  listCases() {
    return this.prisma.case.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        identifiers: { select: { type: true, value: true } },
        _count: { select: { runs: true } },
        runs: { orderBy: { startedAt: 'desc' }, take: 1, select: { id: true, status: true, startedAt: true } },
      },
    });
  }

  /** "Załaduj sprawę demonstracyjną": creates (once) the synthetic demo case — variant "identifiers" (default) or "address". */
  @Post('demo/case')
  async demoCase(@Query('variant') variant?: string) {
    const demo = JSON.parse(readFileSync(repoPath('fixtures/demo-case.json'), 'utf8'));
    if (variant !== undefined && variant !== 'identifiers' && variant !== 'address') throw new BadRequestException('variant: "identifiers" or "address"');
    const def = demo[variant ?? 'identifiers'];
    const existing = await this.prisma.case.findFirst({ where: { title: def.title, createdBy: 'demo' }, include: { identifiers: true } });
    if (existing) return existing;
    const { identifiers, ...data } = parseCaseBody({ ...def, createdBy: 'demo' });
    return this.prisma.case.create({ data: { ...data, identifiers: { create: identifiers } }, include: { identifiers: true } });
  }

  /** The analyst confirms / rejects a computed link (name + time stored); the computed score is never touched. */
  @Post('links/:id/decision')
  async decide(@Param('id') id: string, @Body() body: unknown) {
    const data = parseDecisionBody(body);
    const link = await this.prisma.link.findUnique({ where: { id }, select: { id: true } });
    if (!link) throw new NotFoundException(`link ${id} not found`);
    return this.prisma.link.update({ where: { id }, data, select: { id: true, analystDecision: true, analystNote: true, analystName: true, decidedAt: true } });
  }

  @Get('cases/:id')
  async getCase(@Param('id') id: string) {
    const kase = await this.prisma.case.findUnique({
      where: { id },
      include: { identifiers: true, runs: { orderBy: { startedAt: 'desc' }, select: { id: true, status: true, startedAt: true, finishedAt: true, rulesVersion: true } } },
    });
    if (!kase) throw new NotFoundException(`case ${id} not found`);
    return kase;
  }

  /**
   * Runs the analysis synchronously and returns the results (fine at demo scale; scheduling comes with P6).
   * Body: { connectors?: string[], chain?: "fixture" | "live" | "off" } — live sources are opt-in, default is offline.
   */
  @Post('cases/:id/runs')
  startRun(@Param('id') id: string, @Body() body: unknown) {
    const b = isObj(body) ? body : {};
    if (b.connectors !== undefined && !(Array.isArray(b.connectors) && b.connectors.every((c) => typeof c === 'string'))) {
      throw new BadRequestException('connectors: expected a list of connector ids');
    }
    if (b.chain !== undefined && !isChainMode(b.chain)) throw new BadRequestException('chain: expected "fixture", "live" or "off"');
    return this.pipeline.run(id, { connectors: b.connectors as string[] | undefined, chain: b.chain });
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string) {
    return this.pipeline.results(id);
  }

  /**
   * Log of every outbound request (PLAN 3.9): time, case, source, host, path without query, status.
   * status 0 = blocked by the allowlist, -1 = network error. Newest first.
   */
  @Get('audit-log')
  async auditLog(@Query('limit') limit?: string, @Query('problems') problems?: string) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '', 10) || 200, 1), 1000);
    const where = problems === 'true' ? { status: { lte: 0 } } : undefined;
    const [rows, total, blocked, failed] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: [{ at: 'desc' }, { id: 'asc' }], take }),
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { status: 0 } }),
      this.prisma.auditLog.count({ where: { status: { lt: 0 } } }),
    ]);
    const caseIds = [...new Set(rows.flatMap((r) => (r.caseId ? [r.caseId] : [])))];
    const titles = new Map((await this.prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true, title: true } })).map((c) => [c.id, c.title]));
    return { total, blocked, failed, rows: rows.map((r) => ({ ...r, caseTitle: r.caseId ? (titles.get(r.caseId) ?? null) : null })) };
  }

  /** The report document (what the HTML view shows) with its SHA-256. */
  @Get('runs/:id/report')
  report(@Param('id') id: string) {
    return this.reports.bundle(id);
  }

  @Get('runs/:id/report.pdf')
  async reportPdf(@Param('id') id: string) {
    return this.download(await this.reports.file(id, 'PDF'));
  }

  @Get('runs/:id/report.json')
  async reportJson(@Param('id') id: string) {
    return this.download(await this.reports.file(id, 'JSON'));
  }

  private download(f: ReportFile) {
    return new StreamableFile(f.content, { type: f.contentType, disposition: `attachment; filename="${f.fileName}"` });
  }
}
