import type { IdentifierType } from '@kropka/core';
import { PrismaService } from './prisma.service.js';

export interface NewCase {
  title: string;
  createdBy: string;
  retentionDays: number | null;
  /** "Numer postępowania / podstawa" typed in by the analyst. */
  basis: string | null;
  identifiers: { type: IdentifierType; value: string; normalized: string }[];
}

/** The year of the file reference is the year in Warsaw, whatever the server's zone is. */
export const warsawYear = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric' }).format(at);

/**
 * Creates a case with the next file reference of its year ("KR/2026/0031": running number within the year, never reused).
 * The number is read and the case inserted under one advisory lock, so cases created at the same moment get different numbers;
 * the unique index on `signature` is the safety net.
 */
export async function createCaseWithSignature(prisma: PrismaService, data: NewCase, now = new Date()) {
  const year = warsawYear(now);
  const { identifiers, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('case-signature'))`;
    const last = await tx.case.findFirst({ where: { signature: { startsWith: `KR/${year}/` } }, orderBy: { signature: 'desc' }, select: { signature: true } });
    const n = last ? Number(last.signature.split('/')[2]) + 1 : 1;
    return tx.case.create({ data: { ...rest, signature: `KR/${year}/${String(n).padStart(4, '0')}`, identifiers: { create: identifiers } }, include: { identifiers: true } });
  });
}

export interface RunResultSummary {
  /** Addresses assigned to a person, by the band of their best link. */
  bands: { VERY_HIGH: number; PROBABLE: number; MEDIUM: number; LOW: number };
  /** Addresses whose every link is an exclusion (exchange, contract, service …). */
  excluded: number;
  /** Addresses with a fiat cash-out signal. */
  cashOut: number;
}

/** The one-line result of a run for the case register: counted per address (not per identifier), best link wins. */
export function summarizeRun(links: { addressId: string; band: string; score: number; excludedReason: string | null }[], indicators: unknown[]): RunResultSummary {
  const best = new Map<string, { band: string; score: number; excluded: boolean }>();
  for (const l of links) {
    const prev = best.get(l.addressId);
    const excluded = !!l.excludedReason;
    if (!prev || (prev.excluded && !excluded) || (prev.excluded === excluded && l.score > prev.score)) best.set(l.addressId, { band: l.band, score: l.score, excluded });
  }
  const out: RunResultSummary = { bands: { VERY_HIGH: 0, PROBABLE: 0, MEDIUM: 0, LOW: 0 }, excluded: 0, cashOut: indicators.filter((i) => (i as { cashOut?: { detected?: boolean } }).cashOut?.detected).length };
  for (const b of best.values()) {
    if (b.excluded || b.band === 'EXCLUDED') out.excluded++;
    else if (b.band in out.bands) out.bands[b.band as keyof RunResultSummary['bands']]++;
  }
  return out;
}
