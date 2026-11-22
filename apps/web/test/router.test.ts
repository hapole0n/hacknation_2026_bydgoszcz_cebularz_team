import { describe, expect, it } from 'vitest';
import { addressPath, matchPath } from '../src/router';

describe('matchPath', () => {
  it('knows every screen', () => {
    expect(matchPath('/')).toEqual({ page: 'new' });
    expect(matchPath('/cases/new')).toEqual({ page: 'new' });
    expect(matchPath('/cases')).toEqual({ page: 'cases' });
    expect(matchPath('/cases/abc')).toEqual({ page: 'case', id: 'abc' });
    expect(matchPath('/audit')).toEqual({ page: 'audit' });
    expect(matchPath('/notifications')).toEqual({ page: 'notifications' });
    expect(matchPath('/runs/abc')).toEqual({ page: 'run', id: 'abc' });
    expect(matchPath('/runs/abc/graph')).toEqual({ page: 'graph', id: 'abc' });
    expect(matchPath('/runs/abc/report')).toEqual({ page: 'report', id: 'abc' });
    expect(matchPath('/runs/abc/other')).toEqual({ page: 'notFound' });
  });

  it('the address card carries the run, the network and the address (also an ENS name)', () => {
    const p = addressPath('r1', 'ETH', '0x28C6c06298d514Db089934071355E5743bf21d60');
    expect(matchPath(p)).toEqual({ page: 'address', id: 'r1', chain: 'ETH', address: '0x28C6c06298d514Db089934071355E5743bf21d60' });
    expect(matchPath(addressPath('r1', 'ETH', 'jtestowy.eth'))).toMatchObject({ page: 'address', address: 'jtestowy.eth' });
  });
});
