import type { Band } from '@/api/types';

export const BAND_ORDER: Band[] = ['VERY_HIGH', 'PROBABLE', 'MEDIUM', 'LOW', 'EXCLUDED'];

// Class names are written out in full so Tailwind can see them.
export const BAND_STYLE: Record<Band, { text: string; tint: string; border: string; bar: string; hex: string }> = {
  VERY_HIGH: { text: 'text-band-very-high', tint: 'bg-band-very-high-tint', border: 'border-band-very-high', bar: 'bg-band-very-high', hex: '#1f6f4a' },
  PROBABLE: { text: 'text-band-probable', tint: 'bg-band-probable-tint', border: 'border-band-probable', bar: 'bg-band-probable', hex: '#4a6a1f' },
  MEDIUM: { text: 'text-band-medium', tint: 'bg-band-medium-tint', border: 'border-band-medium', bar: 'bg-band-medium', hex: '#8a5d0a' },
  LOW: { text: 'text-band-low', tint: 'bg-band-low-tint', border: 'border-band-low', bar: 'bg-band-low', hex: '#55637a' },
  EXCLUDED: { text: 'text-band-excluded', tint: 'bg-band-excluded-tint', border: 'border-band-excluded', bar: 'bg-band-excluded', hex: '#5f6978' },
};

/** Category colours of counterparties in the graph (attributed addresses use the band colour instead). */
export const CATEGORY_HEX: Record<string, string> = {
  UNHOSTED: '#2f5d8c',
  CEX_CUSTODIAL: '#6b4c8a',
  CEX_DEPOSIT: '#6b4c8a',
  CASP_KANTOR: '#b4531e',
  PAYMENT_GATEWAY: '#b4531e',
  CRYPTO_CARD: '#b4531e',
  DEX: '#2b7a78',
  CONTRACT: '#2b7a78',
  MIXER: '#8c1d2c',
  SANCTIONED: '#8c1d2c',
  CHARITY: '#3d7a4f',
  EXAMPLE_BURN: '#7a8494',
  UNKNOWN_SERVICE: '#7a8494',
};
