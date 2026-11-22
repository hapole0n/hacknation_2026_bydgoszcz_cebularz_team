import type { Band } from '@/api/types';

export const BAND_ORDER: Band[] = ['VERY_HIGH', 'PROBABLE', 'MEDIUM', 'LOW', 'EXCLUDED'];

/** The score range of each band (config/scoring-rules.v1.yaml). */
export const BAND_RANGE: Record<Band, string> = { VERY_HIGH: '80–100', PROBABLE: '60–79', MEDIUM: '40–59', LOW: '10–39', EXCLUDED: '0' };

/** Colours of the link graph: the desktop palette only (navy, ink, shadow); alert is for exclusions and transfers to cash-out services. */
export const GRAPH_COLOR = { navy: '#1c2f7a', ink: '#2a2a2a', shadow: '#6e6e6e', alert: '#8a2b0e', face: '#c3c3c3', paper: '#ffffff', rule: '#9a9a9a' } as const;
