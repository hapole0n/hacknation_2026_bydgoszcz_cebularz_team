import { Injectable } from '@nestjs/common';
import { CONTEXT_TYPES, type ContextType } from '@kropka/core';
import { EgressClient } from '../egress/egress.client.js';
import { NoteError } from '../notes.js';

const SYSTEM =
  'You classify the context in which a cryptocurrency address appears in a short public text (Polish or English). ' +
  `Answer with exactly one word from this list and nothing else: ${CONTEXT_TYPES.join(', ')}. ` +
  'SALE = an advert selling or buying; P2P = peer-to-peer or cash exchange; DONATION = tips, support, donations; GIVEAWAY = giveaway or airdrop spam; ' +
  'SETTLEMENT = a payment or settlement; DISCUSSION = anything else (a forum chat, a mention).';

export interface AiSuggestion {
  contextType: ContextType;
  model: string;
}

/**
 * Optional LOCAL language model (PLAN 3.10) behind an OpenAI-compatible API (Ollama, llama.cpp, vLLM …).
 * Off unless AI_ENABLED=true; the model is whatever AI_MODEL / AI_BASE_URL say. It only SUGGESTS the type of context
 * when the keyword classifier found nothing; the suggestion is shown as "Sugestia AI" and never enters the score.
 * The request goes through EgressClient like any other, so the host must be on the allowlist (localhost / ollama are).
 */
@Injectable()
export class AiService {
  constructor(private readonly egress: EgressClient) {}

  enabled = () => process.env.AI_ENABLED === 'true';

  /** One of CONTEXT_TYPES, or null when the model answered anything else. Throws NoteError AI_UNAVAILABLE when it cannot be asked. */
  async suggestContext(snippet: string, ctx: { caseId?: string; runId?: string } = {}): Promise<AiSuggestion | null> {
    const model = process.env.AI_MODEL;
    if (!model) throw new NoteError({ code: 'AI_UNAVAILABLE', params: { detail: 'AI_MODEL' } }, 'AI_MODEL is not set');
    const base = (process.env.AI_BASE_URL ?? 'http://localhost:11434/v1').replace(/\/$/, '');
    try {
      const res = await this.egress.post(
        `${base}/chat/completions`,
        { model, temperature: 0, max_tokens: 8, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: snippet.slice(0, 600) }] },
        { connectorId: 'ai', ...ctx },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const answer = (JSON.parse(res.text) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
      const word = /[A-Za-z0-9]+/.exec(answer)?.[0]?.toUpperCase();
      const contextType = CONTEXT_TYPES.find((t) => t === word);
      return contextType ? { contextType, model } : null;
    } catch (e) {
      throw new NoteError({ code: 'AI_UNAVAILABLE', params: { detail: (e as Error).message } }, `AI unavailable: ${(e as Error).message}`);
    }
  }
}
