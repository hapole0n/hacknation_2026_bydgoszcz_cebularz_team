import { createHash } from 'node:crypto';
import type { IdentifierType, TraceOrigin } from '@kropka/core';
import type { Note } from '../notes.js';

export interface SearchIdentifier {
  id?: string;
  type: IdentifierType;
  value: string;
  normalized: string;
}

export interface SearchInput {
  identifiers: SearchIdentifier[];
  caseId?: string;
  runId?: string;
  /** For a note that is not a failure (e.g. "wallets skipped, no API key"): shown with the run, never fatal. */
  notify?: (note: Note) => void;
}

/** What a connector found: one public resource. The full text lives in memory only; the DB keeps a snippet + sha256. */
export interface EvidenceDraft {
  connectorId: string;
  url?: string;
  resourceId?: string;
  fetchedAt: Date;
  /** SHA-256 of the full fetched content. */
  sha256: string;
  text: string;
  /** Independent-origin key: service / registrable domain. Repeats of one platform are not independent confirmation. */
  platform: string;
  origin: TraceOrigin;
  /** Account that published the resource, when the platform shows it. */
  author?: { handle?: string; name?: string };
  /** ISO date the resource was published (or archived). */
  publishedAt?: string;
  title?: string;
  archiveUrl?: string;
  snapshotOf?: string;
  /** Which of the searched identifiers led to this resource (`identKey`); empty = all of them (the search log is built from it). */
  via?: string[];
}

/** Stable key of an identifier inside one search (`EvidenceDraft.via`). */
export const identKey = (i: { type: IdentifierType; normalized: string }) => `${i.type}:${i.normalized}`;

export interface ConnectorPolicy {
  /** Terms of service / acceptable-use page of the source. */
  tosUrl: string;
  method: 'official_api' | 'public_page' | 'synthetic';
  rateLimitPerSec: number;
  /** Relative trust placed in the source (shown to the analyst). */
  weightHint: number;
}

/** A page found by another source, handed to connectors that keep copies of pages (web archives). */
export interface ArchiveSource {
  url: string;
  platform: string;
  origin: TraceOrigin;
  author?: { handle?: string; name?: string };
  title?: string;
}

/** Plug-in interface for Web2 sources (PLAN §3.1). New sources implement this and register in ConnectorRegistry. */
export interface SourceConnector {
  readonly id: string;
  readonly kind: 'web2';
  readonly version: string;
  readonly policy: ConnectorPolicy;
  /** Kinds of identifier this source looks up (empty: it only works on pages other sources found). Shown in the new-case form and in the run's search log. */
  readonly identifiers: readonly IdentifierType[];
  /** Caveats shown next to the type in the new-case form (`form.conditions.<value>`), when `accepts` is narrower than the type. */
  readonly conditions?: Partial<Record<IdentifierType, string>>;
  /** Finer than the type: e.g. ENS takes a nick only when it is a `.eth` name. */
  accepts?(i: SearchIdentifier): boolean;
  /** The .env key this source needs to look up this kind of identifier, when it is not set: the lookup is skipped and the log says so. */
  missingKey?(type: IdentifierType): string | undefined;
  search(input: SearchInput): Promise<EvidenceDraft[]>;
  /** Optional: earlier copies of pages other sources found (web archives). Called with those pages after the first search round. */
  archive?(sources: ArchiveSource[], input: SearchInput): Promise<EvidenceDraft[]>;
}

export const sha256Hex = (text: string) => createHash('sha256').update(text).digest('hex');

/** Minimal HTML → text: drops scripts/styles, breaks lines at block elements, decodes common entities. */
export function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const body = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|article|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(`${title}\n${body}`)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
