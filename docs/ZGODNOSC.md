# Zgodność z zadaniem OŁCyŚ — wymaganie → realizacja → test → status

Dokument odpowiada na pytanie: **co dokładnie z zadania (`docs/OLCyS_zadanie.pdf`) zrobiliśmy, gdzie to jest w kodzie i czym to sprawdzamy.**
Nic tu nie jest upiększone: to, czego nie zrobiliśmy albo zrobiliśmy częściowo, jest napisane wprost (kolumna „Status” i część „Ograniczenia”).

- **Status:** ✅ zrobione i przetestowane · ⚠️ zrobione częściowo (co brakuje — w „Ograniczeniach”) · ❌ nie zrobione.
- **Identyfikator `Z-nn`** jest nazwą testu w `apps/api/test/zadanie.acceptance.test.ts` — po jednym teście na wymaganie, na danych syntetycznych, bez internetu.
  Głębsze testy tego samego wymagania są w kolumnie „Test” (pliki w `apps/api/test/`, `packages/core/test/`, `apps/web/test/`).
- Uruchomienie: `docker compose up -d db` + `pnpm --filter api exec prisma migrate dev` + `pnpm test`
  (tylko akceptacja: `pnpm --filter api exec vitest run test/zadanie.acceptance.test.ts`).
- Testy **nie łączą się z internetem**: sztuczny „mini-internet” jest serwowany z dysku (`fixtures/sandbox-web`), kursy NBP w testach są syntetyczne (USD 4,00; EUR 4,40), odpowiedzi Etherscan / TronGrid dla pięciu prawdziwych adresów publicznych są nagrane (`fixtures/recorded/real-addresses.json`).
  Jedyny wyjątek: `apps/api/test/live-smoke.test.ts` — działa tylko z `ETHERSCAN_API_KEY` w `.env` i odpytuje wyłącznie publiczne adresy instytucjonalne.

## 1. Co narzędzie ma robić (rozdz. 2 zadania „Wyzwanie”)

| ID | Wymaganie | Gdzie zrealizowane | Test | Status |
|---|---|---|---|---|
| Z-01 | Wejście: co najmniej jeden identyfikator — imię i nazwisko, nick, ID komunikatora, login z sieci społecznościowej, e-mail, publiczny adres krypto | `apps/api/src/api.controller.ts` (`parseCaseBody`), `packages/core/src/identity.ts` (`normalizeIdentifier`), formularz `apps/web/src/pages/NewCasePage.tsx` | `Z-01`; `identity.test.ts`; `pipeline.acceptance.test.ts` („POST /cases validation”) | ✅ |
| Z-02 | Automatyczne wyszukiwanie w jawnych źródłach Web2 (komunikatory, profile, fora, serwisy dla programistów, portale ogłoszeń P2P) | konektory `apps/api/src/connectors/` (`sandbox`, `github`, `gravatar`, `ens`, `wayback`, `telegram_public`), `ConnectorRegistry`, `pipeline/pipeline.service.ts` | `Z-02`; `connectors.test.ts`; `github-commits.test.ts`; `gravatar-ens.test.ts`; `wayback.test.ts`; `telegram.test.ts` | ⚠️ |
| Z-03 | Dane wyłącznie z informacji jawnych: bez włamań, logowania na cudze konta, omijania zabezpieczeń | `EgressClient` (`apps/api/src/egress/egress.client.ts`), allowlista `config/egress-allowlist.yaml`, polityka każdego konektora (`ConnectorPolicy`: metoda, regulamin, limit) | `Z-03`; `egress.client.test.ts` | ✅ |
| Z-04 | Cykliczne wykonywanie analiz | `apps/api/src/schedule/scheduler.service.ts`; harmonogram w `Case.scheduleEveryMin` / `nextRunAt` (15 min / 1 h / 24 h) | `Z-04`; `scheduler.test.ts` | ✅ |
| Z-05 | Zapisywanie wyników kolejnych analiz | model `Run` + powiązane tabele (Prisma, `apps/api/prisma/schema.prisma`); `PipelineService.results()` | `Z-05`; `pipeline.acceptance.test.ts` („reproducible… stored results are retrievable”) | ✅ |
| Z-06 | Porównywanie wyników | `packages/core/src/diff.ts` (`diffRuns`, `notificationsFor`), `PipelineService.compareWithPrevious`, `GET /api/runs/:id/diff`, sekcja 8 raportu | `Z-06`; `diff.test.ts`; `pipeline.acceptance.test.ts` („monitoring: comparison of runs”) | ✅ |
| Z-07 | Rozszerzalność: nowe źródła danych, sieci blockchain, mechanizmy analityczne | interfejsy `SourceConnector` (`connectors/connector.ts`) i `ChainAdapter` (`chains/chain-adapter.ts`), `ConnectorRegistry.register()`, `ChainRegistry.register()`; reguły oceny w YAML | `Z-07` | ⚠️ |
| Z-08 | Czytelna prezentacja wyników | aplikacja webowa (`apps/web`, PL / EN), raport: widok HTML, PDF, JSON (`packages/core/src/report`, `apps/api/src/report`) | `Z-08`; `report.test.ts`; testy jednostkowe `apps/web` (format, graf, klucze i18n) | ⚠️ |

