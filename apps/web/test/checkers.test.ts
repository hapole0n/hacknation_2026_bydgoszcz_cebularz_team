import { describe, expect, it } from 'vitest';
import type { ConnectorInfo } from '../src/api/types';
import { checkersFor } from '../src/lib/checkers';

const c = (id: string, identifiers: ConnectorInfo['identifiers'], missingKeys: ConnectorInfo['missingKeys'] = {}): ConnectorInfo => ({
  id,
  kind: 'web2',
  version: '1',
  policy: { tosUrl: '', method: 'official_api', rateLimitPerSec: 1, weightHint: 1 },
  identifiers,
  conditions: {},
  missingKeys,
});
const all = [c('sandbox', ['NICK', 'EMAIL', 'ADDRESS']), c('github', ['NICK', 'ADDRESS'], { ADDRESS: 'GITHUB_TOKEN' }), c('gravatar', ['EMAIL'])];

describe('checkersFor', () => {
  it('lists the sources that take the kind, the ticked ones, and the ones that will really run', () => {
    expect(checkersFor(all, 'NICK', ['sandbox']).working.map((x) => x.id)).toEqual(['sandbox']);
    expect(checkersFor(all, 'NICK', ['sandbox', 'github']).working.map((x) => x.id)).toEqual(['sandbox', 'github']);
    expect(checkersFor(all, 'EMAIL', ['gravatar']).can.map((x) => x.id)).toEqual(['sandbox', 'gravatar']);
  });

  it('nothing ticked takes the kind: empty, with the sources that could take it', () => {
    const r = checkersFor(all, 'EMAIL', ['github']);
    expect(r.working).toEqual([]);
    expect(r.can.map((x) => x.id)).toEqual(['sandbox', 'gravatar']);
  });

  it('a source whose key is missing is ticked but does not run', () => {
    const r = checkersFor(all, 'ADDRESS', ['github']);
    expect(r.on.map((x) => x.id)).toEqual(['github']);
    expect(r.working).toEqual([]);
  });
});
