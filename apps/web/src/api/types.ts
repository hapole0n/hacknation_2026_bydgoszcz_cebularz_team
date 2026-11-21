import type { AddressCategory, BreakdownEntry, Chain, FlowEntry, Indicators, Localized, ScoreResult } from '@olcys/core';

export type { AddressCategory, BreakdownEntry, Chain, FlowEntry, Indicators, Localized, ScoreResult };

export const IDENTIFIER_TYPES = ['NAME', 'NICK', 'MESSENGER', 'SOCIAL_LOGIN', 'EMAIL', 'ADDRESS'] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];
export type Band = 'VERY_HIGH' | 'PROBABLE' | 'MEDIUM' | 'LOW' | 'EXCLUDED';
export type ChainMode = 'fixture' | 'live' | 'off';
export type RunStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

export interface CaseListItem {
  id: string;
  title: string;
  createdAt: string;
  createdBy: string;
  identifiers: { type: IdentifierType; value: string }[];
  _count: { runs: number };
  runs: { id: string; status: RunStatus; startedAt: string }[];
}

export interface CaseDetail {
  id: string;
  title: string;
  createdAt: string;
  createdBy: string;
  identifiers: { id: string; type: IdentifierType; value: string; normalized: string }[];
  runs: { id: string; status: RunStatus; startedAt: string; finishedAt: string | null; rulesVersion: string }[];
}

export interface ConnectorInfo {
  id: string;
  kind: string;
  version: string;
  policy: { tosUrl: string; method: 'official_api' | 'public_page' | 'synthetic'; rateLimitPerSec: number; weightHint: number };
}

export interface ChainAdapterInfo {
  id: string;
  live: boolean;
  available: boolean;
  reason: string | null;
}

export interface LabelInfo {
  name: string | null;
  category: AddressCategory;
  source: 'label' | 'heuristic';
  sourceUrl?: string | null;
  note?: string | null;
}

export interface AddressDto {
  chain: Chain;
  address: string;
  category: AddressCategory;
  labels: LabelInfo[];
  isContract: boolean | null;
}

export type Decision = 'CONFIRMED' | 'REJECTED';

export interface LinkDto {
  id: string;
  runId: string;
  identifierId: string;
  score: number;
  band: Band;
  breakdownJson: BreakdownEntry[];
  hintsJson: Localized[];
  excludedReason: string | null;
  analystDecision: Decision | null;
  analystNote: string | null;
  analystName: string | null;
  decidedAt: string | null;
  identifier: { id: string; type: IdentifierType; value: string };
  address: AddressDto;
}

export interface EvidenceDto {
  id: string;
  connectorId: string;
  url: string | null;
  resourceId: string | null;
  fetchedAt: string;
  sha256: string;
  snippet: string;
  archiveUrl: string | null;
  sourceType: string;
  metaJson: {
    platform: string;
    origin: string;
    author: { handle?: string; name?: string } | null;
    publishedAt: string | null;
    title: string | null;
    snapshotOf: string | null;
    round: 1 | 2 | 3;
  };
}

export interface TraceDto {
  id: string;
  evidenceId: string;
  chain: string;
  address: string;
  contextType: string;
  contextSnippet: string;
  position: number;
}

export interface ChainDto {
  address: { chain: Chain; address: string; category: AddressCategory };
  provider: string;
  fetchedAt: string;
  indicators: Indicators;
  flows: FlowEntry[];
}

export interface Identity {
  key: string;
  platform: string;
  handle: string | null;
  name: string | null;
  relation: 'PUBLISHER' | 'SAME_NICK_OTHER_PLATFORM';
  evidenceIds: string[];
  urls: string[];
  targetAddress: string | null;
  score: ScoreResult | null;
  otherAddresses: { chain: string; address: string; category: string; excluded: boolean; evidenceIds: string[] }[];
}

export interface RunSummary {
  stats: { evidence: number; traces: number; links: number; chainSnapshots: number; identities: number };
  connectorErrors: { connector: string; message: string }[];
  chainNotes: { address: string; note: string }[];
  chainWarnings: { address: string; warnings: string[] }[];
  identities: Identity[];
  error?: string;
}

export interface RunResults {
  run: {
    id: string;
    caseId: string;
    status: RunStatus;
    startedAt: string;
    finishedAt: string | null;
    rulesVersion: string;
    appVersion: string;
    paramsJson: { connectors: string[]; asOf: string; chain: ChainMode };
    summaryJson: RunSummary | null;
  };
  links: LinkDto[];
  evidence: EvidenceDto[];
  traces: TraceDto[];
  chain: ChainDto[];
}

export interface CaseInput {
  title: string;
  identifiers: { type: IdentifierType; value: string }[];
}
