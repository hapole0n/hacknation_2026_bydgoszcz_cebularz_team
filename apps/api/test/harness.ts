import { ApiController } from '../src/api.controller.js';
import { BtcMempoolAdapter } from '../src/chains/btc-mempool.adapter.js';
import { ChainAnalysisService } from '../src/chains/chain-analysis.service.js';
import { ChainRegistry } from '../src/chains/chain.registry.js';
import { EvmEtherscanAdapter } from '../src/chains/evm-etherscan.adapter.js';
import { FixtureChainAdapter } from '../src/chains/fixture.adapter.js';
import { NbpService } from '../src/chains/nbp.service.js';
import { TronGridAdapter } from '../src/chains/tron-grid.adapter.js';
import { ConnectorRegistry } from '../src/connectors/connector.registry.js';
import { GithubConnector } from '../src/connectors/github.connector.js';
import { SandboxConnector } from '../src/connectors/sandbox.connector.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { LabelService } from '../src/labels/label.service.js';
import { PipelineService } from '../src/pipeline/pipeline.service.js';
import { PrismaService } from '../src/prisma.service.js';
import { ReportService } from '../src/report/report.service.js';
import { RulesService } from '../src/rules.service.js';
import { SchedulerService } from '../src/schedule/scheduler.service.js';
import { sandboxFetch, type FetchOptions } from './fixture-fetch.js';

/** The whole backend wired by hand like Nest does, on an offline `fetch` (sandbox from disk, synthetic NBP). Needs the local Postgres. */
export function makeApp(opts: FetchOptions = {}) {
  const prisma = new PrismaService();
  const cfg = new EgressConfig();
  const fetched = sandboxFetch(opts);
  cfg.fetchImpl = fetched;
  const egress = new EgressClient(prisma, cfg);
  const labels = new LabelService();
  const registry = new ConnectorRegistry(new SandboxConnector(egress), new GithubConnector(egress));
  const chains = new ChainRegistry(new FixtureChainAdapter(), new BtcMempoolAdapter(egress), new EvmEtherscanAdapter(egress), new TronGridAdapter(egress));
  const analysis = new ChainAnalysisService(chains, new NbpService(egress), labels);
  const pipeline = new PipelineService(prisma, new RulesService(), labels, registry, analysis);
  const reports = new ReportService(prisma, pipeline, registry);
  const scheduler = new SchedulerService(prisma, pipeline);
  const api = new ApiController(prisma, pipeline, registry, chains, reports, scheduler);
  return { prisma, cfg, fetched, egress, labels, registry, chains, analysis, pipeline, reports, scheduler, api };
}