## 2. Kryteria obowiązkowe i opcjonalne (rozdz. 3 zadania)

| ID | Wymaganie | Gdzie zrealizowane | Test | Status |
|---|---|---|---|---|
| Z-09 | Wiązanie śladów OSINT z publicznymi adresami krypto na podstawie informacji z otwartych źródeł | `PipelineService` (ślady → powiązania), `packages/core/src/identity.ts` | `Z-09`; `identity.test.ts` | ✅ |
| Z-10 | Kategoryzacja powiązań i **Wskaźnik Pewności** — własny algorytm | `config/scoring-rules.v1.yaml` (wersja reguł zapisywana w każdym przebiegu), `packages/core/src/scoring/` | `Z-10`; `scoring.test.ts` | ✅ |
| Z-11 | Automatyczne rozpoznawanie adresów krypto w tekstach i ich poprawna ekstrakcja | `packages/core/src/extract/` (BTC: Base58Check, Bech32, Bech32m; ETH z sumą EIP-55; TRON; ENS; odrzucanie skrótów transakcji i adresów z błędną sumą kontrolną) | `Z-11`; `extract.test.ts`; `validate.test.ts` | ✅ |
| Z-12 | Wskaźniki wyjścia do walut tradycyjnych (fiat cash-out): usługi P2P, bramki płatnicze, karty krypto-fiat, wymiana znacznych kwot na stablecoiny | `packages/core/src/chain/indicators.ts` (znaczniki `USDT_TO_CASH`, `TO_KANTOR`, `TO_AD_ADDRESS`, `TO_GATEWAY`, `TO_CARD`, `STABLECOIN_CONVERSION`, `SWAP_DEX`; progi 1 000 / 10 000 / 15 000 EUR; wycena PLN wg NBP) | `Z-12`; `chain.test.ts`; `pipeline.acceptance.test.ts` („on-chain indicators”) | ⚠️ |
| Z-13 | Odrzucanie adresów giełd, portfeli powierniczych, smart kontraktów, adresów instytucjonalnych i podobnych | etykiety `config/labels/*.json`; bytecode (`eth_getCode`) i kontrola kontraktu TRON; heurystyki adresu depozytowego i usługi; reguły `EXCL_*` | `Z-13`; **`real-addresses.test.ts`** (5 prawdziwych adresów publicznych, nagrane odpowiedzi); `chains.test.ts`; `fixtures.test.ts` | ⚠️ |
| Z-14 | (opcjonalne) Zmiany w czasie, np. podmiana adresu publikowanego w profilu | `RunDiff` (`sourceChanges` kind `swap`), konektor `wayback`, powiadomienie `ADDRESS_CHANGED` | `Z-14`; `diff.test.ts`; `wayback.test.ts`; `pipeline.acceptance.test.ts` („address change over time”) | ✅ |

