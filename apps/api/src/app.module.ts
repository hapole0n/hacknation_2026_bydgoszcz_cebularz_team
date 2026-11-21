import { Module } from '@nestjs/common';
import { ApiController } from './api.controller.js';
import { ConnectorRegistry } from './connectors/connector.registry.js';
import { GithubConnector } from './connectors/github.connector.js';
import { SandboxConnector } from './connectors/sandbox.connector.js';
import { EgressClient, EgressConfig } from './egress/egress.client.js';
import { HealthController } from './health.controller.js';
import { LabelService } from './labels/label.service.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { PrismaService } from './prisma.service.js';
import { RulesService } from './rules.service.js';

@Module({
  controllers: [HealthController, ApiController],
  providers: [
    PrismaService,
    RulesService,
    LabelService,
    EgressConfig,
    EgressClient,
    SandboxConnector,
    GithubConnector,
    ConnectorRegistry,
    PipelineService,
  ],
})
export class AppModule {}
