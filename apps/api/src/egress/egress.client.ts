import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { parse } from 'yaml';
import { NoteError } from '../notes.js';
import { repoPath } from '../paths.js';
import { PrismaService } from '../prisma.service.js';

export interface AllowedHost {
  host: string;
  purpose?: string;
  /** Requests per second to this host; omitted = unlimited (local hosts). */
  rateLimitPerSec?: number;
}

export class EgressBlockedError extends NoteError {}

export interface EgressRequest {
  connectorId: string;
  caseId?: string;
  runId?: string;
  headers?: Record<string, string>;
  /** Cache lifetime for this GET; 0 disables the cache. Default 5 min. */
  cacheTtlMs?: number;
}

export interface EgressResponse {
  status: number;
  ok: boolean;
  text: string;
  url: string;
  fromCache: boolean;
}

/** Allowlist + transport. Tests replace `fetchImpl`, so they never touch the network. */
@Injectable()
export class EgressConfig {
  allowlist: AllowedHost[];
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);
  userAgent = process.env.EGRESS_USER_AGENT ?? 'olcys-osint/0.1 (research prototype, HackNation 2026)';
  timeoutMs = 15_000;
  maxBytes = 2_000_000;

  constructor() {
    const doc = parse(readFileSync(repoPath(process.env.EGRESS_ALLOWLIST_FILE ?? 'config/egress-allowlist.yaml'), 'utf8'));
    this.allowlist = (doc?.hosts ?? []).map((h: AllowedHost) => ({ ...h, host: String(h.host).toLowerCase() }));
    if (this.allowlist.length === 0) throw new Error('egress allowlist is empty');
  }
}

const MAX_REDIRECTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The only way the backend talks to the outside world (PLAN §3.9): allowlisted hosts only, per-host rate limit,
 * in-memory GET cache, manual redirects (each hop re-checked), one AuditLog row per outbound request.
 */
@Injectable()
export class EgressClient {
  private readonly cache = new Map<string, { at: number; res: EgressResponse }>();
  private readonly nextSlot = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: EgressConfig,
  ) {}

  async get(url: string, req: EgressRequest): Promise<EgressResponse> {
    return this.send('GET', url, undefined, req);
  }

  /**
   * POST with a JSON body (JSON-RPC, a chat-completions call, TronGrid's `wallet/*`). Not cached unless the caller passes
   * `cacheTtlMs` (only for idempotent reads); redirects are not followed — a POST that is redirected is a misconfiguration.
   * The audit log keeps host + path only, never the body.
   */
  async post(url: string, json: unknown, req: EgressRequest): Promise<EgressResponse> {
    return this.send('POST', url, JSON.stringify(json), { ...req, cacheTtlMs: req.cacheTtlMs ?? 0 });
  }

  private async send(method: 'GET' | 'POST', url: string, body: string | undefined, req: EgressRequest): Promise<EgressResponse> {
    // shortcut: the cache is per process and keyed by URL (+ body) and presence of credentials; persist it if runs span restarts
    const ttl = req.cacheTtlMs ?? 300_000;
    const cacheKey = `${method}|${url}|${body ?? ''}|${req.headers?.Authorization ? 'auth' : ''}`;
    const hit = ttl > 0 ? this.cache.get(cacheKey) : undefined;
    if (hit && Date.now() - hit.at < ttl) return { ...hit.res, fromCache: true };

    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = await this.checkAllowed(current, req);
      await this.waitForSlot(u.hostname);
      const started = Date.now();
      let res: Response;
      try {
        res = await this.cfg.fetchImpl(current, {
          method,
          redirect: 'manual',
          headers: { 'User-Agent': this.cfg.userAgent, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...req.headers },
          body,
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
        });
      } catch (e) {
        await this.audit(req, u, -1, Date.now() - started); // -1 = network error / timeout
        throw e;
      }
      await this.audit(req, u, res.status, Date.now() - started);

      const location = res.headers.get('location');
      if (method === 'GET' && res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current).toString();
        continue;
      }
      const text = await res.text();
      if (text.length > this.cfg.maxBytes) throw new Error(`response from ${u.hostname} exceeds ${this.cfg.maxBytes} bytes`);
      const out: EgressResponse = { status: res.status, ok: res.ok, text, url: current, fromCache: false };
      if (ttl > 0 && res.status < 500) this.cache.set(cacheKey, { at: Date.now(), res: out });
      return out;
    }
    throw new Error(`too many redirects for ${url}`);
  }

  private async checkAllowed(target: string, req: EgressRequest): Promise<URL> {
    const u = new URL(target);
    const allowed = (u.protocol === 'http:' || u.protocol === 'https:') && this.cfg.allowlist.some((h) => h.host === u.hostname.toLowerCase());
    if (!allowed) {
      await this.audit(req, u, 0, 0); // 0 = blocked by the allowlist
      throw new EgressBlockedError({ code: 'EGRESS_BLOCKED', params: { host: u.hostname } }, `egress to ${u.protocol}//${u.hostname} is not in the allowlist`);
    }
    return u;
  }

  /** Reserves the next time slot for the host synchronously, so concurrent callers queue up in order. */
  private async waitForSlot(host: string) {
    const rate = this.cfg.allowlist.find((h) => h.host === host.toLowerCase())?.rateLimitPerSec;
    if (!rate) return;
    const now = Date.now();
    const at = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, at + 1000 / rate);
    if (at > now) await sleep(at - now);
  }

  private audit(req: EgressRequest, u: URL, status: number, durationMs: number) {
    // Path only: the query string may carry the searched identifier or a key.
    return this.prisma.auditLog.create({
      data: { caseId: req.caseId, runId: req.runId, connectorId: req.connectorId, host: u.hostname, path: u.pathname, status, durationMs },
    });
  }
}