## 3. Kryteria akceptacji aplikacji (rozdz. 3 zadania — „scenariusze powinny pozwalać sprawdzić, że narzędzie…”)

| ID | Narzędzie… | Gdzie zrealizowane | Test | Status |
|---|---|---|---|---|
| Z-15 | …poprawnie znajduje adresy krypto | `packages/core/src/extract/`, `PipelineService` | `Z-15` (dokładnie adresy ze sztucznych stron, nic ponadto) | ✅ |
| Z-16 | …łączy informacje z różnych źródeł | reguła `SYNERGY_INDEPENDENT_SOURCES` (różne serwisy; powtórzenia w jednym serwisie się nie liczą) | `Z-16`; `scoring.test.ts` („repeats inside one service…”) | ✅ |
| Z-17 | …liczy Wskaźnik zgodnie z przyjętym algorytmem | `scoring/` + `fixtures/expected.json` (oczekiwane wyniki, pasma, reguły) | `Z-17`; `pipeline.acceptance.test.ts` | ✅ |
| Z-18 | …przedstawia źródła i przesłanki powiązania | rozbicie punktowe (`breakdown`: reguła, punkty, uzasadnienie PL/EN, id dowodów), podpowiedzi „co zmieniłoby wynik”, tabela dowodów | `Z-18`; `report.test.ts` | ✅ |
| Z-19 | …wykrywa wybrane wzorce aktywności w blockchainie | ETH → wymiana DEX → USDT → adres depozytowy giełdy; wiele małych wpływów USDT → kantor / adres z ogłoszenia (USDT → gotówka); momenty przekroczenia progów | `Z-19`; `chain.test.ts` | ✅ |
| Z-20 | …zapisuje wyniki ze źródłem, URL / identyfikatorem zasobu, datą i godziną pobrania oraz metadanymi do odtworzenia i weryfikacji | `Evidence` (url, fetchedAt, sha256 pełnej treści, fragment ±200 znaków, `metaJson`), `Run` (wersja reguł, wersja aplikacji, parametry), skrót SHA-256 raportu i zbioru dowodów | `Z-20`; `pipeline.acceptance.test.ts` („reproducible”) | ✅ |

## 4. Wymagania techniczne (rozdz. 5 zadania)

| ID | Wymaganie | Gdzie zrealizowane | Test | Status |
|---|---|---|---|---|
| Z-21 | Licencje użytych komponentów Open Source wskazane w dokumentacji | `LICENSES.md` (generowany: `pnpm licenses:report`), nagłówki `config/labels/*.json`; licencja własnego kodu: `LICENSE` | `Z-21` | ✅ |
| Z-22 | Technologie: backend Node.js / TypeScript, front React, baza PostgreSQL | `apps/api` (NestJS 12 + Prisma 7), `apps/web` (React + Vite), PostgreSQL 16 w `docker-compose.yml` | `Z-22` | ✅ |
| Z-23 | AI: łatwa wymiana modelu przez uniwersalne API; AI tylko lokalnie | `apps/api/src/ai/ai.service.ts` — API zgodne z OpenAI (`AI_BASE_URL`, `AI_MODEL`), domyślnie wyłączone | `Z-23`; `ai.test.ts` | ⚠️ |
| Z-24 | Brak odwołań do niezaufanych zasobów i wysyłania danych do niezatwierdzonych usług zewnętrznych | `EgressClient` + allowlista + `AuditLog`; brak telemetrii; czcionki i skrypty serwowane lokalnie | `Z-24`; `egress.client.test.ts` | ✅ |
| Z-25 | Jedno repozytorium (monorepo), konteneryzacja dozwolona | pnpm workspaces (`apps/*`, `packages/*`), `docker-compose.yml` (db, sandbox, api, web) | `Z-25` | ✅ |
| Z-26 | Pochodzenie list etykiet (źródło, licencja, data) | nagłówki `config/labels/*.json`, sprawdzane przy starcie (`LabelService`) | `Z-26`; `fixtures.test.ts` | ✅ |
| Z-27 | Bezpieczeństwo: brak sekretów w repozytorium | `.env` w `.gitignore`, szablon `.env.example` bez wartości | `Z-27`; przegląd historii git (wynik w sekcji „Przegląd przed publikacją”) | ✅ |
| Z-28 | `README.md` z wymaganymi sekcjami (opis, założenia, instalacja i technologie, przykłady, opcjonalnie dokumentacja) | `README.md` | `Z-28` | ✅ |

