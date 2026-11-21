import { Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { isChainMode } from '../chains/chain.registry.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { PrismaService } from '../prisma.service.js';

/** The steps the UI offers: every 15 minutes, hourly, daily. */
export const SCHEDULE_MINUTES = [15, 60, 1440] as const;
export const isScheduleMinutes = (v: unknown): v is (typeof SCHEDULE_MINUTES)[number] => (SCHEDULE_MINUTES as readonly unknown[]).includes(v);

/**
 * Monitoring (PLAN 3.8): cyclic re-runs of a case. The schedule lives in the database (`Case.scheduleEveryMin` +
 * `Case.nextRunAt`), the process only ticks — so a restart loses nothing and a run that came due while the API was
 * down is made on the first tick after it starts.
 * shortcut: one process, one tick loop; with several API replicas the due-claim below would need a row lock (SELECT … FOR UPDATE SKIP LOCKED).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: PipelineService,
  ) {}

  onModuleInit() {
    const ms = Number(process.env.SCHEDULER_TICK_MS ?? 30_000);
    if (process.env.SCHEDULER_ENABLED === 'false' || !(ms > 0)) return;
    this.timer = setInterval(() => void this.tick(), ms);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Sets (or, with null, switches off) the schedule; the first scheduled run is one interval from now. */
  async setSchedule(caseId: string, everyMinutes: number | null, now = new Date()) {
    const exists = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`case ${caseId} not found`);
    return this.prisma.case.update({
      where: { id: caseId },
      data: { scheduleEveryMin: everyMinutes, nextRunAt: everyMinutes === null ? null : new Date(now.getTime() + everyMinutes * 60_000) },
      select: { id: true, scheduleEveryMin: true, nextRunAt: true },
    });
  }

  /**
   * Runs every case whose time has come, with the sources and chain mode of its latest run.
   * A tick that starts while another is still running does nothing. Returns the ids of the cases that were run.
   */
  async tick(now = new Date()): Promise<string[]> {
    if (this.ticking) return [];
    this.ticking = true;
    const started: string[] = [];
    try {
      const due = await this.prisma.case.findMany({
        where: { scheduleEveryMin: { not: null }, nextRunAt: { lte: now } },
        select: { id: true, scheduleEveryMin: true, runs: { orderBy: { startedAt: 'desc' }, take: 1, select: { paramsJson: true } } },
      });
      for (const c of due) {
        // Book the next slot first: a run that fails is tried again at the next slot, not on every tick.
        await this.prisma.case.update({ where: { id: c.id }, data: { nextRunAt: new Date(now.getTime() + c.scheduleEveryMin! * 60_000) } });
        const last = (c.runs[0]?.paramsJson ?? {}) as { connectors?: string[]; chain?: string };
        try {
          await this.pipeline.run(c.id, { connectors: last.connectors, chain: isChainMode(last.chain) ? last.chain : undefined, trigger: 'scheduled' });
          started.push(c.id);
        } catch (e) {
          this.log.warn(`scheduled run of case ${c.id} failed: ${(e as Error).message}`); // the FAILED run row says it too
        }
      }
    } catch (e) {
      this.log.warn(`scheduler tick failed: ${(e as Error).message}`);
    } finally {
      this.ticking = false;
    }
    return started;
  }
}
