import { detectIdentifierType, normalizeIdentifier } from '@kropka/core';
import type { IdentifierType } from '@/api/types';

export interface ParsedIdentifier {
  /** The text as typed (trimmed). */
  value: string;
  /** The kind in use: the analyst's choice from the advanced settings, else the detected one. */
  type: IdentifierType;
  detected: IdentifierType;
  /** Set when the text cannot be an identifier of that kind (an address with a broken checksum, a too short name …). */
  error?: 'address' | 'format';
}

/** The "one field" of the new-case form: several identifiers separated by commas, semicolons or new lines; the kind of each is detected. */
export function parseIdentifiers(text: string, overrides: Partial<Record<string, IdentifierType>> = {}): ParsedIdentifier[] {
  const seen = new Set<string>();
  const out: ParsedIdentifier[] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const value = raw.trim();
    if (!value) continue;
    const detected = detectIdentifierType(value);
    const type = overrides[value] ?? detected;
    let error: ParsedIdentifier['error'];
    let key = `${type}:${value.toLowerCase()}`;
    try {
      key = `${type}:${normalizeIdentifier(type, value)}`;
    } catch {
      error = type === 'ADDRESS' ? 'address' : 'format';
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value, type, detected, error });
  }
  return out;
}

/** A case title when the analyst gives none: the first name, else the first identifier. */
export const deriveTitle = (ids: ParsedIdentifier[]): string => (ids.find((i) => i.type === 'NAME') ?? ids[0])?.value.slice(0, 200) ?? '';