## 5. Scenariusz prezentacji, raport, legalność (rozdz. 6–7 zadania)

| ID | Wymaganie | Gdzie zrealizowane | Test | Status |
|---|---|---|---|---|
| Z-29 | Obowiązkowy scenariusz: wejście → szukanie śladów → wykrycie i weryfikacja adresu → Wskaźnik Pewności → odrzucenie błędnych przypisań → wskaźniki blockchain → źródła i wynik | przypadek demonstracyjny (`fixtures/demo-case.json`, `fixtures/expected.json`; przyciski „Załaduj sprawę demonstracyjną”) | `Z-29`; `pipeline.acceptance.test.ts` (siedem etapów) | ✅ |
| Z-30 | Raport odróżnia fakty ze źródeł, wyniki obliczeń i wnioski do weryfikacji; chronologiczny opis ruchu środków; czytelny dla osób bez wiedzy IT | `packages/core/src/report/` (FAKT / OBLICZENIE / WNIOSEK, streszczenie w pięciu zdaniach, słowniczek, sekcja „Ograniczenia”) | `Z-30`; `report.test.ts` | ✅ |
| Z-31 | Tylko dane syntetyczne lub zanonimizowane w testach i demo | `fixtures/` (adresy z `scripts/gen-fixture-addresses.mjs`, e-maile na domenach zarezerwowanych, fikcyjne serwisy `*.example`) | `Z-31`; `fixtures.test.ts` | ✅ |
| Z-32 | Wymogi formalne: tytuł i opis z parametrami wyszukiwania, prezentacja PDF (maks. 10 slajdów), film (maks. 3 min) w repozytorium, link do repozytorium | opis i parametry: `README.md` (sekcja „Parametry wyszukiwania”) | `Z-32a…d` jako `todo` (celowo widoczne jako otwarte) | ❌ |

## Ograniczenia i to, czego nie zrobiliśmy

**Z-02 — źródła Web2.** Prawdziwe konektory mamy tylko do: GitHub (oficjalne API), Gravatar (API, portfele wymagają klucza), ENS (publiczny RPC), Wayback Machine (CDX) i Telegramu (publiczne strony `t.me`, **domyślnie wyłączone**, bo regulamin Telegrama ogranicza dostęp do treści użytkowników). **Nie mamy** konektorów do forów, portali ogłoszeń P2P ani serwisów społecznościowych (np. Wykop, forum.bitcoin.pl, Instagram / Facebook, X): nie ma dla nich oficjalnych API, a scraping wymagałby osobnej oceny regulaminów. W demonstracji te źródła **symuluje** sztuczny mini-internet (`fixtures/sandbox-web`) — to model formatów, nie dowód, że narzędzie przeszukuje te serwisy.

**Z-03 — robots.txt i regulaminy.** Regulamin i `robots.txt` każdego prawdziwego źródła sprawdzaliśmy ręcznie przy dodawaniu konektora (np. `t.me/robots.txt` → 404, 21.11.2026). W kodzie **nie ma** automatycznego pobierania `robots.txt`; ochronę zapewnia allowlista hostów i limity zapytań.

**Z-07 — rozszerzalność.** Nowe źródło lub sieć dodaje się przez implementację interfejsu i `register()` (przetestowane) — to wtyczka w kodzie, **nie** ładowanie z katalogu / konfiguracji w czasie działania. Nowego wskaźnika analitycznego nie da się dodać bez zmiany kodu: wskaźniki to czysta funkcja w `packages/core/src/chain/indicators.ts` (testowana, ale bez osobnego interfejsu wtyczek). Wagi i progi reguł oceny są w YAML, nowa reguła wymaga kodu.

