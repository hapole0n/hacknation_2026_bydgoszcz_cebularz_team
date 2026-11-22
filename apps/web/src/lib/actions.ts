import type { ChainDto } from '@/api/types';
import { formatDay } from '@/lib/format';

export interface Action {
  /** i18n key under `address.actions`. */
  key: 'askOperator' | 'askOperatorAny' | 'traceInflows' | 'monitoring' | 'monitoringOn' | 'repeatValuation' | 'keepEvidence';
  params?: Record<string, string | number>;
}

const SERVICE_KINDS = ['CEX_CUSTODIAL', 'CEX_DEPOSIT', 'CASP_KANTOR', 'PAYMENT_GATEWAY', 'CRYPTO_CARD'];

const unique = <T,>(xs: T[]) => [...new Set(xs)];
/** A few dates are listed; many are a range with their count. */
const dates = (iso: string[], lang: string) => {
  const days = unique([...iso].sort().map((i) => formatDay(i, lang)));
  return days.length <= 3 ? days.join(', ') : `${days[0]} – ${days[days.length - 1]} (${days.length}${lang === 'en' ? ' days' : ' dni'})`;
};

/**
 * What an analyst would do next with this address (the "Rekomendowane dalsze czynności" of the address card): ask the operator of an
 * exchange / exchange service for the customer data, trace the inflows from unknown senders, keep the address under monitoring.
 */
export function recommendedActions(chain: ChainDto | undefined, opts: { monitored: boolean; lang: string }): Action[] {
  const out: Action[] = [];
  if (chain) {
    const toServices = chain.flows.filter((f) => f.direction === 'out' && f.counterparty.category && SERVICE_KINDS.includes(f.counterparty.category));
    if (toServices.length > 0) {
      const names = unique(toServices.map((f) => f.counterparty.name).filter((n): n is string => !!n));
      out.push({ key: names.length > 0 ? 'askOperator' : 'askOperatorAny', params: { name: names.join(', '), dates: dates(toServices.map((f) => f.time), opts.lang) } });
    }
    const unknownIn = chain.flows.filter((f) => f.direction === 'in' && !f.counterparty.category);
    if (unknownIn.length > 0) out.push({ key: 'traceInflows', params: { dates: dates(unknownIn.map((f) => f.time), opts.lang) } });
    if (chain.indicators.totals.unvalued > 0) out.push({ key: 'repeatValuation' });
  }
  out.push({ key: opts.monitored ? 'monitoringOn' : 'monitoring' });
  out.push({ key: 'keepEvidence' });
  return out;
}
