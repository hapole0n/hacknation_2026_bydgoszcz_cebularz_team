# PLAN.md — OŁCyŚ · working name "KROPKA"

## 0. Goal in one sentence
An OSINT workstation for KAS analysts: from at least one identifier (name + surname, forum nick, messenger ID, social login, e-mail, crypto address) it searches public sources, extracts and validates crypto addresses, links them to the subject with an **explainable Confidence Score**, rejects false attributions (exchanges, custodial wallets, smart contracts, mixers, charities, example addresses), analyses on-chain activity including **fiat cash-out signals — with a focus on USDT → cash via P2P offers and kantors**, and produces a reproducible Polish report. Analyses can run cyclically and are compared over time.

## 1. How we are scored → what we optimise
| Criterion | Weight | Our answer |
|---|---|---|
| Zgodność z wyzwaniem i scenariusz | 25% | One-click demo case walking all 7 mandatory stages; acceptance tests mirror the task's list |
| Wskaźnik Pewności i odrzucanie błędnych przypisań | 25% | Versioned YAML rules, per-rule breakdown with evidence, hard exclusions with reasons, hints "what would change the score" |
| Przejrzystość raportu i źródeł | 20% | Every statement tagged FAKT ŹRÓDŁOWY / WYNIK OBLICZEŃ / WNIOSEK DO WERYFIKACJI; URL or resource ID, timestamp, SHA-256, archive link |
| Pomysł i oryginalność | 15% | USDT→cash focus (kantors / P2P ads), relationship graph, PLN valuation (NBP, art. 11a PIT), AML thresholds, address-swap detection (Wayback), Gravatar/ENS bridges |
| Potencjał wdrożeniowy i architektura | 15% | docker-compose, no public cloud, local AI optional, egress allowlist + audit log, pluggable connectors and chains, Postgres, tests |

## 2. Mandatory demo scenario (must work end-to-end, all stages)
1. **Input** identifiers (e.g. nick `jtestowy` + e-mail `jan.testowy@example.org` + Telegram `@jtestowy_pl`).
2. **OSINT search** across connectors (sandbox mini-internet + real connectors where safe).
3. **Detect and verify** crypto addresses (format, checksum, chain, existence/activity on-chain).
4. **Compute the Confidence Score** with a full breakdown.
5. **Reject wrong attributions** (CEX/custodial, contract via bytecode, mixer, charity, example/burn) → 0% personal attribution, interaction recorded.
6. **Analyse on-chain indicators** (volume, swaps, stablecoins, CEX/P2P/kantor/gateway/card interactions, AML thresholds, PLN value, chronology).
7. **Present sources and the final result** (UI + graph + PDF report + JSON bundle).

## 3. Architecture
```
web (React, PL/EN) ──REST──> api (NestJS) ──> packages/core (pure TS: extract, classify, score, indicators, diff)
                                 ├──> PostgreSQL (Prisma)
                                 ├──> EgressClient (allowlist + rate limit + cache + audit log) ──> public APIs
                                 ├──> sandbox-web (synthetic mini-internet, local :8088)
                                 └──> (optional) Ollama — local LLM, OpenAI-compatible API
```
Pipeline of one **Run**:
Identifiers → expand (nick variants, e-mail SHA-256 for Gravatar, ENS) → `connectors.search()` → **Evidence** (url/resourceId, fetchedAt, sha256, snippet, archiveUrl) → **Extractor** (addresses + context) → **Classifier** (chain, validity, labels, isContract, behaviour) → **Linker** (identifier ↔ address traces) → **Scoring** (rules YAML) → **Chain analytics** (indicators, flows) → **Graph** → persist Run → **Diff** vs previous Run → notifications.

### 3.1 Web2 connectors — `SourceConnector { id; kind; policy; search(input): Evidence[] }`
`policy = { tosUrl, method: 'official_api' | 'public_page' | 'synthetic', rateLimit, weightHint }` — shown in UI and README.

