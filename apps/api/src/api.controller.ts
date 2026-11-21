import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { IDENTIFIER_TYPES, normalizeIdentifier, type IdentifierType } from '@olcys/core';
import { ConnectorRegistry } from './connectors/connector.registry.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { PrismaService } from './prisma.service.js';

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

@Controller()
export class ApiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly registry: ConnectorRegistry,
  ) {}

  /** Sources and their policies (terms of service, method, rate limit) — shown to the analyst. */
  @Get('connectors')
  connectors() {
    return this.registry.list().map(({ id, kind, version, policy }) => ({ id, kind, version, policy }));
  }

  @Post('cases')
  createCase(@Body() body: unknown) {
    const { identifiers, ...data } = parseCaseBody(body);
    return this.prisma.case.create({ data: { ...data, identifiers: { create: identifiers } }, include: { identifiers: true } });
  }

  @Get('cases')
  listCases() {
    return this.prisma.case.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { runs: true } } } });
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

  /** Runs the analysis synchronously and returns the results (fine at demo scale; scheduling comes with P6). */
  @Post('cases/:id/runs')
  startRun(@Param('id') id: string, @Body() body: unknown) {
    const connectors = isObj(body) ? body.connectors : undefined;
    if (connectors !== undefined && !(Array.isArray(connectors) && connectors.every((c) => typeof c === 'string'))) {
      throw new BadRequestException('connectors: expected a list of connector ids');
    }
    return this.pipeline.run(id, { connectors: connectors as string[] | undefined });
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string) {
    return this.pipeline.results(id);
  }
}
