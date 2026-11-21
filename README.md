# KROPKA — Osintowy Łapacz Cyfrowych Śladów (OŁCyŚ)

> HackNation 2026 · zadanie Ministerstwa Finansów / KAS · zespół **cebularz**
> (nazwa robocza — może się zmienić)

## Opis projektu — jaki problem rozwiązuje i w jaki sposób
TODO

## Założenia projektu
TODO

## Parametry wyszukiwania
TODO — identyfikatory wejściowe, źródła (konektory i ich polityki), progi, reguły Wskaźnika Pewności (wersja reguł z `config/scoring-rules.v1.yaml`).

## Architektura
TODO

## Instalacja i uruchomienie
Wymagane: Docker Desktop, Node.js ≥ 22.12, pnpm 12 (`corepack enable`).

```bash
cp .env.example .env              # uzupełnij klucze API (opcjonalnie)
docker compose up --build         # db + sandbox (:8088) + api (:3000) + web (:5173)
```

Tryb deweloperski:

```bash
pnpm install
docker compose up -d db sandbox
pnpm --filter api exec prisma migrate dev
pnpm dev                          # api :3000 + web :5173
pnpm test && pnpm lint
pnpm licenses:report              # regeneruje LICENSES.md
```

Sprawdzenie: `curl http://localhost:3000/api/health` → `{"status":"ok","db":"up",...}`.

## Scenariusz demonstracyjny
TODO — pełny przebieg analizy na danych syntetycznych.

## Przykłady (zrzuty ekranu / logi)
Zrzuty z przebiegu na danych syntetycznych (`docs/screenshots/`):

| Plik | Co pokazuje |
|---|---|
| `01-nowa-sprawa.png` | formularz nowej sprawy, wybór źródeł |
| `02-wyniki.png` | wyniki: powiązania, Wskaźnik Pewności i rozbicie na reguły |
| `03-graf.png` | graf powiązań (Cytoscape.js) |
| `04-karta-adresu.png` | karta adresu: źródła, wskaźniki blockchain |
| `05-odrzucone.png` | odrzucone przypisania z powodem |
| `06-kto-stoi-za-adresem.png` | wariant „adres na wejściu”: konta, które go opublikowały |
| `07-raport-html.png`, `08-raport-decyzje-wnioski.png` | raport w aplikacji |
| `09-…`, `10-…`, `11-raport-pdf-….png` | raport PDF (strony wyrenderowane z pliku) |
| `12-dziennik-zapytan.png` | Dziennik zapytań (widok „tylko zablokowane i z błędem”; wiersze pokazowe) |

## Zgodność i bezpieczeństwo
- **Wyłącznie OSINT.** Jawne, legalne źródła; oficjalne API tam, gdzie istnieją; przestrzeganie regulaminów i robots.txt źródeł. Bez logowania na cudze konta, wycieków, omijania zabezpieczeń i skanowania podatności.
- **Dane syntetyczne.** Fixtures, testy i demo używają wyłącznie danych sztucznych. Źródła „na żywo” są opt-in dla każdej analizy i służą tylko do pokazu na własnych stronach person syntetycznych lub instytucjonalnych przykładach publicznych (giełdy, routery DEX, zbiórki).
- **Brak wysyłania danych do niezatwierdzonych usług.** Każde zapytanie wychodzące przechodzi przez `EgressClient`: allowlista hostów (`config/egress-allowlist.yaml`), limit zapytań na host, cache i wpis w dzienniku. Brak telemetrii, brak skryptów i czcionek z CDN.
- **Dziennik zapytań.** Strona „Dziennik zapytań” pokazuje każde zapytanie: czas, sprawę, źródło, serwer, ścieżkę bez parametrów i wynik. Zapytania zablokowane przez allowlistę i błędy sieci są wyróżnione. Dziennik nie przechowuje treści odpowiedzi ani parametrów zapytań (tam mogą być klucze API).
- **AI wyłącznie lokalne i opcjonalne** (domyślnie wyłączone). Ocena jest deterministyczna, oparta na jawnych regułach i wyjaśnialna — każdy punkt ma uzasadnienie i dowód.
- **Minimalizacja danych.** Zapisujemy fragmenty ±200 znaków oraz SHA-256 pełnej treści, a nie całe strony. Decyzje analityka są zapisane osobno i nie zmieniają obliczonego wyniku.
- **Raport.** Raport (HTML w aplikacji, PDF, JSON) oddziela FAKT (źródło, odnośnik, czas pobrania), OBLICZENIE (reguła, dane, wynik) i WNIOSEK (z poziomem pewności), ma sekcję „Ograniczenia” i skrót SHA-256 danych. PDF powstaje lokalnie (pdfmake, czcionka osadzona), bez przeglądarki i bez wysyłania danych na zewnątrz.
- **Klucze** tylko w pliku `.env` (szablon `.env.example`), nigdy w repozytorium.

## Licencje wykorzystanych komponentów
Zob. `LICENSES.md`.

## Wykorzystane zasoby
Zob. `docs/research-notes.md`.