| id | type | identifiers | notes |
|---|---|---|---|
| `sandbox` | synthetic | all | Mini-internet in `fixtures/sandbox-web`: GitHub-like profile, personal site, forum thread (PL), P2P ad "Sprzedam USDT za gotówkę", Telegram-like channel post, giveaway comments, e-mail footer (.eml), Instagram-like kantor ad "USDT ↔ gotówka", historical snapshots |
| `github` | real, REST API | nick, name, address | `/users/{nick}`, profile README repo `{nick}/{nick}`, bio/blog; `/search/users?q=fullname:"…"`; `/search/code?q=<address>` (token) |
| `gravatar` | real, API v3 (key) | e-mail | SHA-256 of normalised e-mail → `/v3/profiles/{hash}` → `payments.crypto_wallets`, verified accounts |
| `ens` | real, public RPC | address, `*.eth` | reverse name; text records `com.twitter`, `com.github`, `email`, `url` |
| `wayback` | real, CDX API | URL | snapshots of a profile URL → re-extract per snapshot → **address-swap detection** (optional criterion) |
| `telegram_public` | real, `t.me/s/<channel>` | handle | public channel preview only, low weight |

### 3.2 Address extraction and validation (`packages/core`)
- **BTC:** Base58Check P2PKH/P2SH (`1…`/`3…`), Bech32 (`bc1q…`), Bech32m (`bc1p…`) — validate checksums.
- **ETH/EVM:** `0x` + 40 hex; EIP-55 checksum when mixed case; ENS names `*.eth`.
- **TRON:** Base58Check, version byte 0x41 → starts with `T`, 34 chars.
- Detect-only, flag "nieprzejrzyste dla analizy": Monero (95/106 chars), Lightning (`lnbc…`, `user@domain` lud16).
- Normalisation: strip zero-width chars, join split lines, handle simple obfuscation ("0x 12ab…") — configurable.
- Context window ±200 chars; keywords → context type (sale, P2P, donation, giveaway, settlement, discussion).
- Reject: tx hashes (64 hex), addresses from `config/labels/examples.json` (documentation/tutorial/burn addresses).

### 3.3 Address categories (task annex, KROK 1)
`UNHOSTED` (target of attribution) · `CEX_CUSTODIAL` (exchange/custodian — exclude, record interaction) · `CEX_DEPOSIT` (per-user deposit address sweeping to an exchange — custodial, but a strong KYC lead) · `CONTRACT` (bytecode ≠ `0x`) · `DEX` · `CASP_KANTOR` (fiat on/off-ramp, OTC, kantor, crypto ATM) · `PAYMENT_GATEWAY` · `CRYPTO_CARD` · `MIXER` · `CHARITY` · `SANCTIONED` (flag) · `EXAMPLE_BURN` · `UNKNOWN_SERVICE` (behaviour: huge tx count / counterparties).
Label sources (`config/labels/*.json`, each with header source/license/date): subsets of eth-labels / etherscan-labels (MIT), stablecoin contracts (USDT on Ethereum and TRON, USDC), DEX routers, Tornado Cash contracts, OFAC SDN digital-currency addresses, official charity addresses, Polish CASPs/kantors if found (neutral naming, no promotion), example/burn addresses. Live checks: `eth_getCode` (Etherscan proxy), TRON contract check, behavioural heuristics. In production KAS plugs in a licensed label source — architecture allows it.

