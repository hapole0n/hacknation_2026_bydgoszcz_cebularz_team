import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health.controller.js';
import type { PrismaService } from '../src/prisma.service.js';

const withDb = (query: () => Promise<unknown>) =>
  new HealthController({ $queryRaw: query } as unknown as PrismaService);

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    expect(await withDb(async () => [{ '?column?': 1 }]).check()).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('reports degraded (not a crash) when the database is down', async () => {
    const res = await withDb(async () => {
      throw new Error('ECONNREFUSED');
    }).check();
    expect(res).toMatchObject({ status: 'degraded', db: 'down' });
  });
});
