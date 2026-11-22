# Redesign interfejsu — stan

Wygląd i ekrany wg `docs/design/SPEC.md` i makiet `docs/design/mockup-*.dc.html` (zatwierdzone 21.11.2026). Zrobione na gałęzi `feat/redesign`.

- [x] Wspólne komponenty (`apps/web/src/components/win/`): okno, pasek tytułu, menu, pasek narzędzi, przyciski z fazą, panele wklęsłe, ramki grup, tabele danych, bloki wskaźnika, pasek skrótów, pasek zadań, okno potomne.
- [x] Ekrany: Nowa sprawa, Wynik analizy, Karta adresu, Rejestr spraw, Graf, Dziennik zapytań, Raport (HTML), Powiadomienia; Pomoc (F1) i Ustawienia (F10) jako okna dialogowe.
- [x] Raport PDF: jasny, IBM Plex Mono + VT323, te same kolory (`apps/api/src/report/pdf.ts`).
- [x] **Stopka / pasek zadań: „Powered by Etherscan.io APIs”** (wymóg regulaminu darmowego planu Etherscan API) — na każdym ekranie, bez ładowania czegokolwiek z zewnątrz.
- [x] Zrzuty ekranu w `docs/screenshots/` odświeżone na czystej bazie, wyłącznie z rzeczywistych przebiegów aplikacji.
- [x] Czcionki lokalnie przez `@fontsource` (interfejs) i pliki w `apps/api/assets/fonts/` (PDF); `LICENSES.md` zaktualizowany.

Znane ograniczenia interfejsu: układ był sprawdzany ręcznie w Chromium (bez automatycznych testów w przeglądarce); klawisze F, które przeglądarka zachowuje dla siebie, są wykrywane heurystycznie (utrata fokusu okna zaraz po klawiszu) — zamiennik Alt+cyfra działa zawsze.
