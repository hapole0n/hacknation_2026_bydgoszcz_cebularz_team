import { Injectable } from '@nestjs/common';
import { extractAddresses } from '@kropka/core';
import { EgressClient, type EgressResponse } from '../egress/egress.client.js';
import { decodeEntities, htmlToText, identKey, sha256Hex, type ConnectorPolicy, type EvidenceDraft, type SearchIdentifier, type SearchInput, type SourceConnector } from './connector.js';

const LIVE = 'https://t.me';
const MAX_POSTS = 20;
/** Telegram usernames are 5-32 characters of letters, digits and "_" (4 is tolerated). */
const HANDLE = /^[a-z0-9_]{4,32}$/i;

export interface TgProfile {
  name: string;
  description: string;
}
export interface TgPost {
  id: string;
  text: string;
  time?: string;
}

/** `t.me/<name>`: the public card (name, bio). null = no such account (the generic "Contact @name" page has no title block). */
export function parseTgProfile(html: string): TgProfile | null {
  const title = /<div class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const ogTitle = /<meta property="og:title" content="([^"]*)"/i.exec(html)?.[1] ?? '';
  const name = title ? htmlToText(title) : '';
  if (!name || /^Telegram: Contact/i.test(decodeEntities(ogTitle))) return null;
  const description = htmlToText(/<div class="tgme_page_description"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '');
  return { name, description };
}

/** `t.me/s/<channel>`: the public posts of the preview page (the latest ones, one page). */
export function parseTgPosts(html: string, channel: string): TgPost[] {
  const starts = [...html.matchAll(/data-post="([^"/]+)\/(\d+)"/g)].filter((m) => m[1]!.toLowerCase() === channel.toLowerCase());
  return starts.slice(0, MAX_POSTS).map((m, i) => {
    const chunk = html.slice(m.index, starts[i + 1]?.index);
    const text = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk)?.[1];
    return { id: m[2]!, text: text ? htmlToText(text) : '', time: /<time[^>]*datetime="([^"]+)"/i.exec(chunk)?.[1] };
  });
}

/**
 * Telegram public pages: the card `t.me/<name>` (name, bio) and the channel preview `t.me/s/<name>` (public posts). Only what a
 * visitor without an account sees; no login, no API, no private chats. Posts are kept only when they carry an address.
 *
 * Telegram's terms ("Content Licensing and AI Scraping", https://telegram.org/tos/content-licensing) restrict access to user content
 * to ordinary use of the platform, so live access is OFF unless TELEGRAM_LIVE=true is set deliberately; t.me/robots.txt is 404 (checked
 * 2026-11-21, no restriction expressed there). Synthetic names are answered by the sandbox (fixtures/sandbox-web/tme), never by t.me.
 */
@Injectable()
export class TelegramConnector implements SourceConnector {
  readonly id = 'telegram_public';
  readonly kind = 'web2' as const;
  readonly version = '1.0.0';
  readonly policy: ConnectorPolicy = { tosUrl: 'https://telegram.org/tos/content-licensing', method: 'public_page', rateLimitPerSec: 0.5, weightHint: 0.5 };
  readonly identifiers = ['MESSENGER'] as const;

  constructor(private readonly egress: EgressClient) {}

  accepts = (i: SearchIdentifier) => HANDLE.test(i.normalized);

  async search(input: SearchInput): Promise<EvidenceDraft[]> {
    const ctx = { connectorId: this.id, caseId: input.caseId, runId: input.runId };
    const sandbox = (process.env.SANDBOX_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, '');
    const quietGet = async (url: string): Promise<EgressResponse | undefined> => {
      try {
        const r = await this.egress.get(url, ctx);
        return r.ok ? r : undefined;
      } catch {
        return undefined; // no sandbox reachable: treated as "no fixture"
      }
    };
    const fetchPair = async (profile: string, posts: string) => ({ profile: { url: profile, res: await quietGet(profile) }, posts: { url: posts, res: await quietGet(posts) } });

    const out: EvidenceDraft[] = [];
    for (const i of input.identifiers.filter((x) => x.type === 'MESSENGER' && this.accepts(x))) {
      const h = i.normalized;
      let pages = await fetchPair(`${sandbox}/tme/${h}.html`, `${sandbox}/tme/s/${h}.html`);
      let live = false;
      if (!pages.profile.res && !pages.posts.res) {
        if (process.env.TELEGRAM_LIVE !== 'true') {
          input.skip?.(i, 'TELEGRAM_LIVE');
          continue;
        }
        pages = await fetchPair(`${LIVE}/${h}`, `${LIVE}/s/${h}`);
        live = true;
      }

      const card = pages.profile.res && parseTgProfile(pages.profile.res.text);
      if (card && pages.profile.res) {
        out.push({
          connectorId: this.id,
          url: pages.profile.url,
          resourceId: `telegram:profile:${h}`,
          fetchedAt: new Date(),
          sha256: sha256Hex(pages.profile.res.text),
          text: [card.name, `@${h}`, card.description].filter(Boolean).join('\n'),
          platform: 't.me',
          origin: 'OWN_PROFILE',
          author: { handle: h, name: card.name },
          title: `Telegram — ${card.name}`,
          via: [identKey(i)],
        });
      }
      if (pages.posts.res) {
        for (const p of parseTgPosts(pages.posts.res.text, h)) {
          if (extractAddresses(p.text).addresses.length === 0) continue;
          out.push({
            connectorId: this.id,
            url: live ? `${LIVE}/${h}/${p.id}` : `${pages.posts.url}#${p.id}`,
            resourceId: `telegram:post:${h}/${p.id}`,
            fetchedAt: new Date(),
            sha256: sha256Hex(p.text),
            text: p.text,
            platform: 't.me',
            origin: 'PUBLIC',
            author: { handle: h },
            publishedAt: p.time,
            title: `Telegram — ${h} #${p.id}`,
            via: [identKey(i)],
          });
        }
      }
    }
    return out;
  }
}
