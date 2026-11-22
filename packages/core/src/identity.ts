import { parseAddress } from './extract/validate.js';
import type { IdentityRuleId } from './types.js';

export const IDENTIFIER_TYPES = ['NAME', 'NICK', 'MESSENGER', 'SOCIAL_LOGIN', 'EMAIL', 'ADDRESS'] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export interface IdentifierRef {
  type: IdentifierType;
  /** Output of normalizeIdentifier. */
  normalized: string;
}

const HANDLE_TYPES: readonly IdentifierType[] = ['NICK', 'SOCIAL_LOGIN', 'MESSENGER'];

/** Canonical form used for matching and storage. Throws RangeError on input that cannot be an identifier of that type. */
export function normalizeIdentifier(type: IdentifierType, value: string): string {
  const v = value.trim();
  const bad = (why: string): never => {
    throw new RangeError(`${type}: ${why}`);
  };
  switch (type) {
    case 'EMAIL': {
      const email = v.toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : bad('not an e-mail address');
    }
    case 'NICK':
    case 'SOCIAL_LOGIN':
    case 'MESSENGER': {
      const handle = v.replace(/^(?:https?:\/\/)?(?:t\.me\/)?@?/i, '').toLowerCase();
      return /^[\p{L}\p{N}_.-]{2,64}$/u.test(handle) ? handle : bad('expected 2–64 letters, digits, "_", "." or "-"');
    }
    case 'NAME': {
      const name = v.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
      return name.length >= 3 ? name : bad('too short');
    }
    case 'ADDRESS': {
      const p = parseAddress(v);
      return p.ok ? p.address : bad(`invalid address (${p.reason})`);
    }
  }
}

/**
 * Guesses the kind of identifier from its text (the "one field" of the new-case form): an address (valid or not: the checksum error is
 * reported when it is normalised), an e-mail, a messenger handle (`@name`, `t.me/name`), a name (contains a space) or else a nick.
 * A social-network login looks like a nick, so it is never guessed: the analyst picks it in the advanced settings.
 */
export function detectIdentifierType(text: string): IdentifierType {
  const v = text.trim();
  if (parseAddress(v).ok || /^(0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[0-9a-zA-Z]{20,80}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(v)) return 'ADDRESS';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'EMAIL';
  if (/^(@|(?:https?:\/\/)?t\.me\/)/i.test(v)) return 'MESSENGER';
  if (/\s/.test(v)) return 'NAME';
  return 'NICK';
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Token-boundary search: "jtestowy" is not found in "jtestowy_pl", "jtestowy.example.org" or "x@jtestowy.pl". */
export function findIdentifierInText(identifier: IdentifierRef, text: string): boolean {
  const t = text.toLowerCase();
  const v = identifier.normalized.toLowerCase();
  let re: RegExp;
  switch (identifier.type) {
    case 'EMAIL':
      re = new RegExp(`(?<![\\w.+-])${escapeRe(v)}(?![\\w-]|\\.\\w)`);
      break;
    case 'NAME':
      re = new RegExp(`(?<![\\p{L}\\d])${escapeRe(v).replace(/ /g, '\\s+')}(?![\\p{L}\\d])`, 'u');
      break;
    case 'ADDRESS':
      return t.includes(v);
    default: // handles
      re = new RegExp(`(?:(?<![\\w.-])@|(?<![\\w.@-]))${escapeRe(v)}(?![\\w-]|\\.\\w)`);
  }
  return re.test(t);
}

/** "jan_kowalski", "jan.kowalski" and "JanKowalski" squash to the same string. */
export const nickSquash = (s: string) => s.toLowerCase().replace(/[._-]/g, '');

export interface EvidenceSignals {
  text: string;
  /** Account that published the page / post on its platform, when the connector knows it. */
  authorHandle?: string;
  authorName?: string;
}

export interface IdentityMatch {
  /** The identifier occurs in the evidence at all (author or mention). */
  matched: boolean;
  /** Identity modifiers of the scoring rules that apply to this identifier ↔ evidence pair. */
  rules: IdentityRuleId[];
}

const NONE: IdentityMatch = { matched: false, rules: [] };

/**
 * How does `identifier` relate to this evidence?
 *  - e-mail present                                   → IDENT_EMAIL_EXACT
 *  - messenger handle present (a declared contact)    → IDENT_EXACT_SAME_PLATFORM
 *  - nick / login equal to the author's handle:
 *      corroborated by another case identifier in the same evidence → IDENT_EXACT_SAME_PLATFORM
 *      handle only (could be another person on another platform)    → IDENT_NICK_OTHER_PLATFORM
 *  - nick / login equal to the author's handle up to separators/case → IDENT_NICK_VARIANT
 *  - nick merely mentioned by someone else            → matched, no modifier
 *  - name                                             → IDENT_NAME_ONLY
 */
export function evaluateIdentity(identifier: IdentifierRef, evidence: EvidenceSignals, caseIdentifiers: IdentifierRef[]): IdentityMatch {
  const author = evidence.authorHandle ? normalizeIdentifier('NICK', evidence.authorHandle) : undefined;
  const present = (id: IdentifierRef) =>
    findIdentifierInText(id, evidence.text) ||
    (HANDLE_TYPES.includes(id.type) && author === id.normalized) ||
    (id.type === 'NAME' && evidence.authorName !== undefined && normalizeIdentifier('NAME', evidence.authorName) === id.normalized);

  switch (identifier.type) {
    case 'ADDRESS':
      return NONE; // an address identifier is the object of the search, not a person to link to
    case 'EMAIL':
      return present(identifier) ? { matched: true, rules: ['IDENT_EMAIL_EXACT'] } : NONE;
    case 'NAME':
      return present(identifier) ? { matched: true, rules: ['IDENT_NAME_ONLY'] } : NONE;
    case 'MESSENGER':
      return present(identifier) ? { matched: true, rules: ['IDENT_EXACT_SAME_PLATFORM'] } : NONE;
    default: {
      // NICK / SOCIAL_LOGIN
      if (author === identifier.normalized) {
        const corroborated = caseIdentifiers.some((o) => o.type !== 'ADDRESS' && o.normalized !== identifier.normalized && present(o));
        return { matched: true, rules: [corroborated ? 'IDENT_EXACT_SAME_PLATFORM' : 'IDENT_NICK_OTHER_PLATFORM'] };
      }
      if (author && nickSquash(author) === nickSquash(identifier.normalized)) return { matched: true, rules: ['IDENT_NICK_VARIANT'] };
      return findIdentifierInText(identifier, evidence.text) ? { matched: true, rules: [] } : NONE;
    }
  }
}

/**
 * Number of distinct identities that publish the same address. Authors whose handle equals one of the case's
 * own handles are one identity (the subject); every other (platform, handle) is one more. Feeds ADDRESS_MULTI_IDENTITY.
 */
export function countClaimants(authors: { platform: string; handle?: string }[], caseIdentifiers: IdentifierRef[]): number {
  const own = new Set(caseIdentifiers.filter((i) => HANDLE_TYPES.includes(i.type)).map((i) => i.normalized));
  const others = new Set<string>();
  let subject = false;
  for (const a of authors) {
    if (!a.handle) continue;
    const h = normalizeIdentifier('NICK', a.handle);
    if (own.has(h)) subject = true;
    else others.add(`${a.platform}|${h}`);
  }
  return others.size + (subject ? 1 : 0);
}
