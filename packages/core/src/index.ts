// Pure domain logic (no I/O): extraction, classification, scoring, indicators, diff — added from P1.
export const CHAINS = ['BTC', 'ETH', 'TRON'] as const;
export type Chain = (typeof CHAINS)[number];

export const isChain = (value: string): value is Chain => (CHAINS as readonly string[]).includes(value);
