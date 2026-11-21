import { Injectable } from '@nestjs/common';
import { toChecksumAddress } from '@kropka/core';
import { EgressClient } from '../egress/egress.client.js';
import { NoteError } from '../notes.js';
import { identKey, sha256Hex, type ConnectorPolicy, type EvidenceDraft, type SearchInput, type SourceConnector } from './connector.js';

const LIVE_BASE = 'https://api.gravatar.com';

/** RFC 2606 / 6761 reserved names: an e-mail on one of them cannot belong to a real person, so it is a synthetic subject. */
export const isReservedEmailDomain = (email: string) => /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i.test(email.split('@').pop() ?? '');

interface GravatarProfile {
  display_name?: string;
  profile_url?: string;
  description?: string;
  location?: string;
  job_title?: string;
  company?: string;
  verified_accounts?: { service_label?: string; service_type?: string; url?: string }[];
  payments?: { crypto_wallets?: { label?: string; address?: string }[] };
}

/**
 * Gravatar API v3 (official): e-mail → SHA-256 of the normalised address → public profile (name, verified accounts) and,
 * only with GRAVATAR_API_KEY, the crypto wallets the owner published. Without a key the profile is read but the wallets are
 * skipped, and the analyst is told. A synthetic e-mail (reserved domain) is answered by the sandbox's own Gravatar, never by
 * the real service.
 */
@Injectable()
export class GravatarConnector implements SourceConnector {
  readonly id = 'gravatar';
  readonly kind = 'web2' as const;
  readonly version = '1.0.0';
  readonly policy: ConnectorPolicy = { tosUrl: 'https://docs.gravatar.com/', method: 'official_api', rateLimitPerSec: 1, weightHint: 1 };
  readonly identifiers = ['EMAIL'] as const;

  constructor(private readonly egress: EgressClient) {}

  async search(input: SearchInput): Promise<EvidenceDraft[]> {
    const key = process.env.GRAVATAR_API_KEY;
    const sandbox = (process.env.SANDBOX_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, '');
    const out: EvidenceDraft[] = [];

    for (const email of input.identifiers.filter((i) => i.type === 'EMAIL')) {
      const synthetic = isReservedEmailDomain(email.normalized);
      const hash = sha256Hex(email.normalized);
      const url = `${synthetic ? `${sandbox}/gravatar` : LIVE_BASE}/v3/profiles/${hash}`;
      const res = await this.egress.get(url, { connectorId: this.id, caseId: input.caseId, runId: input.runId, headers: key && !synthetic ? { Authorization: `Bearer ${key}` } : {} });
      if (res.status === 404) continue; // no Gravatar profile for this e-mail
      if (!res.ok) throw new NoteError({ code: 'PROVIDER_HTTP', params: { provider: 'Gravatar', status: res.status } }, `Gravatar HTTP ${res.status}`);

      const p = JSON.parse(res.text) as GravatarProfile;
      const wallets = synthetic || key ? (p.payments?.crypto_wallets ?? []) : [];
      if (!synthetic && !key) input.notify?.({ code: 'GRAVATAR_WALLETS_SKIPPED', params: { key: 'GRAVATAR_API_KEY' } });

      const text = [
        `Gravatar: ${p.display_name ?? ''}`.trim(),
        `E-mail: ${email.value}`, // the profile was looked up by the hash of exactly this address
        p.description,
        [p.job_title, p.company, p.location].filter(Boolean).join(', '),
        ...(p.verified_accounts ?? []).map((a) => `${a.service_label ?? a.service_type ?? 'konto'}: ${a.url ?? ''}`),
        ...wallets.filter((w) => w.address).map((w) => `${w.label ?? 'wallet'}: ${/^0x[0-9a-f]{40}$/i.test(w.address!) ? toChecksumAddress(w.address!.slice(2)) : w.address}`),
      ]
        .filter(Boolean)
        .join('\n');
      out.push({
        connectorId: this.id,
        url: synthetic ? url : (p.profile_url ?? url),
        resourceId: `gravatar:${hash}`,
        via: [identKey(email)],
        fetchedAt: new Date(),
        sha256: sha256Hex(res.text),
        text,
        platform: 'gravatar.com',
        origin: 'OWN_PROFILE',
        author: p.display_name ? { name: p.display_name } : undefined,
        title: `Gravatar — ${p.display_name ?? hash.slice(0, 8)}`,
      });
    }
    return out;
  }
}
