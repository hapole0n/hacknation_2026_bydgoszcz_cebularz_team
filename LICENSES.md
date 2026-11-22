# Licencje wykorzystanych komponentów

Plik generowany skryptem `pnpm licenses:report` (2026-11-22) — nie edytować ręcznie.
Wszystkie komponenty zewnętrzne są Open Source; licencja własnego kodu projektu: plik `LICENSE`. Skrypt kończy się błędem, jeśli pojawi się licencja wymagająca decyzji człowieka (silny copyleft, nieznana, albo słaby copyleft / uznanie autorstwa bez wpisu w sekcji „Uwagi”).

## Podsumowanie (477 pakietów npm)

| Licencja | Liczba pakietów |
|---|---|
| MIT | 381 |
| Apache-2.0 | 35 |
| ISC | 33 |
| BSD-2-Clause | 8 |
| BSD-3-Clause | 7 |
| BlueOak-1.0.0 | 4 |
| OFL-1.1 | 2 |
| MPL-2.0 | 2 |
| Unlicense | 2 |
| MIT and ISC | 1 |
| EPL-2.0 | 1 |
| 0BSD | 1 |

Silnego copyleftu (GPL / AGPL / SSPL) ani licencji nieznanych wśród zależności nie ma.

## Uwagi do licencji o szczególnych wymogach

| Pakiet | Decyzja |
|---|---|
| `elkjs` | EPL-2.0 (copyleft na poziomie plików). Zależność narzędzia Prisma Studio (`prisma` → `@prisma/studio-core`), niemodyfikowana, niepowiązana z kodem aplikacji. Obowiązek: zachować licencję i wskazać źródło (npm: elkjs). |
| `lightningcss` | MPL-2.0 (copyleft na poziomie plików). Narzędzie budowania (Tailwind / Vite, devDependency interfejsu), niemodyfikowane; do paczki webowej trafia tylko wygenerowany CSS. |
| `lightningcss-win32-x64-msvc` | MPL-2.0, jak `lightningcss` (binarium dla Windows, tylko narzędzie budowania). |
| `@fontsource/ibm-plex-mono` | OFL-1.1 — czcionka interfejsu, patrz „Czcionki”. |
| `@fontsource/vt323` | OFL-1.1 — czcionka nagłówków interfejsu, patrz „Czcionki”. |

## Komponenty spoza npm (obrazy Docker i usługi)

| Komponent | Licencja |
|---|---|
| PostgreSQL 16 (`postgres:16-alpine`) | PostgreSQL License |
| nginx (`nginx:alpine`) | BSD-2-Clause |
| Node.js 22 (`node:22-bookworm-slim`) | MIT |
| Ollama (opcjonalnie, uruchamiany osobno przez użytkownika; nie jest częścią `docker-compose.yml`) | MIT |

Obrazy bazowe zawierają też pakiety systemowe Debian / Alpine na ich własnych licencjach (w tym GPL); aplikacja ich nie modyfikuje ani nie łączy z własnym kodem.

## Czcionki

Wszystkie czcionki są serwowane lokalnie (żadnych czcionek z CDN) i objęte SIL Open Font License 1.1; skrypt sprawdza przy każdym generowaniu, że pliki i pakiety nadal to deklarują. Interfejs używa pakietów `@fontsource/*`, raport PDF — niezmodyfikowanych plików z `apps/api/assets/fonts/` (razem z tekstami licencji).

| Czcionka | Licencja | Informacja o prawach autorskich | Użycie |
|---|---|---|---|
| IBM Plex Mono (`@fontsource/ibm-plex-mono`; pliki `apps/api/assets/fonts/ibm-plex-mono/*.woff`) | SIL OFL-1.1 | Copyright © 2017 IBM Corp. with Reserved Font Name "Plex" | cały interfejs i tekst raportu PDF |
| VT323 (`@fontsource/vt323`; plik `apps/api/assets/fonts/vt323/VT323-Regular.ttf`) | SIL OFL-1.1 | Copyright 2011, The VT323 Project Authors | duże nagłówki interfejsu i raportu PDF |

## Zbiory danych i etykiet

Listy etykiet adresów (`config/labels/*.json`). Aplikacja nie wystartuje, jeśli plik nie ma w nagłówku źródła, licencji i daty pobrania.

