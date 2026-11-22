import { describe, expect, it } from 'vitest';
import type { ChainDto, FlowEntry } from '../src/api/types';
import { recommendedActions } from '../src/lib/actions';

const flow = (o: Partial<FlowEntry>): FlowEntry => ({ time: '2026-10-05T10:00:00Z', tx: 'x', direction: 'out', counterparty: { address: 'T1' }, asset: 'USDT', amount: 1, valuePln: 4, valueEur: 1, tags: [], ...o });
const chainOf = (flows: FlowEntry[], unvalued = 0) => ({ flows, indicators: { totals: { unvalued } } }) as unknown as ChainDto;

describe('recommendedActions (the "Rekomendowane dalsze czynności" of the address card)', () => {
  it('asks the operator of a service the funds went to, names it, and lists the dates', () => {
    const a = recommendedActions(chainOf([flow({ counterparty: { address: 'K1', category: 'CASP_KANTOR', name: 'Kantor X' } }), flow({ time: '2026-10-20T10:00:00Z', counterparty: { address: 'K1', category: 'CASP_KANTOR', name: 'Kantor X' } })]), { monitored: false, lang: 'pl' });
    expect(a[0]).toMatchObject({ key: 'askOperator', params: { name: 'Kantor X', dates: '05.10.2026, 20.10.2026' } });
  });

  it('an unnamed service is asked about without a name; inflows from unknown senders are to be traced (many dates become a range)', () => {
    const inflows = Array.from({ length: 5 }, (_, i) => flow({ direction: 'in', time: `2026-10-0${i + 1}T10:00:00Z` }));
    const a = recommendedActions(chainOf([flow({ counterparty: { address: 'G', category: 'PAYMENT_GATEWAY' } }), ...inflows]), { monitored: true, lang: 'pl' });
    expect(a.map((x) => x.key)).toEqual(['askOperatorAny', 'traceInflows', 'monitoringOn', 'keepEvidence']);
    expect(a[1]!.params!.dates).toBe('01.10.2026 – 05.10.2026 (5 dni)');
  });

  it('without chain data only monitoring and keeping the evidence remain; unvalued transfers ask for a repeat', () => {
    expect(recommendedActions(undefined, { monitored: false, lang: 'pl' }).map((x) => x.key)).toEqual(['monitoring', 'keepEvidence']);
    expect(recommendedActions(chainOf([], 3), { monitored: false, lang: 'pl' }).map((x) => x.key)).toContain('repeatValuation');
  });
});
