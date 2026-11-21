import type { Chain } from './chain.js';
import { addressKey, parseAddress } from './extract/validate.js';
import type { ExclusionId } from './types.js';

/** Address categories of the task annex (STEP 1), see PLAN §3.3. */
export const ADDRESS_CATEGORIES = [
  'UNHOSTED',
  'CEX_CUSTODIAL',
  'CEX_DEPOSIT',
  'CONTRACT',
  'DEX',
  'CASP_KANTOR',
  'PAYMENT_GATEWAY',
  'CRYPTO_CARD',
  'MIXER',
  'CHARITY',
  'SANCTIONED',
  'EXAMPLE_BURN',
  'UNKNOWN_SERVICE',
] as const;
export type AddressCategory = (typeof ADDRESS_CATEGORIES)[number];

/** One row of config/labels/*.json. */
export interface LabelEntry {
  chain: Chain;
  address: string;
  category: AddressCategory;
  name: string;
  isContract?: boolean;
  sourceUrl?: string;
  note?: string;
}

/** Which scoring exclusion a category triggers (undefined = the address may belong to a person). */
export function exclusionForCategory(category: AddressCategory): ExclusionId | undefined {
  switch (category) {
    case 'CEX_CUSTODIAL':
      return 'EXCL_CEX';
    case 'CEX_DEPOSIT':
      return 'EXCL_CUSTODIAL_DEPOSIT';
    case 'CONTRACT':
    case 'DEX':
      return 'EXCL_CONTRACT';
    case 'MIXER':
      return 'EXCL_MIXER';
    case 'CHARITY':
      return 'EXCL_CHARITY';
    case 'EXAMPLE_BURN':
      return 'EXCL_EXAMPLE';
    case 'CASP_KANTOR':
    case 'PAYMENT_GATEWAY':
    case 'CRYPTO_CARD':
    case 'UNKNOWN_SERVICE':
      return 'EXCL_SERVICE';
    case 'UNHOSTED':
    case 'SANCTIONED': // flagged for the report, but not a reason to reject attribution
      return undefined;
  }
}

/** Lookup key that ignores EVM / bech32 letter case. */
export function labelKey(chain: Chain, address: string): string {
  const p = parseAddress(address);
  return `${chain}:${p.ok ? addressKey(p.kind, p.address) : address}`;
}
