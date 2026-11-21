import { Injectable } from '@nestjs/common';
import {
  analyseHistory,
  detectCexDeposit,
  looksLikeService,
  normAddr,
  sameAddress,
  valueTransfer,
  type AddressCategory,
  type Chain,
  type CounterpartyInfo,
  type FlowEntry,
  type Indicators,
} from '@kropka/core';
import { LabelService } from '../labels/label.service.js';
import { noteOf, type Note } from '../notes.js';
import type { AdapterCtx } from './chain-adapter.js';
import { ChainRegistry, type ChainMode } from './chain.registry.js';
import { NbpService } from './nbp.service.js';

/** How many unlabelled recipients of the subject's outflows get their own history fetched (deposit-address detection). */
export const MAX_COUNTERPARTY_LOOKUPS = 5;

export interface ClassifiedCounterparty {
  chain: Chain;
  address: string;
  category: AddressCategory;
  /** Proper name from a label list; heuristics have none (the UI shows the translated category instead). */
  name?: string;
  source: 'label' | 'heuristic';
}

export interface ChainAnalysis {
  chain: Chain;
  address: string;
  provider: string;
  fetchedAt: string;
  truncated: boolean;
  isContract: boolean | null;
  /** UNHOSTED unless bytecode or behaviour says it is a contract / deposit address / service. */
  category: AddressCategory;
  /** Why the category is not UNHOSTED. */
  basis?: string;
  everUsed: boolean;
  transferTimes: string[];
  indicators: Indicators;
  flows: FlowEntry[];
  counterparties: ClassifiedCounterparty[];
  warnings: Note[];
}

@Injectable()
export class ChainAnalysisService {
  constructor(
    private readonly registry: ChainRegistry,
    private readonly nbp: NbpService,
    private readonly labels: LabelService,
  ) {}

  /**
   * On-chain step for one address: history → classification (bytecode, deposit sweep, service behaviour) →
   * NBP valuation → indicators and chronology. Returns `note` instead when no adapter has data.
   */
  async analyse(input: { mode: ChainMode; chain: Chain; address: string; adAddresses: ReadonlySet<string>; ctx: AdapterCtx }): Promise<{ analysis?: ChainAnalysis; notes?: Note[] }> {
    const { mode, chain, address, ctx } = input;
    const { history, notes } = await this.registry.history(mode, chain, address, ctx);
    if (!history) return { notes };
    const warnings: Note[] = [];

    const labelCategory = (a: string) => this.labels.lookup(chain, a)?.category;
    const classified = new Map<string, ClassifiedCounterparty>();
    const categoryOf = (a: string): CounterpartyInfo => {
      const hit = classified.get(normAddr(a));
      if (hit) return { category: hit.category, name: hit.name };
      const label = this.labels.lookup(chain, a);
      return label ? { category: label.category, name: label.name } : {};
    };

    // Labelled counterparties.
    const others = history.transfers.filter((t) => !t.failed).map((t) => (sameAddress(t.from, address) ? t.to : t.from));
    for (const a of new Set(others.map(normAddr))) {
      const label = this.labels.lookup(chain, a);
      if (label) classified.set(a, { chain, address: label.address, category: label.category, name: label.name, source: 'label' });
    }

    // Unlabelled recipients of outflows: is it an exchange deposit address, a contract, a service?
    const recipients = new Map<string, { address: string; n: number }>();
    for (const t of history.transfers) {
      if (t.failed || !sameAddress(t.from, address) || classified.has(normAddr(t.to))) continue;
      const r = recipients.get(normAddr(t.to)) ?? { address: t.to, n: 0 };
      r.n++;
      recipients.set(normAddr(t.to), r);
    }
    for (const r of [...recipients.values()].sort((a, b) => b.n - a.n).slice(0, MAX_COUNTERPARTY_LOOKUPS)) {
      const { history: h2 } = await this.registry.history(mode, chain, r.address, ctx);
      if (!h2) continue;
      const found: { category: AddressCategory } | undefined = h2.isContract
        ? { category: 'CONTRACT' }
        : detectCexDeposit(r.address, h2.transfers, labelCategory).isDeposit
          ? { category: 'CEX_DEPOSIT' }
          : looksLikeService(r.address, h2.transfers)
            ? { category: 'UNKNOWN_SERVICE' }
            : undefined;
      if (found) classified.set(normAddr(r.address), { chain, address: r.address, ...found, source: 'heuristic' });
    }

    // The subject itself.
    let category: AddressCategory = 'UNHOSTED';
    let basis: string | undefined;
    if (history.isContract) [category, basis] = ['CONTRACT', 'bytecode is not 0x'];
    else if (detectCexDeposit(address, history.transfers, (a) => categoryOf(a).category).isDeposit) [category, basis] = ['CEX_DEPOSIT', 'only forwards received funds to a labelled exchange wallet'];
    else if (looksLikeService(address, history.transfers)) [category, basis] = ['UNKNOWN_SERVICE', 'many distinct one-off counterparties'];

    // PLN / EUR valuation from NBP (last business day before each transaction).
    const times = history.transfers.map((t) => t.time);
    let fx: Awaited<ReturnType<NbpService['fxFor']>> | undefined;
    try {
      fx = await this.nbp.fxFor(times, ctx);
    } catch (e) {
      warnings.push(noteOf(e)); // PLN valuation unavailable
    }
    const valued = history.transfers.map((t) => valueTransfer(t, fx?.get(t.time)));
    const { indicators, flows } = analyseHistory({ chain, address, transfers: valued, categoryOf, adAddresses: input.adAddresses });
    if (history.truncated) warnings.push({ code: 'HISTORY_TRUNCATED' });
    if (indicators.totals.unvalued > 0) warnings.push({ code: 'UNVALUED_TRANSFERS', params: { count: indicators.totals.unvalued } });

    return {
      analysis: {
        chain,
        address,
        provider: history.provider,
        fetchedAt: history.fetchedAt,
        truncated: history.truncated ?? false,
        isContract: history.isContract ?? null,
        category,
        basis,
        everUsed: history.transfers.some((t) => !t.failed),
        transferTimes: history.transfers.filter((t) => !t.failed).map((t) => t.time),
        indicators,
        flows,
        counterparties: [...classified.values()],
        warnings,
      },
    };
  }
}
