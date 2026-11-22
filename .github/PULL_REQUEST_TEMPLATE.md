## What and why

<!-- One or two sentences: what changes and why. Link the issue if there is one. -->

## Checklist

- [ ] Branch was cut from `develop` and the PR targets `develop` (only `develop` → `main` goes to `main`)
- [ ] `pnpm lint`, `pnpm build` and `pnpm test` are green (CI runs them too)
- [ ] Synthetic or anonymised data only: no real person in fixtures, tests, screenshots or the demo
- [ ] No secrets (`.env`, keys) and no real third-party profile links in the diff
- [ ] Outbound HTTP goes through `EgressClient`; no new CDN, telemetry or cloud-LLM call
- [ ] New dependency? Open-source licence reviewed and `pnpm licenses:report` regenerated
- [ ] User-visible strings are in i18n (`pl` + `en`); docs / `CLAUDE.md` updated if behaviour changed