### 3.4 Confidence Score v1 (`config/scoring-rules.v1.yaml`)
`score = clamp(0..100, base(sourceType) + Σ modifiers)`; if any exclusion applies → **0** (personal attribution), interaction still recorded.
- **Base by source type** (annex KROK 2): `OFFICIAL_PROFILE` 85 · `SALE_AD` / `P2P_OFFER` / `EMAIL_FOOTER` / `MESSENGER_SETTLEMENT` 70 · `FORUM_DISCUSSION` 50 · `MASS_COMMENT` / `GIVEAWAY` 25.
- **Identity match:** exact identifier on its own platform +10 · exact e-mail +10 · nick variant −5 · same nick on another platform −10 · name only −20.
- **Synergy:** +15 if the same address appears in ≥2 **independent** origins (different service/domain) tied to the same identifier/phone. Repeats inside one service don't count.
- **On-chain consistency:** active around the trace date +5 · never used on-chain −10.
- **Recency:** trace older than 3 years −5.
- **Conflict:** same address attributed to ≥3 unrelated identities (copy-paste/scam) −20.
- **Exclusions → 0%:** `EXCL_CEX`, `EXCL_CUSTODIAL_DEPOSIT`, `EXCL_CONTRACT`, `EXCL_MIXER`, `EXCL_CHARITY`, `EXCL_EXAMPLE`.
- **Bands:** 80–100 bardzo wysokie · 60–79 prawdopodobne · 40–59 średnie (wymaga potwierdzenia) · 10–39 niskie / szum · 0 wykluczone.
Output per link: `score`, `band`, `rulesVersion`, `breakdown[{ruleId, delta, reasonPl, reasonEn, evidenceIds}]`, `hints[]` (e.g. "Drugie niezależne źródło podniosłoby wynik o 15 pp"). The analyst can confirm/reject a link (name + time stored, shown separately — never silently changes the computed score). Mixers: the report explains why they are 0% for attribution but their use is a risk indicator.

### 3.5 Chain analytics and cash-out indicators
Adapters: `BtcMempoolAdapter` (mempool.space), `EvmEtherscanAdapter` (Etherscan v2: txlist, tokentx, eth_getCode), `TronGridAdapter` (TronGrid v1: transactions, TRC-20 transfers), `FixtureChainAdapter` (synthetic histories).
Indicators per address: total in/out (native + PLN), first/last activity, tx count, labelled counterparties, swaps via DEX routers, stablecoin conversions (USDT/USDC), interactions with CEX / CEX deposit / CASP-kantor / payment gateway / crypto card / mixer, **USDT→cash pattern** (USDT sent to an address that appears in a "USDT za gotówkę" ad or is labelled kantor/P2P), optional peel/split patterns.
Thresholds (see research notes): ≥1 000 EUR (AML threshold for virtual-currency transactions), ≥10 000 EUR (cash occasional transaction), ≥15 000 EUR (large occasional transaction) — presented as analytical premises, not legal qualification.
PLN valuation: NBP table A mid rate from the **last business day before** the transaction date (art. 11a ustawy o PIT). Crypto→USD: stablecoins 1:1; other assets via CoinGecko (optional — first to cut).
Chronology: ordered list of key flows (date, from → to with labels, amount, PLN value, indicator tags).

### 3.6 Graph
Cytoscape.js: nodes = identifiers, evidence/sources, addresses (styled by category), counterparty entities; edges = `mentioned_in`, `linked(score)`, `transfer(amount)`. Excluded nodes dashed grey. Click → side panel with details and evidence.

### 3.7 Report (PL, EN optional)
1 Dane wejściowe i parametry wyszukiwania · 2 Źródła i ślady (FAKT ŹRÓDŁOWY) · 3 Powiązane adresy i Wskaźnik Pewności (WYNIK OBLICZEŃ + uzasadnienie) · 4 Odrzucone przypisania (powód) · 5 Aktywność w blockchainie i wskaźniki cash-out · 6 Chronologia przepływu środków · 7 Wnioski wymagające weryfikacji · 8 Rekomendowane dalsze czynności (np. zapytanie do giełdy X o dane KYC) · 9 Metadane i odtwarzalność (rules version, connector versions, timestamps, SHA-256 of evidence and of the report).
Formats: HTML view, PDF (print via Playwright or print CSS), JSON bundle. Readable for non-IT readers.

### 3.8 Cases, runs, monitoring, diff
Case (sprawa) → many Runs. Schedule per case (demo: every 1 min; default daily). Diff between runs: new/removed addresses, score changes, category changes, address swap on the same source (incl. Wayback snapshots). In-app notifications.

### 3.9 Security and compliance
`EgressClient`: allowlist, per-host rate limit, cache, User-Agent with contact, AuditLog row per request (time, case, connector, host, path without secrets, status, duration). UI page "Dziennik zapytań zewnętrznych". Data minimisation: store snippets ±200 chars + SHA-256 of full content + archive link, not full pages. Retention per case + "delete case". README section "Zgodność i bezpieczeństwo".