**Z-08 — prezentacja.** Interfejs ma wersję polską i angielską; **raport jest tylko po polsku**. Testy aplikacji webowej to testy jednostkowe (formatowanie, budowa grafu, spójność kluczy i18n); przejście przez interfejs w przeglądarce sprawdzaliśmy ręcznie (Playwright), bez automatycznych testów end-to-end.

**Z-12 — wskaźniki cash-out.** Logika wskaźników działa i jest przetestowana (także dla bramek płatniczych i kart na syntetycznej historii), ale **nie mamy prawdziwych list etykiet** bramek płatniczych, wydawców kart krypto, polskich kantorów ani portali P2P — jedyny kantor w repozytorium jest syntetyczny. Wykrycie „USDT → gotówka” opiera się więc na dwóch mechanizmach: adres opublikowany w ogłoszeniu „USDT za gotówkę” oraz etykieta usługi (w produkcji KAS podłączyłaby licencjonowane źródło etykiet). Wartość w PLN: stablecoiny 1:1 USD; inne aktywa tylko gdy transfer niesie cenę (fixtures tak; **brak CoinGecko**) — inaczej „bez wyceny”, nigdy 0. Wzorce „peel chain” / dzielenia kwot z planu nie są zaimplementowane.

**Z-13 — odrzucanie fałszywych trafień.** Działa dla: giełd (Etherscan-labels / eth-labels: Binance 14 w sieci ETH; TRON: 79 dużych portfeli OKX z Proof of Reserves i 8 adresów Binance z publicznego wpisu z 2022 r. — **lista Binance w sieci TRON jest niekompletna**, aktualny plik PoR jest za logowaniem i nie jest używany), routerów DEX (2), jednego adresu zbiórki charytatywnej (etykieta z eth-labels, MIT; **nie udało się jej potwierdzić na oficjalnej stronie rządowej**), adresów przykładowych / burn, smart kontraktów (bytecode w Ethereum, kontrola kontraktu w TRON), adresów depozytowych giełd i „usług” (heurystyki zachowania). **Brakuje:** list mikserów (Tornado Cash) i OFAC SDN — reguła `EXCL_MIXER` i kategoria istnieją, ale bez załadowanej listy mikser nie zostanie rozpoznany; etykiet giełd w sieci Bitcoin; adapter Bitcoin (`mempool.space`) jest zweryfikowany wyłącznie na atrapach, bo usługa była nieosiągalna z sieci deweloperskiej. Portfel giełdy bez etykiety i bez widocznej historii wygląda jak zwykły portfel (to pokazuje test w `real-addresses.test.ts`).

**`real-addresses.test.ts` — co jest nagrane.** Nagrane są odpowiedzi `eth_getCode` (Etherscan) i `wallet/getcontract` (TronGrid) dla pięciu publicznych adresów: Binance 14, portfel OKX (TRON), router Uniswap V2, kontrakt USDT (TRC-20) i adres zerowy. **Nie nagrywaliśmy list transakcji** — kontrahenci portfeli giełd to pseudonimowe adresy prywatnych osób, których nie wolno umieszczać w fixtures; odtwarzarka zwraca pustą historię. Test sprawdza więc klasyfikację (etykieta, bytecode, kontrola kontraktu), nie analizę przepływów prawdziwych portfeli.

**Z-23 — AI.** Interfejs i wymienialność modelu są przetestowane na atrapie; **nie sprawdzaliśmy go na prawdziwym modelu**, a wybór modelu (Bielik 4.5B / PLLuM 8B / Qwen 7B) jest nierozstrzygnięty. AI jest opcjonalne, domyślnie wyłączone, jedynie podpowiada typ kontekstu — ocena jest deterministyczna.

**Przechowywanie danych i dostęp.** Pole `Case.retentionDays` jest zapisywane, ale **nic go nie egzekwuje** (brak automatycznego usuwania), a API nie ma endpointu usuwania sprawy (czyszczenie ręcznie w bazie). Aplikacja nie ma uwierzytelniania ani ról — to prototyp dla jednego analityka w sieci lokalnej. Dziennik zapytań (`AuditLog`) celowo nie ma kluczy obcych, żeby przetrwać usunięcie sprawy.

