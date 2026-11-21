---
name: hn-submit
description: Final submission checklist for OŁCyŚ (HackNation 2026). Run before 10:30 on Sunday.
disable-model-invocation: true
---

Go through the checklist below. Verify each item in the repo (run commands where possible). Report to Oleh in Russian as a list with ✅ / ❌ and the exact fix for every ❌. Fix small things yourself if he agrees.

1. **Build from clean clone:** `pnpm install && pnpm build && pnpm test` green; `docker compose up --build` starts the full stack.
2. **README.md (Polish)** contains, in this order: opis projektu (problem + jak), założenia, instrukcja instalacji / technologie, przykłady (screenshoty / logi), opcjonalnie dokumentacja techniczna — plus: Parametry wyszukiwania, Zgodność i bezpieczeństwo, Licencje, Wykorzystane zasoby.
3. **LICENSES.md** regenerated; every production dependency has a license; no copyleft surprises.
4. **No secrets:** `.env` not tracked; quick scan of git history for keys/tokens.
5. **Egress:** allowlist matches README; no telemetry; no CDN scripts/fonts in the web build.
6. **Demo case** walks all 7 mandatory stages (PLAN.md §2) without errors.
7. **Acceptance tests** — one per task bullet — green.
8. **Submission package:** title + detailed description including search parameters; PDF ≤ 10 slides; video ≤ 3 min in an open repository (file in repo or public link) and linked in README; repo link; **repo set to public**.
9. **HackTribe** entry complete (task, team `cebularz`, project name, repo link, table 8f).
