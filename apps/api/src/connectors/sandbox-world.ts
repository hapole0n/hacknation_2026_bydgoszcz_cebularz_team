import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';

export const SANDBOX_VERSIONS = [1, 2] as const;
export type SandboxVersion = (typeof SANDBOX_VERSIONS)[number];
export const isSandboxVersion = (v: unknown): v is SandboxVersion => (SANDBOX_VERSIONS as readonly unknown[]).includes(v);

const KEY = 'sandbox.version';

/**
 * Which "version of the world" the synthetic mini-internet shows. Version 2 = the demo button "symuluj zmianę": the personal
 * site of the persona shows another (synthetic) address. Stored in the database so it survives a restart; tests replace it
 * with an in-memory subclass, so they never touch shared state.
 */
@Injectable()
export class SandboxWorld {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SandboxVersion> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    return isSandboxVersion(row?.value) ? row.value : 1;
  }

  async set(version: SandboxVersion): Promise<SandboxVersion> {
    await this.prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: version }, update: { value: version } });
    return version;
  }
}
