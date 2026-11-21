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
| `12-dziennik-zapytan.png` | Dziennik zapytań: zdarzenia z rzeczywistych analiz (sandbox, NBP, Wayback, Gravatar, ENS) |
| `13-sprawa-monitoring-i-zmiana.png` | sprawa: monitoring (wył. / 15 min / 1 h / 24 h, „Uruchom teraz”), historia analiz ze zmianami, przycisk „Demo: symuluj zmianę” |
| `14-zmiany-od-poprzedniego-przebiegu.png` | blok „Zmiany od poprzedniego przebiegu”: zmiana adresu w tym samym źródle, nowy adres, nowe transakcje, przekroczone progi, sygnał wyjścia do gotówki |
| `15-powiadomienia.png` | dzwonek z licznikiem i lista powiadomień |
| `16-raport-sekcja-8-zmiany.png` | raport, sekcja 8 „Zmiany od poprzedniego przebiegu” |

## Monitoring i zmiany w czasie
- **Monitoring:** każda sprawa ma harmonogram (wyłączony / co 15 min / co godzinę / co 24 h) zapisany w bazie, więc przeżywa restart. Przycisk „Uruchom teraz” uruchamia analizę od razu. Historia analiz jest na stronie sprawy.
- **Porównanie przebiegów:** każda kolejna analiza jest porównywana z poprzednią: nowe i zniknięte adresy, zmiany Wskaźnika Pewności **z podaniem reguły**, zmiany kategorii, nowe transakcje, nowe przekroczenia progów 1 000 / 10 000 / 15 000 EUR, nowe sygnały wyjścia do gotówki oraz **zmiana adresu w tym samym źródle**. Wynik jest w aplikacji („Zmiany od poprzedniego przebiegu”) i w raporcie (sekcja 8).
- **Powiadomienia:** dzwonek w aplikacji (bez zewnętrznych usług): nowy adres z oceną ≥ 60, zmiana adresu, przekroczenie progu, nowy wskaźnik wyjścia do gotówki.
- **Demo zmiany adresu:** na stronie sprawy demonstracyjnej „Demo: symuluj zmianę” podmienia stronę persony A w sztucznym internecie (inny, sztuczny adres). Kolejna analiza pokazuje różnicę i powiadomienia.
- **Dodatkowe źródła (opt-in):** Wayback Machine (kopie stron: jaki adres był i kiedy), Gravatar (e-mail → profil; portfele tylko z kluczem `GRAVATAR_API_KEY`, bez klucza pomijane z adnotacją), GitHub (profil, README, a dla adresu e-mail także commity po `author-email` — bez tokenu; token potrzebny tylko do wyszukiwania adresu w kodzie), ENS (adres ↔ nazwa `.eth` i rekordy tekstowe przez publiczny RPC), Telegram (publiczna karta `t.me/<nazwa>` i podgląd kanału `t.me/s/<nazwa>`; patrz niżej). Podmioty syntetyczne obsługuje wyłącznie sztuczny internet.
- **Dziennik wyszukiwania („Przeszukane źródła”):** każda analiza zapisuje, co każde źródło zrobiło z każdym identyfikatorem: znaleziono N zasobów z adresami / brak wyników / profil nie znaleziony / błąd / pominięto (brak klucza lub wyłączony dostęp) / źródło nie sprawdza tego typu. Pusty wynik czyta się więc jako „Przeszukano N źródeł — nie znaleziono adresów”, a nie jako awarię. Tabela jest na stronie analizy i w sekcji 2 raportu; formularz nowej sprawy pokazuje przy każdym typie identyfikatora, które źródła go sprawdzają.
- **Telegram — ograniczenie.** `t.me/robots.txt` odpowiada 404 (brak zastrzeżeń, sprawdzono 21.11.2026), ale regulamin Telegrama („Content Licensing and AI Scraping”, telegram.org/tos/content-licensing) ogranicza dostęp do treści użytkowników do zwykłego korzystania z platformy. Dlatego dostęp na żywo do t.me jest **domyślnie wyłączony** (`TELEGRAM_LIVE=false`); sztuczne nazwy obsługuje mini-internet (`fixtures/sandbox-web/tme`), a prawdziwa nazwa bez włączonego dostępu jest w dzienniku oznaczona jako „pominięto”. Układ stron t.me sprawdzono tylko na fixturach, nie na żywym serwisie.
- **Lokalny AI (opcjonalny, domyślnie wyłączony):** model przez API zgodne z OpenAI (np. Ollama) podpowiada typ kontekstu tam, gdzie reguły słów kluczowych niczego nie znalazły. Podpowiedź jest oznaczona „Sugestia AI” i nie zmienia oceny.

