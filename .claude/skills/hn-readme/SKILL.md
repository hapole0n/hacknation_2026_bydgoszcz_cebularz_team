---
name: hn-readme
description: Regenerate README.md in Polish exactly per the OŁCyŚ technical requirement 9, plus our extra sections.
disable-model-invocation: true
---

Regenerate `README.md` in Polish from the current code. Describe only what really works — no invented features.

Sections, in this order:
1. Opis projektu — jaki problem rozwiązuje, w jaki sposób (first paragraph readable for a non-IT reviewer)
2. Założenia projektu
3. Parametry wyszukiwania — input identifiers, connectors with their policy (method, ToS, rate limit, weight), thresholds, Confidence Score rules (version from `config/scoring-rules.*.yaml`, base tiers, modifiers, exclusions)
4. Architektura — short diagram + modules
5. Instalacja i uruchomienie — prerequisites (Docker Desktop, Node.js LTS, pnpm) and exact commands
6. Scenariusz demonstracyjny — the 7 mandatory stages, how to run the demo case
7. Przykłady — screenshots from `docs/screenshots/` (create them with Playwright if missing) and log excerpts
8. Zgodność i bezpieczeństwo — OSINT only, ToS, no unapproved external services, egress allowlist + audit log, local optional AI, data minimisation, retention
9. Licencje wykorzystanych komponentów — link to `LICENSES.md`
10. Wykorzystane zasoby — from `docs/research-notes.md`
11. Opcjonalnie: dokumentacja techniczna

Report back to Oleh in Russian: what changed, what is still missing.
