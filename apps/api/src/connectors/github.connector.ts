import { Injectable } from '@nestjs/common';
import { EgressClient, type EgressResponse } from '../egress/egress.client.js';
import type { IdentifierType } from '@kropka/core';
import { identKey, sha256Hex, type ConnectorPolicy, type EvidenceDraft, type SearchInput, type SourceConnector } from './connector.js';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const MAX_NAME_CANDIDATES = 3;

interface GhUser {
  id: number;
  login: string;
  html_url: string;
  name?: string | null;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  email?: string | null;
  updated_at?: string;
}

/**
 * GitHub, official REST API (public data only).
 *  - login / nick:   /users/{login} + the profile README (repo {login}/{login})
 *  - name:           /search/users?q=fullname:"…" (top candidates, then as above)
 *  - address:        /search/code?q=<address> — GitHub requires a token for code search, so only with GITHUB_TOKEN
 * Live use belongs on synthetic personas or public institutional examples only (see CLAUDE.md).
 */
@Injectable()
export class GithubConnector implements SourceConnector {
  readonly id = 'github';
  readonly kind = 'web2' as const;
  readonly version = '1.0.0';
  readonly policy: ConnectorPolicy = {
    tosUrl: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
    method: 'official_api',
    rateLimitPerSec: 1,
    weightHint: 1,
  };
  readonly identifiers = ['NICK', 'SOCIAL_LOGIN', 'NAME', 'ADDRESS'] as const;

  constructor(private readonly egress: EgressClient) {}

  /** GitHub code search (address lookup) answers only to a logged-in caller. */
  missingKey = (type: IdentifierType) => (type === 'ADDRESS' && !process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : undefined);

  async search(input: SearchInput): Promise<EvidenceDraft[]> {
    const token = process.env.GITHUB_TOKEN;
    const ctx = { connectorId: this.id, caseId: input.caseId, runId: input.runId };
    const headers = (accept = 'application/vnd.github+json'): Record<string, string> => ({
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
    const get = (url: string, accept?: string) => this.egress.get(url, { ...ctx, headers: headers(accept) });
    const json = <T>(r: EgressResponse): T | undefined => (r.ok ? (JSON.parse(r.text) as T) : undefined);

    /** login → the identifiers that led to it */
    const logins = new Map<string, string[]>();
    const addLogin = (login: string, via: string) => logins.set(login, [...(logins.get(login) ?? []), via]);
    for (const i of input.identifiers) if (i.type === 'NICK' || i.type === 'SOCIAL_LOGIN') addLogin(i.normalized, identKey(i));
    for (const i of input.identifiers.filter((x) => x.type === 'NAME')) {
      const q = encodeURIComponent(`fullname:"${i.normalized}"`);
      const found = json<{ items: { login: string }[] }>(await get(`${API}/search/users?q=${q}&per_page=${MAX_NAME_CANDIDATES}`));
      for (const u of found?.items ?? []) addLogin(u.login.toLowerCase(), identKey(i));
    }

    const out: EvidenceDraft[] = [];
    for (const [login, via] of logins) {
      const res = await get(`${API}/users/${encodeURIComponent(login)}`);
      const user = json<GhUser>(res);
      if (!user) continue; // 404: no such account
      out.push({
        connectorId: this.id,
        url: user.html_url,
        resourceId: `github:user:${user.id}`,
        via,
        fetchedAt: new Date(),
        sha256: sha256Hex(res.text),
        text: [user.login, user.name, user.bio, user.company, user.location, user.blog, user.email].filter(Boolean).join('\n'),
        platform: 'github.com',
        origin: 'OWN_PROFILE',
        author: { handle: user.login, name: user.name ?? undefined },
        publishedAt: user.updated_at,
        title: `GitHub profile ${user.login}`,
      });

      const readme = await get(`${RAW}/${encodeURIComponent(user.login)}/${encodeURIComponent(user.login)}/HEAD/README.md`);
      if (readme.ok) {
        out.push({
          connectorId: this.id,
          url: `https://github.com/${user.login}/${user.login}`,
          resourceId: `github:readme:${user.login}`,
          via,
          fetchedAt: new Date(),
          sha256: sha256Hex(readme.text),
          text: readme.text,
          platform: 'github.com',
          origin: 'OWN_PROFILE',
          author: { handle: user.login, name: user.name ?? undefined },
          publishedAt: user.updated_at,
          title: `GitHub profile README ${user.login}`,
        });
      }
    }

    if (token) {
      for (const i of input.identifiers.filter((x) => x.type === 'ADDRESS')) {
        const res = await get(`${API}/search/code?q=${encodeURIComponent(i.normalized)}&per_page=10`, 'application/vnd.github.text-match+json');
        const hits = json<{ items: { html_url: string; path: string; repository: { full_name: string; owner: { login: string } }; text_matches?: { fragment: string }[] }[] }>(res);
        for (const hit of hits?.items ?? []) {
          out.push({
            connectorId: this.id,
            url: hit.html_url,
            resourceId: `github:code:${hit.repository.full_name}:${hit.path}`,
            via: [identKey(i)],
            fetchedAt: new Date(),
            sha256: sha256Hex(JSON.stringify(hit)),
            text: (hit.text_matches ?? []).map((m) => m.fragment).join('\n') || hit.path,
            platform: 'github.com',
            origin: 'PUBLIC',
            author: { handle: hit.repository.owner.login },
            title: `${hit.repository.full_name}/${hit.path}`,
          });
        }
      }
    }
    return out;
  }
}