### 3.10 Local AI (optional, off by default)
`AiProvider` interface → OpenAI-compatible client (`AI_BASE_URL`, `AI_MODEL`). Used only as a context-classification fallback and for a plain-language summary draft marked "wygenerowane przez lokalny model — do weryfikacji". Target GPU: RTX 3060 Laptop 6 GB → small Polish-capable instruct model, Q4 (candidates: Bielik 4.5B, PLLuM 8B, Qwen 7B) — choose in P6.

## 4. Data model (Prisma, first cut)
- `Case(id, title, createdAt, createdBy, scheduleCron, retentionDays)`
- `Identifier(id, caseId, type[NAME|NICK|MESSENGER|SOCIAL_LOGIN|EMAIL|ADDRESS], value, normalized)`
- `Run(id, caseId, startedAt, finishedAt, status, rulesVersion, appVersion, paramsJson)`
- `Evidence(id, runId, connectorId, url, resourceId, fetchedAt, sha256, snippet, archiveUrl, sourceType, metaJson)`
- `Trace(id, runId, evidenceId, identifierId?, chain, address, contextType, contextSnippet, position)`
- `Address(id, chain, address, category, labelsJson, isContract, firstSeen, lastSeen, metaJson)` — unique (chain, address)
- `Link(id, runId, identifierId, addressId, score, band, breakdownJson, hintsJson, excludedReason?, analystDecision?, analystNote?, decidedAt?)`
- `ChainSnapshot(id, runId, addressId, indicatorsJson, flowsJson, fetchedAt, provider)`
- `RunDiff(id, caseId, fromRunId, toRunId, diffJson)`
- `Notification(id, caseId, runId, kind, message, readAt)`
- `AuditLog(id, at, caseId?, runId?, connectorId, host, path, status, durationMs)`
- `Report(id, runId, format, sha256, createdAt, path)`

## 5. Synthetic test data (`fixtures/`)
**Persona A — "Jan Testowy"** (nick `jtestowy`, e-mail `jan.testowy@example.org`, Telegram `@jtestowy_pl`):
- personal site (OFFICIAL_PROFILE) with ETH address A1 "Wsparcie projektu" → 85 (+10 exact) → capped
- GitHub-like profile README with A1 → independent source → synergy +15
- e-mail footer with A1 → independent source
- P2P ad "Sprzedam USDT za gotówkę, Lublin, kontakt @jtestowy_pl" with TRON address T1 → 70 (+10 exact handle)
- forum thread post with BTC address B1 → 50 (needs a second trace)
- giveaway comment spam with B2 → 25
- historical snapshot of the personal site with an old address A0 → address swap detected
- forum post quoting an exchange hot wallet and a DEX router → `EXCL_CEX` / `EXCL_CONTRACT` → 0, interaction recorded
- post quoting an official charity address → `EXCL_CHARITY`
- Instagram-like ad of kantor "USDT ↔ gotówka" with address K1 → K1 labelled `CASP_KANTOR` (synthetic label set)
**Persona B — trap:** same nick on another platform but a different person (other name/city) → low score, conflict rule.
**Synthetic chain histories** (`fixtures/chain/*.json`): A1 receives ETH → swaps to USDT via DEX router → sends USDT to a CEX deposit address; T1 receives many small USDT transfers → sends to kantor K1 → USDT→cash pattern; thresholds 1 000 / 10 000 / 15 000 EUR crossed at known dates.
**Live part of the demo:** only public institutional examples (exchange hot wallet, DEX router) for live exclusion and bytecode check. Optionally Oleh's own fresh, non-main Binance deposit address (with his consent) as a live CEX_DEPOSIT example — never in the mandatory test scenarios.
`fixtures/expected.json`: expected links, scores, bands and exclusions → used by acceptance tests.

