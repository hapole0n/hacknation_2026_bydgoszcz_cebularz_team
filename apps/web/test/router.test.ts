import { describe, expect, it } from 'vitest';
import { matchPath } from '../src/router';

describe('matchPath', () => {
  it('knows the report page of a run', () => {
    expect(matchPath('/runs/abc/report')).toEqual({ page: 'report', id: 'abc' });
    expect(matchPath('/runs/abc')).toEqual({ page: 'run', id: 'abc' });
    expect(matchPath('/runs/abc/other')).toEqual({ page: 'notFound' });
  });
});
