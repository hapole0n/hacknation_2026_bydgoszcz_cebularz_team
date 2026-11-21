import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { PrismaService } from './prisma.service.js';
import { RulesService } from './rules.service.js';

@Module({ controllers: [HealthController], providers: [PrismaService, RulesService] })
export class AppModule {}