| Plik | Wpisów | Źródło | Licencja | Pobrano |
|---|---|---|---|---|
| `binance-tron.json` | 8 | Binance — official post "Our Commitment To Transparency" (published 2022-11-10): the list of wallet addresses of major tokens on BTC, ETH, BSC, BNB and TRX, network TRX (USDT / USDC). Public page, no login. (https://www.binance.com/en/blog/community/2895840147147652626) | No licence is stated on the page; the addresses are an official public disclosure by the exchange. Only addresses and the snapshot reference are reproduced here. | 2026-11-21 |
| `charity.json` | 1 | Public label of a government donation address (dawsbot/eth-labels, data/csv/accounts.csv @ d9b21aefeded56f7fce7208d6fa173d128526c1b) (https://github.com/dawsbot/eth-labels/blob/d9b21aefeded56f7fce7208d6fa173d128526c1b/data/csv/accounts.csv) | MIT (dawsbot/eth-labels) | 2026-11-21 |
| `dex.json` | 2 | Official Uniswap documentation (deployment addresses) + eth-labels cross-check (https://developers.uniswap.org/docs/protocols/v2/deployments) | Public facts from official docs (no licence stated on the pages); cross-check dataset MIT (dawsbot/eth-labels) | 2026-11-21 |
| `examples.json` | 8 | Specification test vectors (EIP-55, BIP-173, BIP-350) and the burn addresses of eth-labels (https://github.com/ethereum/ERCs/blob/master/ERCS/erc-55.md) | EIP/BIP texts: CC0 / public domain; eth-labels: MIT | 2026-11-21 |
| `exchanges-tron.json` | 79 | OKX Proof of Reserves — published wallet-address file (report of 1 Nov 2026, 00:00 UTC+8), network TRON; every address in the file carries a signed message ("I am an OKX address" or "I am an Okcoin address") (https://www.okx.com/en-eu/proof-of-reserves/download) | No licence is stated for the address file on the OKX download page; the addresses are an official public disclosure by the exchange. Only addresses and the snapshot reference are reproduced here. | 2026-11-21 |
| `exchanges.json` | 1 | Public label of a centralised-exchange hot wallet: brianleect/etherscan-labels (Etherscan mainnet labels, data/etherscan/combined/combinedAllLabels.json @ 923aba72c7e2d0682f7ae6194b6140bd90668dc9), cross-checked in dawsbot/eth-labels (https://github.com/brianleect/etherscan-labels/blob/923aba72c7e2d0682f7ae6194b6140bd90668dc9/data/etherscan/combined/combinedAllLabels.json) | MIT (brianleect/etherscan-labels; dawsbot/eth-labels) | 2026-11-21 |
| `synthetic-demo.json` | 1 | SYNTHETIC — demo data only (fixtures/addresses.json, generated by scripts/gen-fixture-addresses.mjs) | n/a (synthetic; the address belongs to nobody) | 2026-11-21 |

Pozostałe dane:

| Dane | Pochodzenie | Licencja |
|---|---|---|
| `fixtures/sandbox-web`, `fixtures/chain`, `fixtures/addresses.json`, `fixtures/expected.json`, `fixtures/demo-case.json` | **syntetyczne**: osoby, strony i adresy zmyślone (adresy z losowych kluczy, `scripts/gen-fixture-addresses.mjs`; e-maile na domenach zarezerwowanych) | autorstwa zespołu; nie dotyczą żadnej prawdziwej osoby |
| `fixtures/recorded/real-addresses.json` | odpowiedzi publicznych API (Etherscan API v2 (module=proxy, action=eth_getCode) and TronGrid (POST /wallet/getcontract), both public APIs, read through EgressClient) dla pięciu adresów instytucjonalnych, zapisane 2026-11-21; bez kluczy API i bez list transakcji | Facts read from public blockchains (bytecode present or not, contract metadata); no licence text applies to them. No API key is stored: URLs are saved without `apikey`. |
| Kursy NBP (API `api.nbp.pl`, tabela A) | pobierane w czasie działania, w testach zastępowane syntetycznymi (USD 4,00; EUR 4,40) | dane publiczne NBP; nie są zapisywane w repozytorium |
| Dane Ethereum z Etherscan API v2 | pobierane w czasie działania (Powered by Etherscan.io APIs); w repozytorium tylko odpowiedzi `eth_getCode` pięciu adresów publicznych | regulamin Etherscan API |
| Dane TRON z TronGrid | jak wyżej (`wallet/getcontract`) | regulamin TronGrid |

## Pakiety npm

| Pakiet | Wersje | Licencja | Strona |
|---|---|---|---|
| @angular-devkit/core | 22.2.7 | MIT | https://github.com/angular/angular-cli |
| @angular-devkit/schematics | 22.2.7 | MIT | https://github.com/angular/angular-cli |
| @angular-devkit/schematics-cli | 22.2.7 | MIT | https://github.com/angular/angular-cli |
| @babel/helper-string-parser | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-helper-string-parser |
| @babel/helper-validator-identifier | 7.29.7 | MIT | https://github.com/babel/babel#readme |
| @babel/parser | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-parser |
| @babel/types | 7.29.14 | MIT | https://babel.dev/docs/en/next/babel-types |
| @borewit/text-codec | 0.2.3 | MIT | https://github.com/Borewit/text-codec#readme |
| @cacheable/memory | 2.2.0 | MIT | https://github.com/jaredwray/cacheable#readme |
| @cacheable/utils | 2.5.0 | MIT | https://github.com/jaredwray/cacheable#readme |
| @colors/colors | 1.5.0 | MIT | https://github.com/DABH/colors.js |
| @electric-sql/pglite | 0.4.3 | Apache-2.0 | https://pglite.dev |
| @electric-sql/pglite-socket | 0.1.3 | Apache-2.0 | https://pglite.dev |
| @electric-sql/pglite-tools | 0.3.3 | Apache-2.0 | https://pglite.dev |
| @esbuild/win32-x64 | 0.28.2 | MIT | https://github.com/evanw/esbuild#readme |
| @eslint-community/eslint-utils | 4.10.1 | MIT | https://github.com/eslint-community/eslint-utils#readme |
| @eslint-community/regexpp | 4.12.3 | MIT | https://github.com/eslint-community/regexpp#readme |
| @eslint/config-array | 0.23.6 | Apache-2.0 | https://github.com/eslint/rewrite/tree/main/packages/config-array#readme |
| @eslint/config-helpers | 0.7.0 | Apache-2.0 | https://github.com/eslint/rewrite/tree/main/packages/config-helpers#readme |
| @eslint/core | 1.2.1 | Apache-2.0 | https://github.com/eslint/rewrite/tree/main/packages/core#readme |
| @eslint/object-schema | 3.0.5 | Apache-2.0 | https://github.com/eslint/rewrite/tree/main/packages/object-schema#readme |
| @eslint/plugin-kit | 0.7.3 | Apache-2.0 | https://github.com/eslint/rewrite/tree/main/packages/plugin-kit#readme |
| @fontsource/ibm-plex-mono | 5.3.0 | OFL-1.1 | https://fontsource.org/fonts/ibm-plex-mono |
| @fontsource/vt323 | 5.3.0 | OFL-1.1 | https://fontsource.org/fonts/vt323 |
| @humanfs/core | 0.19.2 | Apache-2.0 | https://github.com/humanwhocodes/humanfs#readme |
| @humanfs/node | 0.16.8 | Apache-2.0 | https://github.com/humanwhocodes/humanfs#readme |
| @humanfs/types | 0.15.0 | Apache-2.0 | https://github.com/humanwhocodes/humanfs#readme |
| @humanwhocodes/module-importer | 1.0.1 | Apache-2.0 | https://github.com/humanwhocodes/module-importer#readme |
| @humanwhocodes/retry | 0.4.3 | Apache-2.0 | https://github.com/humanwhocodes/retry#readme |
| @inquirer/ansi | 2.1.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/ansi/README.md |
| @inquirer/checkbox | 5.3.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/checkbox/README.md |
| @inquirer/confirm | 6.4.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/confirm/README.md |
| @inquirer/core | 12.1.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/core/README.md |
| @inquirer/editor | 5.4.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/editor/README.md |
| @inquirer/expand | 5.2.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/expand/README.md |
| @inquirer/external-editor | 3.1.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/external-editor/README.md |
| @inquirer/figures | 2.1.0 | MIT | https://github.com/SBoudrias/Inquirer.js#readme |
| @inquirer/input | 5.2.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/input/README.md |
| @inquirer/number | 4.3.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/number/README.md |
| @inquirer/password | 5.3.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/password/README.md |
| @inquirer/prompts | 8.7.2, 8.7.5 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/prompts/README.md |
| @inquirer/rawlist | 5.4.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/rawlist/README.md |
| @inquirer/search | 4.4.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/search/README.md |
| @inquirer/select | 5.3.0 | MIT | https://github.com/SBoudrias/Inquirer.js/blob/HEAD/packages/select/README.md |
| @inquirer/type | 4.3.0 | MIT | https://github.com/SBoudrias/Inquirer.js#readme |
| @isaacs/nonrecursive-glob-match | 1.1.0 | BlueOak-1.0.0 |  |
| @jridgewell/gen-mapping | 0.3.13 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping |
| @jridgewell/remapping | 2.3.5 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/remapping |
| @jridgewell/resolve-uri | 3.1.3 | MIT | https://github.com/jridgewell/resolve-uri#readme |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec |
| @jridgewell/trace-mapping | 0.3.31 | MIT | https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping |
| @keyv/bigmap | 1.3.1 | MIT | https://github.com/jaredwray/keyv |
| @keyv/serialize | 1.1.1 | MIT | https://github.com/jaredwray/keyv |
| @lukeed/csprng | 1.1.0 | MIT | https://github.com/lukeed/csprng#readme |
| @nestjs/cli | 12.0.15 | MIT | https://github.com/nestjs/nest-cli#readme |
| @nestjs/common | 12.6.0 | MIT | https://nestjs.com |
| @nestjs/core | 12.6.0 | MIT | https://nestjs.com |
| @nestjs/platform-express | 12.6.0 | MIT | https://nestjs.com |
| @nestjs/schematics | 12.0.16 | MIT | https://github.com/nestjs/schematics#readme |
| @noble/ciphers | 1.3.0 | MIT | https://paulmillr.com/noble/ |
| @noble/curves | 2.4.0 | MIT | https://paulmillr.com/noble/ |
| @noble/hashes | 1.8.0, 2.4.0 | MIT | https://paulmillr.com/noble/ |
| @oxc-project/types | 0.156.0 | MIT | https://oxc.rs |
| @prisma/adapter-pg | 7.10.1 | Apache-2.0 | https://github.com/prisma/orm#readme |
| @prisma/client | 7.10.1 | Apache-2.0 | https://www.prisma.io |
| @prisma/client-runtime-utils | 7.10.1 | Apache-2.0 | https://github.com/prisma/orm#readme |
| @prisma/config | 7.10.1 | Apache-2.0 | https://github.com/prisma/orm#readme |
| @prisma/debug | 7.2.0, 7.10.1 | Apache-2.0 | https://www.prisma.io |
| @prisma/dev | 0.24.17 | ISC |  |
| @prisma/driver-adapter-utils | 7.10.1 | Apache-2.0 | https://github.com/prisma/orm#readme |
| @prisma/engines | 7.10.1 | Apache-2.0 | https://github.com/prisma/orm#readme |
| @prisma/engines-version | 8.1.0-1.d1b3f377ca835d73fd50954a5e22128b9ebdd6b8 | Apache-2.0 | https://github.com/prisma/engines-wrapper#readme |
| @prisma/fetch-engine | 7.10.1 | Apache-2.0 | https://www.prisma.io |
| @prisma/get-platform | 7.2.0, 7.10.1 | Apache-2.0 | https://www.prisma.io |
| @prisma/query-plan-executor | 7.2.0 | Apache-2.0 | https://github.com/prisma/prisma#readme |
| @prisma/streams-local | 0.1.11 | Apache-2.0 | https://github.com/prisma/streams/tree/main/docs |
| @prisma/studio-core | 0.33.0 | Apache-2.0 | https://github.com/prisma/studio#readme |
| @radix-ui/primitive | 1.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-compose-refs | 1.1.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-primitive | 2.1.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-slot | 1.2.3 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-toggle | 1.1.10 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-controllable-state | 1.2.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-effect-event | 0.0.2 | MIT | https://radix-ui.com/primitives |
| @radix-ui/react-use-layout-effect | 1.1.1 | MIT | https://radix-ui.com/primitives |
| @rolldown/binding-win32-x64-msvc | 1.2.19 | MIT | https://rolldown.rs/ |
| @rolldown/pluginutils | 1.1.1 | MIT | https://github.com/rolldown/plugins/tree/main/packages/pluginutils#readme |
| @scure/base | 2.4.0 | MIT | https://paulmillr.com/noble/#scure |
| @sindresorhus/is | 4.6.0 | MIT | https://github.com/sindresorhus/is#readme |
| @standard-schema/spec | 1.1.0 | MIT | https://standardschema.dev |
| @swc/helpers | 0.5.24 | Apache-2.0 | https://swc.rs |
| @tailwindcss/node | 4.3.5 | MIT | https://tailwindcss.com |
| @tailwindcss/oxide | 4.3.5 | MIT | https://github.com/tailwindlabs/tailwindcss#readme |
| @tailwindcss/oxide-wasm32-wasi | 4.3.5 | MIT | https://github.com/tailwindlabs/tailwindcss#readme |
| @tailwindcss/oxide-win32-x64-msvc | 4.3.5 | MIT | https://github.com/tailwindlabs/tailwindcss#readme |
| @tailwindcss/vite | 4.3.5 | MIT | https://tailwindcss.com |
| @tanstack/query-core | 5.108.1 | MIT | https://tanstack.com/query |
| @tanstack/react-query | 5.108.1 | MIT | https://tanstack.com/query |
| @tokenizer/inflate | 0.6.1 | MIT | https://github.com/Borewit/tokenizer-inflate#readme |
| @tokenizer/token | 0.3.0 | MIT | https://github.com/Borewit/tokenizer-token#readme |
| @types/body-parser | 1.19.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/body-parser |
| @types/chai | 5.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/chai |
| @types/connect | 3.4.38 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/connect |
| @types/d3-array | 3.0.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-array |
| @types/d3-color | 3.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-color |
| @types/d3-delaunay | 6.0.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-delaunay |
| @types/d3-format | 3.0.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-format |
| @types/d3-geo | 3.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-geo |
| @types/d3-interpolate | 3.0.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-interpolate |
| @types/d3-path | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-path |
| @types/d3-scale | 4.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-scale |
| @types/d3-shape | 3.1.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-shape |
| @types/d3-time | 3.0.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/d3-time |
| @types/d3-time-format | 2.1.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped#readme |
| @types/deep-eql | 4.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/deep-eql |
| @types/esrecurse | 4.3.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/esrecurse |
| @types/estree | 1.0.10 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree |
| @types/express | 5.0.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/express |
| @types/express-serve-static-core | 5.1.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/express-serve-static-core |
| @types/geojson | 7946.0.16 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/geojson |
| @types/http-errors | 2.0.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/http-errors |
| @types/json-schema | 7.0.15 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/json-schema |
| @types/lodash | 4.17.27 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/lodash |
| @types/node | 22.20.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node |
| @types/pdfkit | 0.17.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/pdfkit |
| @types/pdfmake | 0.3.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/pdfmake |
| @types/pg | 8.23.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/pg |
| @types/qs | 6.15.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/qs |
| @types/range-parser | 1.2.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/range-parser |
| @types/react | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react |
| @types/react-dom | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom |
| @types/send | 1.2.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/send |
| @types/serve-static | 2.2.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/serve-static |
| @typescript-eslint/eslint-plugin | 8.73.0 | MIT | https://typescript-eslint.io/packages/eslint-plugin |
| @typescript-eslint/parser | 8.73.0 | MIT | https://typescript-eslint.io/packages/parser |
| @typescript-eslint/project-service | 8.73.0 | MIT | https://typescript-eslint.io |
| @typescript-eslint/scope-manager | 8.73.0 | MIT | https://typescript-eslint.io/packages/scope-manager |
| @typescript-eslint/tsconfig-utils | 8.73.0 | MIT | https://typescript-eslint.io |
| @typescript-eslint/type-utils | 8.73.0 | MIT | https://typescript-eslint.io |
| @typescript-eslint/types | 8.73.0 | MIT | https://typescript-eslint.io |
| @typescript-eslint/typescript-estree | 8.73.0 | MIT | https://typescript-eslint.io/packages/typescript-estree |
| @typescript-eslint/utils | 8.73.0 | MIT | https://typescript-eslint.io/packages/utils |
| @typescript-eslint/visitor-keys | 8.73.0 | MIT | https://typescript-eslint.io |
| @visx/curve | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/event | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/grid | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/group | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/point | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/responsive | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/scale | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/shape | 4.0.1-alpha.0 | MIT | https://github.com/airbnb/visx#readme |
| @visx/vendor | 4.0.0-alpha.0 | MIT and ISC | https://github.com/airbnb/visx#readme |
| @vitejs/plugin-react | 6.3.0 | MIT | https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#readme |
| @vitest/mocker | 5.1.1 | MIT | https://github.com/vitest-dev/vitest/tree/main/packages/mocker |
| @vitest/spy | 5.1.1 | MIT | https://vitest.dev/api/mock |
| accepts | 2.0.0 | MIT | https://github.com/jshttp/accepts#readme |
| acorn | 8.19.0 | MIT | https://github.com/acornjs/acorn |
| acorn-jsx | 5.3.2 | MIT | https://github.com/acornjs/acorn-jsx |
| ajv | 6.15.0, 8.20.0 | MIT | https://ajv.js.org |
| ajv-formats | 3.0.1 | MIT | https://github.com/ajv-validator/ajv-formats#readme |
| ansi-regex | 5.0.1, 6.6.0 | MIT | https://github.com/chalk/ansi-regex#readme |
| ansis | 4.5.0 | ISC | https://github.com/webdiscus/ansis#readme |
| append-field | 1.0.0 | MIT | https://github.com/LinusU/node-append-field#readme |
| array-timsort | 1.0.3 | MIT | https://github.com/kaelzhang/node-array-timsort |
| assertion-error | 2.0.1 | MIT | https://github.com/chaijs/assertion-error#readme |
| aws-ssl-profiles | 1.1.2 | MIT | https://github.com/mysqljs/aws-ssl-profiles#readme |
| balanced-match | 4.0.4 | MIT | https://github.com/juliangruber/balanced-match#readme |
| base64-js | 0.0.8, 1.5.1 | MIT | https://github.com/beatgammit/base64-js |
| better-result | 2.10.0 | MIT | https://better-result.dev |
| body-parser | 2.4.0 | MIT | https://github.com/expressjs/body-parser#readme |
| brace-expansion | 5.0.13 | MIT | https://github.com/juliangruber/brace-expansion#readme |
| brotli | 1.3.3 | MIT | https://github.com/devongovett/brotli.js |
| busboy | 1.6.0 | MIT | https://github.com/mscdex/busboy#readme |
| bytes | 3.1.2 | MIT | https://github.com/visionmedia/bytes.js#readme |
| c12 | 3.3.4 | MIT | https://github.com/unjs/c12#readme |
| cacheable | 2.5.0 | MIT | https://github.com/jaredwray/cacheable#readme |
| call-bind-apply-helpers | 1.0.2 | MIT | https://github.com/ljharb/call-bind-apply-helpers#readme |
| call-bound | 1.0.4 | MIT | https://github.com/ljharb/call-bound#readme |
| chai | 6.3.0 | MIT | http://chaijs.com |
| chalk | 5.6.2 | MIT | https://github.com/chalk/chalk#readme |
| char-regex | 1.0.2 | MIT | https://github.com/Richienb/char-regex#readme |
| chardet | 2.2.0 | MIT | https://github.com/runk/node-chardet |
| chokidar | 5.0.0 | MIT | https://github.com/paulmillr/chokidar |
| classnames | 2.5.1 | MIT | https://github.com/JedWatson/classnames#readme |
| cli-cursor | 5.0.0 | MIT | https://github.com/sindresorhus/cli-cursor#readme |
| cli-spinners | 3.4.0 | MIT | https://github.com/sindresorhus/cli-spinners#readme |
| cli-table3 | 0.6.5 | MIT | https://github.com/cli-table/cli-table3 |
| cli-width | 4.1.0 | ISC | https://github.com/knownasilya/cli-width |
| clone | 2.1.2 | MIT | https://github.com/pvorb/node-clone#readme |
| commander | 15.1.0 | MIT | https://github.com/tj/commander.js#readme |
| comment-json | 5.0.0 | MIT | https://github.com/kaelzhang/node-comment-json#readme |
| confbox | 0.2.4, 0.3.2 | MIT | https://github.com/unjs/confbox#readme |
| content-disposition | 2.0.1 | MIT | https://github.com/jshttp/content-disposition#readme |
| content-type | 2.1.0 | MIT | https://github.com/jshttp/content-type#readme |
| cookie | 0.7.2 | MIT | https://github.com/jshttp/cookie#readme |
| cookie-signature | 1.2.2 | MIT | https://github.com/visionmedia/node-cookie-signature#readme |
| cors | 2.8.6 | MIT | https://github.com/expressjs/cors#readme |
| cross-spawn | 7.0.6 | MIT | https://github.com/moxystudio/node-cross-spawn |
| csstype | 3.2.4 | MIT | https://github.com/frenic/csstype#readme |
| cytoscape | 3.35.0 | MIT | http://js.cytoscape.org |
| d3-array | 3.2.1, 3.2.4 | ISC | https://d3js.org/d3-array/ |
| d3-color | 3.1.0 | ISC | https://d3js.org/d3-color/ |
| d3-delaunay | 6.0.2 | ISC | https://github.com/d3/d3-delaunay |
| d3-format | 3.1.0 | ISC | https://d3js.org/d3-format/ |
| d3-geo | 3.1.0 | ISC | https://d3js.org/d3-geo/ |
| d3-interpolate | 3.0.1 | ISC | https://d3js.org/d3-interpolate/ |
| d3-path | 3.1.0, 3.1.1 | ISC | https://d3js.org/d3-path/ |
| d3-scale | 4.0.2 | ISC | https://d3js.org/d3-scale/ |
| d3-shape | 3.2.0 | ISC | https://d3js.org/d3-shape/ |
| d3-time | 3.1.0 | ISC | https://d3js.org/d3-time/ |
| d3-time-format | 4.1.0 | ISC | https://d3js.org/d3-time-format/ |
| debug | 4.4.3 | MIT | https://github.com/debug-js/debug#readme |
| deep-is | 0.1.4 | MIT | https://github.com/thlorenz/deep-is#readme |
| deepmerge-ts | 8.0.2 | BSD-3-Clause | https://github.com/RebeccaStevens/deepmerge-ts#readme |
| defu | 6.1.7 | MIT | https://github.com/unjs/defu#readme |
| delaunator | 5.1.0 | ISC | https://github.com/mapbox/delaunator#readme |
| depd | 2.0.0 | MIT | https://github.com/dougwilson/nodejs-depd#readme |
| destr | 2.0.5 | MIT | https://github.com/unjs/destr#readme |
| detect-libc | 2.1.2 | Apache-2.0 | https://github.com/lovell/detect-libc#readme |
| dfa | 1.2.0 | MIT | https://github.com/devongovett/dfa#readme |
| dotenv | 17.4.2 | BSD-2-Clause | https://github.com/motdotla/dotenv#readme |
| dunder-proto | 1.0.1 | MIT | https://github.com/es-shims/dunder-proto#readme |
| ee-first | 1.1.1 | MIT | https://github.com/jonathanong/ee-first#readme |
| effect | 3.22.5 | MIT | https://effect.website |
| elkjs | 0.11.1 | EPL-2.0 | https://github.com/kieler/elkjs#readme |
| emoji-regex | 8.0.0 | MIT | https://mths.be/emoji-regex |
| emojilib | 2.4.0 | MIT | https://github.com/muan/emojilib#readme |
| empathic | 2.0.0 | MIT | https://github.com/lukeed/empathic#readme |
| encodeurl | 2.0.3 | MIT | https://github.com/pillarjs/encodeurl#readme |
| enhanced-resolve | 5.27.0 | MIT | https://github.com/webpack/enhanced-resolve#readme |
| env-paths | 3.0.0 | MIT | https://github.com/sindresorhus/env-paths#readme |
| es-define-property | 1.0.1 | MIT | https://github.com/ljharb/es-define-property#readme |
| es-errors | 1.3.0 | MIT | https://github.com/ljharb/es-errors#readme |
| es-module-lexer | 2.3.2 | MIT | https://github.com/guybedford/es-module-lexer#readme |
| es-object-atoms | 1.1.2 | MIT | https://github.com/ljharb/es-object-atoms#readme |
| esbuild | 0.28.2 | MIT | https://github.com/evanw/esbuild#readme |
| escape-html | 1.0.3 | MIT | https://github.com/component/escape-html#readme |
| escape-string-regexp | 4.0.0 | MIT | https://github.com/sindresorhus/escape-string-regexp#readme |
| eslint | 10.15.0 | MIT | https://eslint.org |
| eslint-scope | 9.1.2 | BSD-2-Clause | https://github.com/eslint/js/blob/main/packages/eslint-scope/README.md |
| eslint-visitor-keys | 3.4.3, 5.0.1 | Apache-2.0 | https://github.com/eslint/js/blob/main/packages/eslint-visitor-keys/README.md |
| espree | 11.2.0 | BSD-2-Clause | https://github.com/eslint/js/blob/main/packages/espree/README.md |
| esprima | 4.0.1 | BSD-2-Clause | http://esprima.org |
| esquery | 1.7.0 | BSD-3-Clause | https://github.com/estools/esquery/ |
| esrecurse | 4.3.0 | BSD-2-Clause | https://github.com/estools/esrecurse |
| estraverse | 5.3.0 | BSD-2-Clause | https://github.com/estools/estraverse |
| estree-walker | 3.0.3 | MIT | https://github.com/Rich-Harris/estree-walker#readme |
| esutils | 2.0.3 | BSD-2-Clause | https://github.com/estools/esutils |
| etag | 1.8.1 | MIT | https://github.com/jshttp/etag#readme |
| expect-type | 1.4.0 | Apache-2.0 | https://github.com/mmkal/expect-type#readme |
| express | 5.3.0 | MIT | https://expressjs.com/ |
| exsolve | 1.2.0 | MIT | https://github.com/unjs/exsolve#readme |
| fast-check | 3.23.2 | MIT | https://fast-check.dev/ |
| fast-decode-uri-component | 1.0.1 | MIT | https://github.com/delvedor/fast-decode-uri-component#readme |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal#readme |
| fast-json-stable-stringify | 2.1.0 | MIT | https://github.com/epoberezkin/fast-json-stable-stringify |
| fast-levenshtein | 2.0.6 | MIT | https://github.com/hiddentao/fast-levenshtein#readme |
| fast-querystring | 1.1.2 | MIT | https://github.com/anonrig/fast-querystring#readme |
| fast-safe-stringify | 2.1.1 | MIT | https://github.com/davidmarkclements/fast-safe-stringify#readme |
| fast-string-truncated-width | 3.0.3 | MIT | https://github.com/fabiospampinato/fast-string-truncated-width#readme |
| fast-string-width | 3.0.2 | MIT | https://github.com/fabiospampinato/fast-string-width#readme |
| fast-uri | 3.1.9 | BSD-3-Clause | https://github.com/fastify/fast-uri |
| fast-wrap-ansi | 0.2.2 | MIT | https://github.com/43081j/fast-wrap-ansi#readme |
| fdir | 6.5.0 | MIT | https://github.com/thecodrr/fdir#readme |
| fflate | 0.8.3 | MIT | https://101arrowz.github.io/fflate |
| file-entry-cache | 11.1.5 | MIT | https://github.com/jaredwray/cacheable#readme |
| file-type | 22.3.0 | MIT | https://github.com/sindresorhus/file-type#readme |
| finalhandler | 2.1.1 | MIT | https://github.com/pillarjs/finalhandler#readme |
| find-my-way | 9.7.0 | MIT | https://github.com/delvedor/find-my-way#readme |
| find-up | 5.0.0 | MIT | https://github.com/sindresorhus/find-up#readme |
| flat-cache | 6.1.23 | MIT | https://github.com/jaredwray/cacheable#readme |
| flatted | 3.4.4 | ISC | https://github.com/WebReflection/flatted#readme |
| fontkit | 2.0.4 | MIT | https://github.com/foliojs/fontkit#readme |
| foreground-child | 3.3.1 | ISC | https://github.com/tapjs/foreground-child#readme |
| forwarded | 0.2.0 | MIT | https://github.com/jshttp/forwarded#readme |
| fresh | 2.0.0 | MIT | https://github.com/jshttp/fresh#readme |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind |
| generate-function | 2.3.1 | MIT | https://github.com/mafintosh/generate-function |
| get-east-asian-width | 1.7.0 | MIT | https://github.com/sindresorhus/get-east-asian-width#readme |
| get-intrinsic | 1.3.0 | MIT | https://github.com/ljharb/get-intrinsic#readme |
| get-port-please | 3.2.0 | MIT | https://github.com/unjs/get-port-please#readme |
| get-proto | 1.0.1 | MIT | https://github.com/ljharb/get-proto#readme |
| giget | 3.3.1 | MIT | https://github.com/unjs/giget#readme |
| glob-parent | 6.0.2 | ISC | https://github.com/gulpjs/glob-parent#readme |
| gopd | 1.2.0 | MIT | https://github.com/ljharb/gopd#readme |
| graceful-fs | 4.2.12 | BlueOak-1.0.0 | https://github.com/isaacs/node-graceful-fs#readme |
| grammex | 3.1.13 | MIT | https://github.com/fabiospampinato/grammex#readme |
| graphmatch | 1.1.1 | MIT | https://github.com/fabiospampinato/graphmatch#readme |
| has-symbols | 1.1.0 | MIT | https://github.com/ljharb/has-symbols#readme |
| hashery | 1.5.1 | MIT | https://github.com/jaredwray/hashery#readme |
| hasown | 2.0.4 | MIT | https://github.com/inspect-js/hasOwn#readme |
| hookified | 1.15.1, 2.2.0 | MIT | https://github.com/jaredwray/hookified#readme |
| html-parse-stringify | 4.0.1 | MIT | https://github.com/i18next/html-parse-stringify |
| http-errors | 2.0.1 | MIT | https://github.com/jshttp/http-errors#readme |
| i18next | 27.2.2 | MIT | https://www.i18next.com |
| iconv-lite | 0.7.3 | MIT | https://github.com/pillarjs/iconv-lite |
| ieee754 | 1.2.1 | BSD-3-Clause | https://github.com/feross/ieee754#readme |
| ignore | 5.3.2, 7.0.16 | MIT | https://github.com/kaelzhang/node-ignore#readme |
| imurmurhash | 0.1.4 | MIT | https://github.com/jensyt/imurmurhash-js |
| inherits | 2.0.4 | ISC | https://github.com/isaacs/inherits#readme |
| internmap | 2.0.3 | ISC | https://github.com/mbostock/internmap/ |
| ipaddr.js | 1.9.1 | MIT | https://github.com/whitequark/ipaddr.js#readme |
| is-extglob | 2.1.1 | MIT | https://github.com/jonschlinkert/is-extglob |
| is-fullwidth-code-point | 3.0.0 | MIT | https://github.com/sindresorhus/is-fullwidth-code-point#readme |
| is-glob | 4.0.3 | MIT | https://github.com/micromatch/is-glob |
| is-interactive | 2.0.0 | MIT | https://github.com/sindresorhus/is-interactive#readme |
| is-promise | 4.0.0 | MIT | https://github.com/then/is-promise#readme |
| is-property | 1.0.2 | MIT | https://github.com/mikolalysenko/is-property#readme |
| is-unicode-supported | 2.1.0 | MIT | https://github.com/sindresorhus/is-unicode-supported#readme |
| isexe | 2.0.0 | ISC | https://github.com/isaacs/isexe#readme |
| iterare | 1.2.1 | ISC | https://github.com/felixfbecker/iterare#readme |
| jiti | 2.7.0 | MIT | https://github.com/unjs/jiti#readme |
| json-schema-traverse | 0.4.1, 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse#readme |
| json-stable-stringify-without-jsonify | 1.0.1 | MIT | https://github.com/samn/json-stable-stringify |
| json5 | 2.2.3 | MIT | http://json5.org/ |
| jsonc-parser | 3.3.1 | MIT | https://github.com/microsoft/node-jsonc-parser#readme |
| keyv | 5.6.0 | MIT | https://github.com/jaredwray/keyv |
| levn | 0.4.1 | MIT | https://github.com/gkz/levn |
| lightningcss | 1.33.0 | MPL-2.0 | https://github.com/parcel-bundler/lightningcss#readme |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 | https://github.com/parcel-bundler/lightningcss#readme |
| linebreak | 1.1.0 | MIT | https://github.com/devongovett/linebreaker |
| load-esm | 1.0.3 | MIT | https://github.com/Borewit/load-esm#readme |
| locate-path | 6.0.0 | MIT | https://github.com/sindresorhus/locate-path#readme |
| lodash | 4.18.1 | MIT | https://lodash.com/ |
| log-symbols | 7.0.1 | MIT | https://github.com/sindresorhus/log-symbols#readme |
| long | 5.3.2 | Apache-2.0 | https://github.com/dcodeIO/long.js#readme |
| lru.min | 1.1.5 | MIT | https://github.com/wellwelwel/lru.min#readme |
| magic-string | 1.4.1, 1.4.5 | MIT | https://github.com/Rich-Harris/magic-string#readme |
| magicast | 0.5.5 | MIT | https://github.com/unjs/magicast#readme |
| math-intrinsics | 1.1.0 | MIT | https://github.com/es-shims/math-intrinsics#readme |
| media-typer | 0.3.0, 1.1.1 | MIT | https://github.com/jshttp/media-typer#readme |
| merge-descriptors | 2.0.0 | MIT | https://github.com/sindresorhus/merge-descriptors#readme |
| mime-db | 1.52.0, 1.54.0 | MIT | https://github.com/jshttp/mime-db#readme |
| mime-types | 2.1.35, 3.0.2 | MIT | https://github.com/jshttp/mime-types#readme |
| mimic-function | 5.0.1 | MIT | https://github.com/sindresorhus/mimic-function#readme |
| minimatch | 11.0.9 | BlueOak-1.0.0 | https://github.com/isaacs/minimatch#readme |
| minimist | 1.2.8 | MIT | https://github.com/minimistjs/minimist |
| ms | 2.1.3 | MIT | https://github.com/vercel/ms#readme |
| multer | 2.5.0 | MIT | https://github.com/expressjs/multer#readme |
| mute-stream | 4.0.0 | ISC | https://github.com/npm/mute-stream#readme |
| mysql2 | 3.24.4 | MIT | https://sidorares.github.io/node-mysql2/docs |
| named-placeholders | 1.1.6 | MIT | https://github.com/mysqljs/named-placeholders#readme |
| nanoid | 3.3.20 | MIT | https://github.com/ai/nanoid#readme |
| natural-compare | 1.4.0 | MIT | https://github.com/litejs/natural-compare-lite#readme |
| negotiator | 1.1.0 | MIT | https://github.com/jshttp/negotiator#readme |
| node-emoji | 2.2.0 | MIT | https://github.com/omnidan/node-emoji#readme |
| object-assign | 4.1.1 | MIT | https://github.com/sindresorhus/object-assign#readme |
| object-inspect | 1.14.0 | MIT | https://github.com/inspect-js/object-inspect |
| obug | 3.0.0 | MIT | https://github.com/sxzz/obug#readme |
| ohash | 2.0.12 | MIT | https://github.com/unjs/ohash#readme |
| on-finished | 2.4.2 | MIT | https://github.com/jshttp/on-finished#readme |
| once | 1.4.0 | ISC | https://github.com/isaacs/once#readme |
| onetime | 7.0.0 | MIT | https://github.com/sindresorhus/onetime#readme |
| optionator | 0.9.4 | MIT | https://github.com/gkz/optionator |
| ora | 9.4.1 | MIT | https://github.com/sindresorhus/ora#readme |
| p-limit | 3.1.0 | MIT | https://github.com/sindresorhus/p-limit#readme |
| p-locate | 5.0.0 | MIT | https://github.com/sindresorhus/p-locate#readme |
| pako | 0.2.9 | MIT | https://github.com/nodeca/pako |
| parseurl | 1.3.3 | MIT | https://github.com/pillarjs/parseurl#readme |
| path-exists | 4.0.0 | MIT | https://github.com/sindresorhus/path-exists#readme |
| path-key | 3.1.1 | MIT | https://github.com/sindresorhus/path-key#readme |
| path-to-regexp | 8.4.2 | MIT | https://github.com/pillarjs/path-to-regexp#readme |
| pathe | 2.0.3 | MIT | https://github.com/unjs/pathe#readme |
| pdfkit | 0.20.2 | MIT | http://pdfkit.org/ |
| pdfmake | 0.3.14 | MIT | http://pdfmake.org |
| perfect-debounce | 2.1.0 | MIT | https://github.com/unjs/perfect-debounce#readme |
| pg | 8.23.1 | MIT | https://github.com/brianc/node-postgres |
| pg-cloudflare | 1.4.1 | MIT | https://github.com/brianc/node-postgres#readme |
| pg-connection-string | 2.14.1 | MIT | https://github.com/brianc/node-postgres/tree/master/packages/pg-connection-string |
| pg-int8 | 1.0.1 | ISC | https://github.com/charmander/pg-int8#readme |
| pg-pool | 3.14.0 | MIT | https://github.com/brianc/node-postgres/tree/master/packages/pg-pool#readme |
| pg-protocol | 1.16.1 | MIT | https://github.com/brianc/node-postgres#readme |
| pg-types | 2.2.0 | MIT | https://github.com/brianc/node-pg-types |
| pgpass | 1.0.5 | MIT | https://github.com/hoegaarden/pgpass#readme |
| picocolors | 1.1.1 | ISC | https://github.com/alexeyraspopov/picocolors#readme |
| picomatch | 4.0.7 | MIT | https://github.com/micromatch/picomatch |
| pkg-types | 2.4.0 | MIT | https://github.com/unjs/pkg-types#readme |
| pluralize | 8.0.0 | MIT | https://github.com/blakeembrey/pluralize#readme |
| png-js | 2.0.0 | MIT | https://github.com/devongovett/png.js#readme |
| postcss | 8.5.33 | MIT | https://postcss.org/ |
| postgres | 3.4.7 | Unlicense | https://github.com/porsager/postgres |
| postgres-array | 2.0.0, 3.0.4 | MIT | https://github.com/bendrucker/postgres-array#readme |
| postgres-bytea | 1.0.1 | MIT | https://github.com/bendrucker/postgres-bytea#readme |
| postgres-date | 1.0.7 | MIT | https://github.com/bendrucker/postgres-date#readme |
| postgres-interval | 1.2.0 | MIT | https://github.com/bendrucker/postgres-interval#readme |
| prelude-ls | 1.2.1 | MIT | http://preludels.com |
| prettier | 3.10.1 | MIT | https://prettier.io |
| prisma | 7.10.1 | Apache-2.0 | https://www.prisma.io |
| proper-lockfile | 4.1.2 | MIT | https://github.com/moxystudio/node-proper-lockfile |
| proxy-addr | 2.0.8 | MIT | https://github.com/jshttp/proxy-addr#readme |
| punycode | 2.3.1 | MIT | https://mths.be/punycode |
| pure-rand | 6.1.0 | MIT | https://github.com/dubzzz/pure-rand#readme |
| qified | 0.10.1 | MIT | https://github.com/jaredwray/qified#readme |
| qs | 6.17.1 | BSD-3-Clause | https://github.com/ljharb/qs |
| range-parser | 1.3.0 | MIT | https://github.com/jshttp/range-parser#readme |
| raw-body | 3.0.2 | MIT | https://github.com/stream-utils/raw-body#readme |
| rc9 | 3.1.0 | MIT | https://github.com/unjs/rc9#readme |
| react | 19.3.1 | MIT | https://react.dev/ |
| react-dom | 19.3.1 | MIT | https://react.dev/ |
| react-i18next | 18.0.3 | MIT | https://github.com/i18next/react-i18next |
| readdirp | 5.1.1 | MIT | https://github.com/paulmillr/readdirp |
| reflect-metadata | 0.2.2 | Apache-2.0 | http://rbuckton.github.io/reflect-metadata |
| remeda | 2.33.4 | MIT | https://remedajs.com/ |
| require-from-string | 2.0.2 | MIT | https://github.com/floatdrop/require-from-string#readme |
| restore-cursor | 5.1.0 | MIT | https://github.com/sindresorhus/restore-cursor#readme |
| restructure | 3.0.2 | MIT | https://github.com/devongovett/restructure |
| ret | 0.5.1 | MIT | https://github.com/fent/ret.js#readme |
| retry | 0.12.0 | MIT | https://github.com/tim-kos/node-retry |
| robust-predicates | 3.0.3 | Unlicense | https://github.com/mourner/robust-predicates#readme |
| rolldown | 1.2.19 | MIT | https://rolldown.rs/ |
| router | 2.3.0 | MIT | https://github.com/pillarjs/router#readme |
| rxjs | 7.8.2 | Apache-2.0 | https://rxjs.dev |
| safe-regex2 | 5.1.2 | MIT | https://github.com/fastify/safe-regex2 |
| safer-buffer | 2.1.2 | MIT | https://github.com/ChALkeR/safer-buffer#readme |
| sax | 1.6.1 | BlueOak-1.0.0 | https://github.com/isaacs/sax-js#readme |
| scheduler | 0.28.0 | MIT | https://react.dev/ |
| semver | 7.8.6 | ISC | https://github.com/npm/node-semver#readme |
| send | 1.2.1 | MIT | https://github.com/pillarjs/send#readme |
| serve-static | 2.2.1 | MIT | https://github.com/expressjs/serve-static#readme |
| setprototypeof | 1.2.0 | ISC | https://github.com/wesleytodd/setprototypeof |
| shebang-command | 2.0.0 | MIT | https://github.com/kevva/shebang-command#readme |
| shebang-regex | 3.0.0 | MIT | https://github.com/sindresorhus/shebang-regex#readme |
| side-channel | 1.1.1 | MIT | https://github.com/ljharb/side-channel#readme |
| side-channel-list | 1.0.1 | MIT | https://github.com/ljharb/side-channel-list#readme |
| side-channel-map | 1.0.1 | MIT | https://github.com/ljharb/side-channel-map#readme |
| side-channel-weakmap | 1.0.2 | MIT | https://github.com/ljharb/side-channel-weakmap#readme |
| signal-exit | 3.0.7, 4.1.0 | ISC | https://github.com/tapjs/signal-exit#readme |
| skin-tone | 2.0.0 | MIT | https://github.com/sindresorhus/skin-tone#readme |
| source-map | 0.8.0 | BSD-3-Clause | https://github.com/mozilla/source-map |
| source-map-js | 1.2.4 | BSD-3-Clause | https://github.com/7rulnik/source-map-js |
| split2 | 4.2.0 | ISC | https://github.com/mcollina/split2#readme |
| sql-escaper | 1.9.1 | MIT | https://github.com/mysqljs/sql-escaper#readme |
| statuses | 2.0.2 | MIT | https://github.com/jshttp/statuses#readme |
| std-env | 3.10.0, 4.3.0 | MIT | https://github.com/unjs/std-env#readme |
| stdin-discarder | 0.3.2 | MIT | https://github.com/sindresorhus/stdin-discarder#readme |
| streamsearch | 1.1.0 | MIT | https://github.com/mscdex/streamsearch#readme |
| string-width | 4.2.3, 8.3.0 | MIT | https://github.com/sindresorhus/string-width#readme |
| strip-ansi | 6.0.1, 7.2.0 | MIT | https://github.com/chalk/strip-ansi#readme |
| strip-bom | 3.0.0 | MIT | https://github.com/sindresorhus/strip-bom#readme |
| strtok3 | 10.8.0 | MIT | https://github.com/Borewit/strtok3#readme |
| tailwindcss | 4.3.5 | MIT | https://tailwindcss.com |
| tapable | 2.3.4 | MIT | https://github.com/webpack/tapable |
| tiny-inflate | 1.0.3 | MIT | https://github.com/devongovett/tiny-inflate |
| tinybench | 6.2.4 | MIT | https://github.com/tinylibs/tinybench#readme |
| tinyexec | 1.3.1 | MIT | https://github.com/tinylibs/tinyexec#readme |
| tinyglobby | 0.2.17 | MIT | https://superchupu.dev/tinyglobby |
| toidentifier | 1.0.1 | MIT | https://github.com/component/toidentifier#readme |
| token-types | 6.2.0 | MIT | https://github.com/Borewit/token-types#readme |
| ts-api-utils | 2.5.0 | MIT | https://github.com/JoshuaKGoldberg/ts-api-utils#readme |
| tsconfig-paths | 4.2.0 | MIT | https://github.com/dividab/tsconfig-paths#readme |
| tslib | 2.9.1 | 0BSD | https://www.typescriptlang.org/ |
| type-check | 0.4.0 | MIT | https://github.com/gkz/type-check |
| type-is | 1.6.18, 2.1.0 | MIT | https://github.com/jshttp/type-is#readme |
| typescript | 6.0.3 | Apache-2.0 | https://www.typescriptlang.org/ |
| typescript-eslint | 8.73.0 | MIT | https://typescript-eslint.io/packages/typescript-eslint |
| uid | 2.0.2 | MIT | https://github.com/lukeed/uid#readme |
| uint8array-extras | 1.6.0 | MIT | https://github.com/sindresorhus/uint8array-extras#readme |
| undici-types | 6.21.0 | MIT | https://undici.nodejs.org |
| unicode-emoji-modifier-base | 1.0.0 | MIT | https://github.com/mathiasbynens/unicode-emoji-modifier-base |
| unicode-properties | 1.4.1 | MIT | https://github.com/devongovett/unicode-properties |
| unicode-trie | 2.0.0 | MIT | https://github.com/devongovett/unicode-trie |
| unpipe | 1.0.0 | MIT | https://github.com/stream-utils/unpipe#readme |
| uri-js | 4.4.1 | BSD-2-Clause | https://github.com/garycourt/uri-js |
| valibot | 1.4.2 | MIT | https://valibot.dev |
| vary | 1.1.2 | MIT | https://github.com/jshttp/vary#readme |
| vite | 8.3.8 | MIT | https://vite.dev |
| vitest | 5.1.1 | MIT | https://vitest.dev |
| which | 2.0.2 | ISC | https://github.com/isaacs/node-which#readme |
| why-is-node-running | 3.2.1 | MIT | https://github.com/mafintosh/why-is-node-running |
| word-wrap | 1.2.5 | MIT | https://github.com/jonschlinkert/word-wrap |
| wrappy | 1.0.2 | ISC | https://github.com/npm/wrappy |
| xmldoc | 2.0.3 | MIT | https://github.com/nfarina/xmldoc#readme |
| xtend | 4.0.2 | MIT | https://github.com/Raynos/xtend |
| yaml | 2.9.1 | ISC | https://eemeli.org/yaml/ |
| yocto-queue | 0.1.0 | MIT | https://github.com/sindresorhus/yocto-queue#readme |
| yoctocolors | 2.2.0 | MIT | https://github.com/sindresorhus/yoctocolors#readme |
| zeptomatch | 2.1.0 | MIT | https://github.com/fabiospampinato/zeptomatch#readme |