## 6. Phases and timeline (Sat 21.11 → Sun 22.11, Europe/Warsaw)
| Phase | Time | Scope | Done when |
|---|---|---|---|
| P0 | 13:45–14:30 | Monorepo scaffold: pnpm workspaces (`apps/api`, `apps/web`, `packages/core`), docker-compose (db, sandbox, api, web), Prisma schema §4 + first migration, `GET /api/health`, web shell with PL/EN toggle, Vitest, LICENSES.md generator script, README skeleton | `docker compose up -d db` + `pnpm dev` work, tests green, pushed |
| P1 | 14:30–16:30 | `packages/core`: extraction + validation (BTC/ETH/TRON/ENS), context classifier, scoring engine reading YAML with breakdown + hints, unit tests incl. synthetic cases | tests green |
| P2 | 16:30–18:30 | Sandbox mini-internet + `sandbox` connector + `github` connector + EgressClient + pipeline (Case → Run → Evidence → Traces → Links) + persistence + REST endpoints | demo case runs via API |
| ★ | ~19:00 | **HackTribe entry** (task, team `cebularz`, project name, repo link, table **8f**) — deadline 20:00 | entry saved |
| P3 | 18:30–21:00 | Chain adapters (fixture, mempool.space, Etherscan, TronGrid) + labels + bytecode + exclusions + indicators + thresholds + NBP PLN | indicators in API output |
| P4 | 21:00–00:30 | Web UI: case form, run, results table with score cards and breakdown, excluded list, address detail with indicators and chronology, graph, PL/EN | full scenario clickable |
| P5 | 00:30–02:30 | Report HTML/PDF/JSON with FAKT/OBLICZENIE/WNIOSEK tags, metadata, hashes; audit log page | PDF downloadable |
| P6 | 02:30–04:30 | Monitoring (scheduled re-runs), diff view, notifications; Wayback + Gravatar + ENS connectors; optional local AI | diff visible |
| P7 | 04:30–07:00 | Acceptance tests (one per task bullet), polish, README (all required sections), LICENSES.md, screenshots | `/hn-submit` mostly ✅ |
| P8 | 07:00–10:00 | Video ≤3 min (PL voice), PDF ≤10 slides, title + description incl. search parameters; repo public | all files ready |
| ★ | 10:30 | **Submit** (hard deadline 11:00) | submitted |

**Cut order if late:** CoinGecko USD prices → Wayback → English UI → graph polish. **Never cut:** the 7 scenario stages, monitoring + diff, report, score breakdown.

## 7. Definition of done — task checklist
- [ ] ≥1 identifier of each type accepted (name, nick, messenger ID, social login, e-mail, address)
- [ ] automatic search of public sources; data only from public information
- [ ] addresses recognised, detected and extracted from text (BTC, ETH, TRON + ENS)
- [ ] links categorised; Confidence Score by our own algorithm; sources and premises shown
- [ ] information from different sources combined (synergy)
- [ ] fiat cash-out indicators (P2P, gateways, crypto cards, large stablecoin swaps, kantors)
- [ ] exchanges, custodial, contracts, institutional and similar addresses rejected
- [ ] selected blockchain activity patterns detected
- [ ] cyclic analyses, saved results, comparison of results
- [ ] each result stored with source, URL/resource ID, date and time, metadata for reproduction
- [ ] extensible: new sources, chains, analytic mechanisms (plugin interfaces)
- [ ] clear presentation; report readable for non-IT, facts vs computations vs conclusions
- [ ] optional: address swap over time
- [ ] formal: title + description incl. search parameters, PDF ≤10 slides, video ≤3 min in open repository, repo link
- [ ] technical: OSS licenses listed, TS/Node + React + Postgres, AI swappable via universal API, no unapproved external services, monorepo, README sections

## 8. Questions to mentors (PL)
1. Czy w produkcie możemy użyć modelu AI w chmurze na potrzeby demo, czy tylko lokalnie albo wcale?
2. Czy publiczne API eksploratorów (Etherscan, mempool.space, TronGrid) są dopuszczalnymi usługami zewnętrznymi?
3. Czy skupienie na USDT (Tron) i wymianie na gotówkę przez kantory / P2P jest dla Was wartościowe?
4. Czy backend w Node.js (TypeScript) jest dla Was w porządku?
5. Czy raport w PDF + JSON jest wystarczający?
