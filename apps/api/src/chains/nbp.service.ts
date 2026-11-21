import { Injectable } from '@nestjs/common';
import { previousRate, warsawDate, type FxRates } from '@olcys/core';
import { EgressClient } from '../egress/egress.client.js';
import type { AdapterCtx } from './chain-adapter.js';

export class NbpUnavailableError extends Error {}

type Code = 'USD' | 'EUR';
interface Rate {
  date: string;
  mid: number;
}

const DAY = 86_400_000;
const RETRIES = 4;
const RETRY_MS = 400;
const CHUNK_DAYS = 90; // the NBP API refuses ranges longer than 93 days
const LOOKBACK_DAYS = 10; // longer than any run of weekends + holidays
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/**
 * NBP table A mid rates for the PIT valuation: the rate of the last business day BEFORE the transaction day
 * (art. 11a PIT). Published rates never change, so they are cached for the life of the process.
 */
@Injectable()
export class NbpService {
  private readonly rates = new Map<Code, Map<string, number>>([['USD', new Map()], ['EUR', new Map()]]);
  private readonly covered: Record<Code, { from: string; to: string }[]> = { USD: [], EUR: [] };

  constructor(private readonly egress: EgressClient) {}

  /** Rates (USD/PLN and EUR/PLN) for each transaction instant; one range request per currency covers a whole history. */
  async fxFor(times: string[], ctx: AdapterCtx = {}): Promise<Map<string, FxRates>> {
    const days = [...new Set(times.map(warsawDate))].sort();
    const out = new Map<string, FxRates>();
    if (days.length === 0) return out;
    await Promise.all((['USD', 'EUR'] as const).map((code) => this.ensure(code, shift(days[0]!, -LOOKBACK_DAYS), shift(days.at(-1)!, -1), ctx)));
    for (const t of times) {
      const day = warsawDate(t);
      const usd = this.pick('USD', day);
      const eur = this.pick('EUR', day);
      out.set(t, { usdPln: usd.mid, eurPln: eur.mid, usdDate: usd.date, eurDate: eur.date });
    }
    return out;
  }

  private pick(code: Code, day: string): Rate {
    const list = [...this.rates.get(code)!].map(([date, mid]) => ({ date, mid })).sort((a, b) => a.date.localeCompare(b.date));
    const r = previousRate(list, day);
    if (!r) throw new NbpUnavailableError(`no NBP ${code} rate before ${day}`);
    return r;
  }

  private async ensure(code: Code, from: string, to: string, ctx: AdapterCtx) {
    if (this.covered[code].some((c) => c.from <= from && c.to >= to)) return;
    const base = (process.env.NBP_API_BASE ?? 'https://api.nbp.pl/api').replace(/\/$/, '');
    for (let start = from; start <= to; start = shift(start, CHUNK_DAYS + 1)) {
      const end = shift(start, CHUNK_DAYS) < to ? shift(start, CHUNK_DAYS) : to;
      const url = `${base}/exchangerates/rates/a/${code.toLowerCase()}/${start}/${end}/?format=json`;
      let res = await this.egress.get(url, { connectorId: 'nbp', ...ctx });
      // api.nbp.pl answers a sporadic 5xx; a short retry keeps PLN valuation from silently dropping out.
      for (let attempt = 1; res.status >= 500 && attempt < RETRIES; attempt++) {
        await new Promise((r) => setTimeout(r, RETRY_MS * attempt));
        res = await this.egress.get(url, { connectorId: 'nbp', ...ctx });
      }
      if (res.status === 404) continue; // no quotation in that range (holidays only)
      if (!res.ok) throw new NbpUnavailableError(`NBP HTTP ${res.status}`);
      for (const r of JSON.parse(res.text).rates as { effectiveDate: string; mid: number }[]) this.rates.get(code)!.set(r.effectiveDate, r.mid);
    }
    this.covered[code].push({ from, to });
  }
}
