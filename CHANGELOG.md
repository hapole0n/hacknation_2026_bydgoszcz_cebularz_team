# Changelog

KROPKA (HackNation 2026, OŁCyŚ). One release per project phase (see `PLAN.md`, section 6); each tag marks the last commit of its phase. Dates are Europe/Warsaw.

## [0.9.0] — P7.5 · 2026-11-22 — redesign

- New desktop-window interface per `docs/design/SPEC.md`: shared components, screens for new case, result, address card, register, graph, request log, report and notifications; IBM Plex Mono + VT323 served locally; F1–F10 with an `Alt+digit` fallback.
- One field for all identifiers with automatic type detection; case signature `KR/YYYY/NNNN` (automatic, per year; migration backfills old cases); "Numer postępowania / podstawa" in the case, request log and report; analyst comment on every decision; query time in "Przeszukane źródła".
- Light PDF report in the same fonts and palette (fonts and OFL texts vendored in `apps/api/assets/fonts`); licence generator re-checks the font licences.
- 22 new screenshots from real runs on a clean database; docs updated; git flow `develop` ← `feat/*`, GitHub Actions CI, PR and issue templates, `SECURITY.md`.
- README title block (badges, main screenshot, quick start); annotated tags `v0.1.0`…`v0.9.0` with GitHub releases.
- Fix: a stored run keeps the address classification of its own time (`summaryJson.addresses`), so old runs and reports no longer change when a later run reclassifies an address, and the run diff can see category changes; address upserts in sorted order (no deadlock between concurrent runs). This was the cause of the flaky test `9. reproducible…`.

## [0.8.0] — P7 · 2026-11-21 — acceptance and publication

- Acceptance tests `Z-01…Z-31`, one per requirement of the task; `docs/ZGODNOSC.md` (requirement → code → test → status); README per the task's requirement 9; `LICENSES.md` generated (fails on unreviewed licences); `LICENSE`.
- Before P7: search log per source and identifier; Telegram public pages and GitHub e-mail connectors (sandbox answers for synthetic subjects); Polish plural forms; "Analizowane adresy"; address-rejection test replayed from recorded public answers.
- Fixes: rolling-window rate limit in `EgressClient`; TronGrid transfers without token info; ENS never asks the RPC about synthetic addresses; `effect` override (GHSA-7589-6fvf-x4pw); history cleaned of third-party profile links before publication.

## [0.7.0] — P6 · 2026-11-21 — monitoring and change over time

- Per-case schedule (15 min / 1 h / 24 h), scheduler tick, run history; `RunDiff` (new / gone addresses, score changes by rule, new transactions, thresholds, cash-out tags, address swap) with notifications and report section 8.
- Sandbox world v2 ("Demo: symuluj zmianę"); Wayback, Gravatar and ENS connectors; optional local AI (OpenAI-compatible, off by default, never changes the score).

## [0.6.0] — P5 · 2026-11-21 — report and request log

- Report document (FAKT / OBLICZENIE / WNIOSEK) as HTML, PDF (pdfmake) and JSON, with SHA-256 of the data and of the evidence set; report cache keyed by data hash and template version.
- Request log page (`/audit`, `GET /api/audit-log`); compliance and security section in the README.

## [0.5.0] — P4 · 2026-11-21 — web UI

- Cases, new-case form, results with the score ledger, rejected attributions, address card, Cytoscape graph, Polish / English; product renamed to KROPKA (`@kropka/*`); analysis notes as codes translated in the UI.

## [0.4.0] — P3 · 2026-11-21 — chain analysis

- Chain adapters (fixtures, mempool.space, Etherscan v2, TronGrid), address classification (labels, bytecode, heuristics), exclusions, cash-out indicators, AML thresholds, NBP valuation in PLN, chronology, address-case identities.

## [0.3.0] — P2 · 2026-11-21 — pipeline

- Synthetic "mini-internet" (`fixtures/sandbox-web`), `EgressClient` (allowlist, rate limit, cache, audit log), `sandbox` and `github` connectors, pipeline Case → Run → Evidence → Traces → Links, REST API, acceptance test on the demo case.

## [0.2.0] — P1 · 2026-11-21 — core logic

- `packages/core`: address extraction and validation (BTC / ETH / TRON / ENS), context classifier, Confidence Score engine reading `config/scoring-rules.v1.yaml` with a point-by-point breakdown; rules loaded by the API.

## [0.1.0] — P0 · 2026-11-21 — scaffold

- pnpm monorepo (`apps/api`, `apps/web`, `packages/core`), Prisma schema and first migration, docker-compose (db, sandbox, api, web), `GET /api/health`, licence report.
