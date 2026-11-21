import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { EvmEtherscanAdapter } from '../src/chains/evm-etherscan.adapter.js';
import { NbpService } from '../src/chains/nbp.service.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { LabelService } from '../src/labels/label.service.js';
import { PrismaService } from '../src/prisma.service.js';

/**
 * LIVE smoke test — the only test that touches the internet, and only when ETHERSCAN_API_KEY is in .env
 * (otherwise it is skipped, loudly in the report). It checks, against public institutional addresses:
 *   - eth_getCode of the Uniswap V2 router is bytecode (a contract) and of the Binance 14 hot wallet is "0x" (an EOA),
 *   - our label set calls Binance 14 an exchange (CEX_CUSTODIAL → EXCL_CEX),
 *   - NBP's real table A answers in the shape the valuation expects (EUR/PLN of 2026-11-04 was 4.4014),
 *   - every request went through EgressClient and left an AuditLog row (path only, no API key).
 * No private person is queried.
 */
const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const BINANCE_14 = '0x28C6c06298d514Db089934071355E5743bf21d60';
const marker = `live-smoke-${randomUUID()}`;

describe.skipIf(!process.env.ETHERSCAN_API_KEY)('live smoke (Etherscan + NBP, public institutional addresses)', () => {
  const prisma = new PrismaService();
  const egress = new EgressClient(prisma, new EgressConfig()); // real fetch, real allowlist, real rate limits
  const etherscan = new EvmEtherscanAdapter(egress);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { caseId: marker } });
    await prisma.$disconnect();
  });

  it('bytecode: the Uniswap V2 router is a contract, the Binance 14 hot wallet is not', async () => {
    const router = await etherscan.history('ETH', UNISWAP_V2_ROUTER, { caseId: marker });
    const hot = await etherscan.history('ETH', BINANCE_14, { caseId: marker });
    expect(router.isContract).toBe(true);
    expect(hot.isContract).toBe(false);
    expect(router.transfers.length).toBeGreaterThan(0); // a busy router: history is not empty
  }, 60_000);

  it('label: Binance 14 is an exchange, Uniswap router a DEX contract', () => {
    const labels = new LabelService();
    expect(labels.lookup('ETH', BINANCE_14)).toMatchObject({ category: 'CEX_CUSTODIAL', name: 'Binance 14 (hot wallet)' });
    expect(labels.lookup('ETH', UNISWAP_V2_ROUTER)).toMatchObject({ category: 'DEX', isContract: true });
  });

  it('NBP: the real EUR/PLN rate before 2026-11-05 is the one of 2026-11-04', async () => {
    const fx = await new NbpService(egress).fxFor(['2026-11-05T10:00:00Z'], { caseId: marker });
    expect(fx.get('2026-11-05T10:00:00Z')).toMatchObject({ eurDate: '2026-11-04', eurPln: 4.4014 });
  }, 30_000);

  it('every request is in the audit log: allowlisted hosts only, path without the key, nothing blocked', async () => {
    const rows = await prisma.auditLog.findMany({ where: { caseId: marker } });
    expect(rows.length).toBeGreaterThanOrEqual(7); // 2 × (txlist, tokentx, eth_getCode) + NBP
    expect(new Set(rows.map((r) => r.host))).toEqual(new Set(['api.etherscan.io', 'api.nbp.pl']));
    expect(rows.every((r) => r.status === 200)).toBe(true);
    expect(rows.filter((r) => r.host === 'api.etherscan.io').every((r) => r.path === '/v2/api' && r.connectorId === 'etherscan')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(process.env.ETHERSCAN_API_KEY!);
  });
});
