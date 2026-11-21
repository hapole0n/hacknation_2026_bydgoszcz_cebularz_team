import { Module } from '@nestjs/common';
import { AiService } from './ai/ai.service.js';
import { ApiController } from './api.controller.js';
import { BtcMempoolAdapter } from './chains/btc-mempool.adapter.js';
import { ChainAnalysisService } from './chains/chain-analysis.service.js';
import { ChainRegistry } from './chains/chain.registry.js';
import { EvmEtherscanAdapter } from './chains/evm-etherscan.adapter.js';
import { FixtureChainAdapter } from './chains/fixture.adapter.js';
import { NbpService } from './chains/nbp.service.js';
import { TronGridAdapter } from './chains/tron-grid.adapter.js';
import { ConnectorRegistry } from './connectors/connector.registry.js';
import { EnsConnector } from './connectors/ens.connector.js';
import { GithubConnector } from './connectors/github.connector.js';
import { GravatarConnector } from './connectors/gravatar.connector.js';
import { TelegramConnector } from './connectors/telegram.connector.js';
import { SandboxConnector } from './connectors/sandbox.connector.js';
import { SandboxWorld } from './connectors/sandbox-world.js';
import { WaybackConnector } from './connectors/wayback.connector.js';
import { EgressClient, EgressConfig } from './egress/egress.client.js';
import { HealthController } from './health.controller.js';
import { LabelService } from './labels/label.service.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { PrismaService } from './prisma.service.js';
import { ReportService } from './report/report.service.js';
import { SchedulerService } from './schedule/scheduler.service.js';
import { RulesService } from './rules.service.js';

@Module({
  controllers: [HealthController, ApiController],
  providers: [
    PrismaService,
    RulesService,
    ReportService,
    LabelService,
    AiService,
    EgressConfig,
    EgressClient,
    SandboxWorld,
    SandboxConnector,
    GithubConnector,
    WaybackConnector,
    GravatarConnector,
    EnsConnector,
    TelegramConnector,
    ConnectorRegistry,
    FixtureChainAdapter,
    BtcMempoolAdapter,
    EvmEtherscanAdapter,
    TronGridAdapter,
    ChainRegistry,
    NbpService,
    ChainAnalysisService,
    PipelineService,
    SchedulerService,
  ],
})
export class AppModule {}
