# Pokrzywa — Osintowy Łapacz Cyfrowych Śladów (OŁCyŚ)

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
TODO

## Zgodność i bezpieczeństwo
TODO — wyłącznie OSINT, przestrzeganie regulaminów źródeł, brak wysyłania danych do niezatwierdzonych usług, allowlista hostów i dziennik zapytań, AI wyłącznie lokalne i opcjonalne, minimalizacja danych, retencja.

## Licencje wykorzystanych komponentów
Zob. `LICENSES.md`.

## Wykorzystane zasoby
Zob. `docs/research-notes.md`.
