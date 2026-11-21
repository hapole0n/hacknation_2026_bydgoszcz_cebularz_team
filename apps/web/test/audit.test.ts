import { describe, expect, it } from 'vitest';
import { auditStatus } from '../src/lib/audit';

describe('auditStatus', () => {
  it('marks blocked and failed requests, and HTTP errors, apart from normal ones', () => {
    expect([0, -1, 200, 304, 404, 500].map((s) => auditStatus(s).kind)).toEqual(['blocked', 'error', 'ok', 'ok', 'http', 'http']);
  });
});
