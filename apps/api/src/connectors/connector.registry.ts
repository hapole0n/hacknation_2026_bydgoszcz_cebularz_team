import { BadRequestException, Injectable } from '@nestjs/common';
import { EnsConnector } from './ens.connector.js';
import { GithubConnector } from './github.connector.js';
import { GravatarConnector } from './gravatar.connector.js';
import { SandboxConnector } from './sandbox.connector.js';
import { TelegramConnector } from './telegram.connector.js';
import { WaybackConnector } from './wayback.connector.js';
import type { SourceConnector } from './connector.js';

/** Live connectors are opt-in per run: by default only the synthetic sandbox is searched. */
export const DEFAULT_CONNECTORS = ['sandbox'];

@Injectable()
export class ConnectorRegistry {
  private readonly byId: Map<string, SourceConnector>;

  // New sources: implement SourceConnector and add it here.
  constructor(sandbox: SandboxConnector, github: GithubConnector, wayback: WaybackConnector, gravatar: GravatarConnector, ens: EnsConnector, telegram: TelegramConnector) {
    this.byId = new Map([sandbox, github, wayback, gravatar, ens, telegram].map((c) => [c.id, c]));
  }

  /** Plug-in point: add a source at runtime (it is then selectable by id like the built-in ones). */
  register(connector: SourceConnector): void {
    this.byId.set(connector.id, connector);
  }

  list(): SourceConnector[] {
    return [...this.byId.values()];
  }

  pick(ids: string[]): SourceConnector[] {
    return ids.map((id) => this.byId.get(id) ?? this.unknown(id));
  }

  private unknown(id: string): never {
    throw new BadRequestException(`unknown connector "${id}" (available: ${[...this.byId.keys()].join(', ')})`);
  }
}