## Zgodność i bezpieczeństwo
- **Wyłącznie OSINT.** Jawne, legalne źródła; oficjalne API tam, gdzie istnieją; przestrzeganie regulaminów i robots.txt źródeł. Bez logowania na cudze konta, wycieków, omijania zabezpieczeń i skanowania podatności.
- **Dane syntetyczne.** Fixtures, testy i demo używają wyłącznie danych sztucznych. Źródła „na żywo” są opt-in dla każdej analizy i służą tylko do pokazu na własnych stronach person syntetycznych lub instytucjonalnych przykładach publicznych (giełdy, routery DEX, zbiórki).
- **Brak wysyłania danych do niezatwierdzonych usług.** Każde zapytanie wychodzące przechodzi przez `EgressClient`: allowlista hostów (`config/egress-allowlist.yaml`), limit zapytań na host, cache i wpis w dzienniku. Brak telemetrii, brak skryptów i czcionek z CDN.
- **Dziennik zapytań.** Strona „Dziennik zapytań” pokazuje każde zapytanie: czas, sprawę, źródło, serwer, ścieżkę bez parametrów i wynik. Zapytania zablokowane przez allowlistę i błędy sieci są wyróżnione. Dziennik nie przechowuje treści odpowiedzi ani parametrów zapytań (tam mogą być klucze API).
- **AI wyłącznie lokalne i opcjonalne** (domyślnie wyłączone). Ocena jest deterministyczna, oparta na jawnych regułach i wyjaśnialna — każdy punkt ma uzasadnienie i dowód.
- **Minimalizacja danych.** Zapisujemy fragmenty ±200 znaków oraz SHA-256 pełnej treści, a nie całe strony. Decyzje analityka są zapisane osobno i nie zmieniają obliczonego wyniku.
- **Raport.** Raport (HTML w aplikacji, PDF, JSON) oddziela FAKT (źródło, odnośnik, czas pobrania), OBLICZENIE (reguła, dane, wynik) i WNIOSEK (z poziomem pewności), ma sekcję „Ograniczenia” i skrót SHA-256 danych. PDF powstaje lokalnie (pdfmake, czcionka osadzona), bez przeglądarki i bez wysyłania danych na zewnątrz.
- **Ograniczenie: etykiety giełd w sieci TRON.** Dla OKX używamy publicznego pliku Proof of Reserves (79 dużych portfeli). Dla Binance oficjalny, publiczny (bez logowania) jest tylko wpis „Our Commitment To Transparency” z listopada 2022 — 8 adresów TRX, jawnie „niekompletny zbiór danych”; aktualny plik adresów Proof of Reserves Binance jest za logowaniem i **nie jest używany**. Pozostałe portfele Binance w TRON wykrywa heurystyka (adres depozytowy / zachowanie usługi), a nie etykieta, więc mogą być sklasyfikowane słabiej.
- **Klucze** tylko w pliku `.env` (szablon `.env.example`), nigdy w repozytorium.

## Licencje wykorzystanych komponentów
Zob. `LICENSES.md`.

## Wykorzystane zasoby
Zob. `docs/research-notes.md`.
