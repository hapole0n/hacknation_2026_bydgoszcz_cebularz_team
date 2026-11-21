import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { APP_NAME, buildReport, canonicalJson, type ReportDoc, type ReportInput } from '@kropka/core';
import { ConnectorRegistry } from '../connectors/connector.registry.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { PrismaService } from '../prisma.service.js';
import { renderPdf } from './pdf.js';

export interface ReportBundle {
  generatedAt: string;
  /** SHA-256 of the report data (canonical JSON of `doc`). */
  sha256: string;
  /** SHA-256 over the sorted SHA-256 of every evidence item. */
  evidenceSha256: string;
  doc: ReportDoc;
}

export type ReportFile = { format: 'PDF' | 'JSON'; content: Buffer; fileName: string; contentType: string };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const TYPES = { PDF: 'application/pdf', JSON: 'application/json; charset=utf-8' } as const;

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
    private readonly registry: ConnectorRegistry,
  ) {}

  /** The report of one run, built from what the API serves for it (same data as the screen). */
  async bundle(runId: string): Promise<ReportBundle> {
    const results = JSON.parse(JSON.stringify(await this.pipeline.results(runId))) as Omit<ReportInput, 'appName' | 'case' | 'connectors'> & { run: ReportInput['run'] & { caseId: string } };
    const kase = await this.prisma.case.findUniqueOrThrow({ where: { id: results.run.caseId }, include: { identifiers: true } });
    const doc = buildReport({
      appName: APP_NAME,
      case: { id: kase.id, title: kase.title, createdBy: kase.createdBy, identifiers: kase.identifiers.map(({ type, value }) => ({ type, value })) },
      run: results.run,
      links: results.links,
      evidence: results.evidence,
      traces: results.traces,
      chain: results.chain,
      connectors: this.registry.list().map(({ id, policy }) => ({ id, policy })),
    });
    return { generatedAt: new Date().toISOString(), sha256: sha256(canonicalJson(doc)), evidenceSha256: sha256(results.evidence.map((e) => e.sha256).sort().join('\n')), doc };
  }

  /** Renders the file and keeps it in the database, tied to the run; the same data is stored once per format. */
  async file(runId: string, format: 'PDF' | 'JSON'): Promise<ReportFile> {
    const bundle = await this.bundle(runId);
    const stored = await this.prisma.report.findFirst({ where: { runId, format, sha256: bundle.sha256, content: { not: null } }, orderBy: { createdAt: 'desc' } });
    if (stored?.content) return { format, content: Buffer.from(stored.content), fileName: stored.path, contentType: TYPES[format] };

    const content = format === 'PDF' ? await renderPdf(bundle.doc, bundle) : Buffer.from(JSON.stringify(bundle, null, 2), 'utf8');
    const fileName = `${APP_NAME.toLowerCase()}-raport-${runId.slice(0, 8)}.${format.toLowerCase()}`;
    await this.prisma.report.create({ data: { runId, format, sha256: bundle.sha256, path: fileName, content: new Uint8Array(content) } });
    return { format, content, fileName, contentType: TYPES[format] };
  }
}
