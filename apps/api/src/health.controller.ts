import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { RulesService } from './rules.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  @Get()
  async check() {
    const db = await this.prisma.$queryRaw`SELECT 1`.then(
      () => 'up' as const,
      () => 'down' as const,
    );
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      rulesVersion: this.rules.rules.version,
      time: new Date().toISOString(),
    };
  }
}