**Testy.** Testy API korzystają z lokalnej bazy PostgreSQL (tej samej, co aplikacja), więc wymagają `docker compose up -d db`; każdy test sprząta tylko własne wiersze. `live-smoke.test.ts` bywa niestabilny w pełnym, równoległym przebiegu (limit darmowego planu Etherscan: 3 zapytania/s); osobno przechodzi.

**Z-32 — pakiet zgłoszeniowy.** Nie ma jeszcze: prezentacji PDF (≤ 10 slajdów), filmu (≤ 3 min), skryptu filmu, ostatecznego tytułu i opisu zgłoszenia, ustawienia repozytorium jako publicznego. Są: opis i parametry wyszukiwania w `README.md`, zrzuty ekranu w `docs/screenshots/` (do odświeżenia po zmianie wyglądu).

## Przegląd przed publikacją repozytorium

Wykonany 21.11.2026 na całej historii gałęzi `main`. Jedyna zmiana historii: z notatek (`docs/research-notes.md`) usunięto odwołania do profili prawdziwych użytkowników jednego z serwisów społecznościowych — także ze starszych commitów (`git filter-branch`, daty commitów zachowane). Po zmianie skan powtórzono.

- **Pliki `.env`:** nigdy nie były śledzone; w historii jest wyłącznie `.env.example` (bez wartości kluczy).
- **Klucze i tokeny:** brak wzorców kluczy (GitHub, AWS, Slack, OpenAI, klucze prywatne PEM, Gravatar, 34-znakowe klucze Etherscan) ani przypisań `*_KEY=` / `*_TOKEN=` z wartością. Skan oparto o wzorce — plik `.env` nie był odczytywany ani porównywany.
- **Adresy krypto:** każdy adres, który kiedykolwiek trafił do historii, jest też w obecnych `fixtures/`, `config/labels/` lub kodzie, czyli jest syntetyczny albo publicznym adresem instytucjonalnym. Nie ma adresów spoza tego zbioru.
- **Dane osobowe właściciela repozytorium** wskazane przez zespół do sprawdzenia (adres portfela, e-mail, nazwa użytkownika komunikatora): nie występują w żadnym commicie.
- **Zrzuty ekranu** (`docs/screenshots/`, 22 pliki, odświeżone po zmianie wyglądu 22.11.2026) pochodzą z rzeczywistych przebiegów aplikacji na osobnej, czystej bazie i danych syntetycznych; dziennik zapytań na zrzucie 16 zawiera wyłącznie zapytania spraw demonstracyjnych (KR/2026/0001, KR/2026/0002).
- **Inne:** brak zrzutów bazy danych ani dużych plików binarnych poza dokumentem zadania i zrzutami ekranu; katalog `.playwright-mcp/` (robocze zrzuty przeglądarki z danymi syntetycznymi) był przez krótki czas śledzony, obecnie jest w `.gitignore`.
- **Autor:** imię, nazwisko i adres e-mail autora w metadanych commitów oraz w `CLAUDE.md` są zamierzone (autorstwo kodu); nazwa konta GitHub w `sandbox.connector.ts` to odnośnik do tego repozytorium, nie dane persony.
- **Licencja projektu:** plik `LICENSE` (własny kod: wszelkie prawa zastrzeżone, udostępniony do oceny w konkursie).
- **`pnpm audit`:** podatność *high* (ReDoS w pakiecie `effect`, zależność narzędzia Prisma) usunięta wymuszeniem wersji `effect ^3.22.5` (`pnpm-workspace.yaml`, `overrides`); pełny zestaw testów, budowa i lint przeszły po zmianie. Pozostaje jedna podatność *moderate* (`minimatch` w narzędziu deweloperskim `shadcn`, używanym tylko do generowania komponentów; poprawka wymaga skoku wersji głównej) — nie jest krytyczna i nie trafia do działającej aplikacji. Podatności krytycznych nie było.
