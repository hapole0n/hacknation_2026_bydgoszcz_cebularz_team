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
