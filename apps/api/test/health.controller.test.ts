import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { HealthController } from '../src/health.controller.js';
import type { PrismaService } from '../src/prisma.service.js';
import { RulesService } from '../src/rules.service.js';

const rules = new RulesService(); // real config/scoring-rules.v1.yaml, parsed by @kropka/core

const withDb = (query: () => Promise<unknown>) => new HealthController({ $queryRaw: query } as unknown as PrismaService, rules);

describe('GET /api/health', () => {
  it('reports ok and the loaded rules version when the database answers', async () => {
    expect(await withDb(async () => [{ '?column?': 1 }]).check()).toMatchObject({ status: 'ok', db: 'up', rulesVersion: '1.1.0' });
  });

  it('reports degraded (not a crash) when the database is down', async () => {
    const res = await withDb(async () => {
      throw new Error('ECONNREFUSED');
    }).check();
    expect(res).toMatchObject({ status: 'degraded', db: 'down' });
  });
});

describe('RulesService', () => {
  it('loads the YAML through @kropka/core', () => {
    expect(rules.rules.base.OFFICIAL_PROFILE.score).toBe(85);
  });

  it('fails fast on a missing rules file', () => {
    const prev = process.env.SCORING_RULES_FILE;
    process.env.SCORING_RULES_FILE = 'config/does-not-exist.yaml';
    try {
      expect(() => new RulesService()).toThrow(/ENOENT/);
    } finally {
      if (prev === undefined) delete process.env.SCORING_RULES_FILE;
      else process.env.SCORING_RULES_FILE = prev;
    }
  });
});
