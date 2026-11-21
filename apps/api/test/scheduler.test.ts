import { afterAll, describe, expect, it } from 'vitest';
import { parseScheduleBody } from '../src/api.controller.js';
import { SchedulerService } from '../src/schedule/scheduler.service.js';
import { makeApp } from './harness.js';

/** Monitoring (PLAN 3.8): the schedule is stored in the database and a "restarted" scheduler picks it up. Needs the local Postgres. */
const { prisma, pipeline, scheduler, api } = makeApp();
const MIN = 60_000;
const caseIds: string[] = [];

afterAll(async () => {
  for (const id of caseIds) {
    await prisma.case.delete({ where: { id } });
    await prisma.auditLog.deleteMany({ where: { caseId: id } });
  }
  await prisma.$disconnect();
});

describe('monitoring: schedule + tick', () => {
  it('accepts only 15 / 60 / 1440 minutes or null', () => {
    for (const ok of [15, 60, 1440, null]) expect(parseScheduleBody({ everyMinutes: ok })).toBe(ok);
    for (const bad of [{}, { everyMinutes: 7 }, { everyMinutes: '15' }, null, []]) expect(() => parseScheduleBody(bad)).toThrow(/everyMinutes/);
  });

  it('stores the schedule, runs a due case with the options of its last run, books the next slot, survives a restart', async () => {
    const created = await api.createCase({ title: 'Monitoring test', identifiers: [{ type: 'NICK', value: 'jtestowy' }] });
    caseIds.push(created.id);
    await pipeline.run(created.id, { connectors: ['sandbox'], chain: 'off' }); // the "last run" whose options are repeated

    const t0 = new Date('2026-11-21T12:00:00Z');
    const set = await scheduler.setSchedule(created.id, 15, t0);
    expect(set.scheduleEveryMin).toBe(15);
    expect(set.nextRunAt).toEqual(new Date(t0.getTime() + 15 * MIN));

    // a new instance = a restarted process: everything it needs is in the database
    const restarted = new SchedulerService(prisma, pipeline);
    expect(await restarted.tick(new Date(t0.getTime() + 14 * MIN))).toEqual([]); // not due yet
    expect(await restarted.tick(new Date(t0.getTime() + 16 * MIN))).toEqual([created.id]);

    const runs = await prisma.run.findMany({ where: { caseId: created.id }, orderBy: { startedAt: 'asc' } });
    expect(runs.map((r) => r.trigger)).toEqual(['manual', 'scheduled']);
    expect(runs[1]!.paramsJson).toMatchObject({ connectors: ['sandbox'], chain: 'off' });
    expect(runs[1]!.status).toBe('DONE');
    const after = await prisma.case.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.nextRunAt).toEqual(new Date(t0.getTime() + 31 * MIN)); // booked from the tick time

    expect(await restarted.tick(new Date(t0.getTime() + 17 * MIN))).toEqual([]); // nothing is due twice
  });

  it('switching the schedule off clears the due time; a tick never runs an unscheduled case; an unknown case is a 404', async () => {
    const id = caseIds[0]!;
    const off = await scheduler.setSchedule(id, null);
    expect(off).toMatchObject({ scheduleEveryMin: null, nextRunAt: null });
    expect(await scheduler.tick(new Date('2030-01-01T00:00:00Z'))).not.toContain(id);
    await expect(scheduler.setSchedule('00000000-0000-0000-0000-000000000000', 15)).rejects.toThrow(/not found/);
  });

  it('a failing scheduled run does not stop the tick and is retried at the next slot, not on every tick', async () => {
    const created = await api.createCase({ title: 'Monitoring failing', identifiers: [{ type: 'NICK', value: 'jtestowy' }] });
    caseIds.push(created.id);
    await scheduler.setSchedule(created.id, 60, new Date('2026-11-21T12:00:00Z'));
    // the last run asks for a connector that does not exist, so the scheduled run is rejected before it starts
    await prisma.run.create({ data: { caseId: created.id, status: 'DONE', rulesVersion: 'x', appVersion: 'x', paramsJson: { connectors: ['nope'] } } });
    const due = new Date('2026-11-21T13:30:00Z');
    expect(await scheduler.tick(due)).toEqual([]);
    const c = await prisma.case.findUniqueOrThrow({ where: { id: created.id } });
    expect(c.nextRunAt).toEqual(new Date(due.getTime() + 60 * MIN));
  });
});
