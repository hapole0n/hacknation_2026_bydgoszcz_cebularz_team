# KROPKA — prezentacja dla jury (treść slajdów)

Język: polski. 10 slajdów, 16:9 (1920×1080). Dane w przykładach są syntetyczne (sprawa demonstracyjna „Jan Testowy”).
Układ: siatka 12 kolumn (patrz prompt). Zrzuty P1–P8 opisane na końcu pliku.

---

## 01 · Okładka (tło granatowe)
- Eyebrow: HACKNATION 2026 · ZADANIE MF / KAS — OŁCyŚ
- Tytuł (znak słowny, VT323): KROPKA
- Podtytuł: Od śladu w sieci do adresu kryptowaluty — z oceną pewności, uzasadnieniem i raportem dla analityka KAS.
- Autor: Oleh Kropyva · zespół cebularz · stolik 8f · Bydgoszcz, 22.11.2026
- Wizual: P1 (okno „Nowa sprawa”), kolumny 7–12, może wychodzić poza prawą krawędź slajdu.
- Notatka: Dzień dobry. Nazywam się Oleh Kropyva, zespół cebularz. KROPKA odpowiada na jedno pytanie analityka KAS: czyj jest dany adres kryptowaluty i skąd to wiemy.

## 02 · Problem
- Eyebrow: PROBLEM
- Nagłówek: Ślad w sieci jest. Powiązania z adresem kryptowaluty — brak.
- Trzy karty z dużą liczbą (po 4 kolumny):
  1. **20 tys.** — tyle osób rocznie wykazuje kryptowaluty w PIT-38, przy ok. 2,5 mln Polaków, którzy je mają. Źródło: Bankier.pl, za danymi MF.
  2. **58%** — nielegalnego wolumenu kryptowalut w 2024 r. przeszło przez sieć TRON. Źródło: TRM Labs, 2025 Crypto Crime Report.
  3. **30.09.2027** — pierwsza wymiana danych DAC8, wyłącznie o transakcjach przez dostawców usług. Źródło: Komisja Europejska.
- Pas na dole (pełna szerokość): Portfele prywatne i transakcje P2P omijają pośredników. Dziś analityk łączy nick, e-mail czy ogłoszenie z adresem ręcznie — bez wspólnej skali oceny i bez zapisu, co sprawdzono.
- Notatka: Według danych MF kryptowaluty w PIT-38 wykazuje rocznie około 20 tysięcy osób, a ma je około 2,5 miliona Polaków. 58% nielegalnego wolumenu w 2024 roku to sieć TRON. DAC8 da dane od 2027 roku, ale tylko tam, gdzie jest pośrednik — portfele prywatne i P2P zostają poza nim.

## 03 · Rozwiązanie
- Eyebrow: ROZWIĄZANIE
- Nagłówek: Jedno pole, cztery kroki, jeden raport.
- Kolumny 1–5: cztery kroki pionowo, numer + tytuł + jedno zdanie:
  - 01 Identyfikatory — imię i nazwisko, e-mail, nick, komunikator lub adres; typ rozpoznawany automatycznie.
  - 02 Przeszukanie — źródła otwarte (GitHub, Gravatar, ENS, Wayback, Telegram) i blockchain (Ethereum, Tron, Bitcoin).
  - 03 Ocena — Wskaźnik Pewności 0–100 według załącznika KAS; fałszywe przypisania odrzucone z powodem.
  - 04 Raport — PDF, HTML i JSON z podziałem FAKT · OBLICZENIE · WNIOSEK; monitoring zmian.
- Kolumny 6–12: P2 z objaśnieniami: ① werdykt jednym zdaniem ② Wskaźnik Pewności ③ podstawa przypisania.
- Notatka: Analityk wkleja to, co ma; system sam rozpoznaje typ danych, przeszukuje źródła i blockchain, liczy wskaźnik według załącznika KAS i składa raport. Każde zapytanie trafia do Dziennika zapytań.

## 04 · Scenariusz demonstracyjny
- Eyebrow: SCENARIUSZ (DANE SYNTETYCZNE)
- Nagłówek: Jan Testowy: od 3 identyfikatorów do 3 pewnych adresów.
- Rząd liczb ze strzałkami (pełna szerokość): **3** identyfikatory → **13** dowodów → **10** adresów → **3** adresy ze wskaźnikiem 80–100.
- Trzy karty (po 4 kolumny):
  - 4 wykluczone — giełda Binance, kontrakt DEX, zbiórka, kantor; każdy z powodem i źródłem etykiety.
  - 2 przesłanki wypłaty — 3 przelewy do kantoru USDT ↔ gotówka, łącznie ≈ 68 800 zł.
  - Monitoring — zmiana adresu na stronie osoby wykryta przy kolejnej analizie, z powiadomieniem. Wizual w karcie: P8 (wycinek).
- Notatka: Trzy identyfikatory dają trzynaście dowodów i dziesięć adresów; trzy mają bardzo wysoki wskaźnik. Cztery odrzucamy, ale kantor zostaje jako kontrahent: trzy przelewy na około 68,8 tys. zł. Przy kolejnej analizie system wykrywa zmianę adresu i powiadamia analityka.

## 05 · Wskaźnik Pewności
- Eyebrow: KRYTERIUM · WSKAŹNIK PEWNOŚCI
- Nagłówek: Ocena 0–100 według załącznika KAS — każdy punkt z uzasadnieniem.
- Kolumny 1–6: tabela przedziałów:
  | Przedział | Ślad w źródle |
  |---|---|
  | 80–100 | oficjalny profil osoby |
  | 60–79 | ogłoszenie, oferta P2P, stopka e-mail, rozliczenie w komunikatorze |
  | 40–59 | dyskusja na forum |
  | 10–39 | masowe komentarze, giveaway |
  | 0 | giełda, zbiórka, mikser, kontrakt |
  | +15 | co najmniej 2 niezależne źródła |
  Pod tabelą: Reguły w pliku YAML (v1.1.0): wagi zmienia KAS bez programisty; wersja reguł trafia do każdego raportu.
- Kolumny 7–12: P3 z objaśnieniami: ① +85 oficjalny profil [FAKT] ② +15 dwa niezależne źródła ③ suma 115 → 100.
- Notatka: Oficjalny profil to 80–100, oferta P2P 60–79, forum 40–59, masowe komentarze 10–39, a giełdy, zbiórki, miksery i kontrakty dostają 0. Za dwa niezależne źródła jest +15. Każdy punkt widać w uzasadnieniu, z oznaczeniem, czy to fakt, czy obliczenie.

## 06 · Odrzucanie fałszywych przypisań
- Eyebrow: KRYTERIUM · ODRZUCANIE FAŁSZYWYCH PRZYPISAŃ
- Nagłówek: Giełdy, kontrakty i zbiórki odrzucamy — zawsze z powodem i źródłem.
- Kolumny 1–5: pięć reguł (etykieta + jedno zdanie):
  - GIEŁDA — etykiety z publicznych zbiorów i list Proof of Reserves
  - KONTRAKT — w blockchainie zapisany kod programu, a nie portfel
  - DEPOZYT — adres przekazuje środki dalej na giełdę
  - ZBIÓRKA, PRZYKŁAD — publiczne listy i adresy techniczne
  - INNA OSOBA — ten sam adres u wielu tożsamości: −20 pkt
- Kolumny 6–12: P4.
- Pas na dole: Test na 5 prawdziwych adresach publicznych (Binance, OKX, Uniswap, kontrakt USDT na TRON, adres zerowy): 5 z 5 wykluczonych z poprawnym powodem.
- Notatka: Giełdy rozpoznajemy po publicznych etykietach, kontrakty po kodzie w blockchainie, adresy depozytowe po tym, że przekazują środki na giełdę. Sprawdziliśmy to na pięciu prawdziwych adresach — wszystkie wykluczone z poprawnym powodem.

## 07 · Raport
- Eyebrow: KRYTERIUM · PRZEJRZYSTOŚĆ RAPORTU
- Nagłówek: Raport dla osoby bez wiedzy IT — fakt, obliczenie i wniosek osobno.
- Kolumny 1–6:
  - FAKT — to, co mówi źródło albo blockchain, z odnośnikiem i czasem pobrania
  - OBLICZENIE — wynik reguły programu; da się go odtworzyć
  - WNIOSEK — poziom pewności; wymaga weryfikacji przez człowieka
  - potem 4 krótkie punkty: 12 sekcji · PDF, HTML i JSON z tymi samymi danymi / skrót SHA-256 danych i wersja reguł / decyzje analityka zapisane osobno, z komentarzem / Dziennik zapytań: kiedy, w jakiej sprawie, dokąd, z jakim wynikiem
- Kolumny 7–12: P6a i P6b jako dwie nachodzące na siebie kartki raportu.
- Notatka: Każde zdanie raportu ma etykietę FAKT, OBLICZENIE albo WNIOSEK. W raporcie jest skrót SHA-256 danych i wersja reguł, a decyzje analityka są zapisane osobno.

## 08 · Ślad pieniędzy
- Eyebrow: ŚLAD PIENIĘDZY
- Nagłówek: Od adresu do gotówki: wycena NBP, progi AML, przelewy do kantoru.
- Kolumny 1–8: P5 z objaśnieniami: ① sumy w USDT i złotych ② oś dni: wpływy i przelewy do kantoru ③ progi AML.
- Kolumny 9–12: trzy fakty:
  - Wycena w PLN — kurs średni NBP z dnia poprzedzającego transakcję (art. 11a ustawy o PIT)
  - Progi AML — 1 000 / 10 000 / 15 000 EUR, pojedynczo i łącznie (art. 35 ust. 1 ustawy AML)
  - Monitoring — ponowna analiza co 15 min, 1 h lub 24 h; porównanie przebiegów; powiadomienia
- Notatka: Każdą transakcję wyceniamy w złotych kursem NBP z dnia poprzedzającego. System pilnuje progów z art. 35 ustawy AML, pojedynczo i łącznie, a monitoring powiadamia o zmianach.

## 09 · Oryginalność i wdrożenie
- Eyebrow: KRYTERIA · ORYGINALNOŚĆ I WDROŻENIE
- Nagłówek: Punkt startowy dla analizy blockchain — gotowy do pracy w sieci KAS.
- Kolumny 1–7: tabela porównania:
  | | Analiza blockchain (np. Chainalysis Reactor, TRM, Arkham) | KROPKA |
  |---|---|---|
  | Pytanie | Dokąd płyną środki z adresu? | Czyj to adres i skąd to wiemy? |
  | Wejście | adres, transakcja | nick, e-mail, komunikator, ogłoszenie |
  | Ocena | etykiety i modele dostawcy | jawne reguły z załącznika KAS |
  | Wdrożenie | licencja komercyjna | lokalnie, komponenty open source |
- Kolumny 8–12: architektura (lista): monorepo — NestJS, Prisma, PostgreSQL, React / docker compose — jedna komenda, bez chmury / AI tylko lokalne (Ollama), domyślnie wyłączone / ruch wychodzący tylko do dozwolonych hostów, każde zapytanie w dzienniku / ponad 400 testów; każde wymaganie zadania ma test
- Pas na dole: KROPKA nie zastępuje tych narzędzi — dostarcza im adres i uzasadnienie, od których zaczyna się śledzenie przepływów.
- Notatka: Narzędzia takie jak Chainalysis Reactor, TRM czy Arkham odpowiadają, dokąd płyną środki. My odpowiadamy wcześniej: czyj to adres i skąd to wiemy — według jawnych reguł KAS. Całość działa lokalnie, bez chmury.

## 10 · Koniec (tło granatowe)
- Nagłówek: Dziękuję za uwagę. Pytania?
- Kolumny 1–7, „Co dalej”: 1 Pilotaż na zanonimizowanych sprawach KAS i strojenie wag / 2 Etykiety KAS: własne listy adresów i dane z wniosków do giełd / 3 Kolejne sieci i źródła — po ocenie prawnej / 4 Integracja z systemami KAS: logowanie, eksport do akt
- Kolumny 8–12, karta kontaktowa: zdjęcie (assets/oleh.jpg — tylko jeśli plik istnieje), Oleh Kropyva · zespół cebularz · stolik 8f · mail@kropyva.com · github.com/hapole0n/hacknation_2026_bydgoszcz_cebularz_team + kod QR do repozytorium.
- Notatka: Dalsze kroki: pilotaż, etykiety KAS, kolejne sieci po ocenie prawnej i integracja. Dziękuję — chętnie odpowiem na pytania.

---

## Zrzuty dla prezentacji (P1–P8)
Robione od nowa, nie z docs/screenshots: Playwright, deviceScaleFactor 2, czysta baza z samą sprawą demonstracyjną, wycinki przez `locator.screenshot()`.
- P1 — okno „Nowa sprawa” z wpisanymi trzema identyfikatorami i listą rozpoznanych (samo okno, bez pulpitu i paska zadań).
- P2 — wynik analizy: werdykt, liczniki i tabela „Adresy przypisane osobie”.
- P3 — panel „Uzasadnienie oceny” dla adresu 0x8ae1…3A47 (od nagłówka do sumy).
- P4 — tabela „Wykluczone z przypisania osobie”.
- P5 — karta adresu TRON: nagłówek, cztery sumy, oś dni i początek listy transakcji; osobno ramka progów AML.
- P6a, P6b — raport (widok HTML): pierwsza strona oraz sekcja „Powiązane adresy i Wskaźnik Pewności”.
- P7 — Dziennik zapytań (rezerwowy).
- P8 — „Zmiany od poprzedniego przebiegu” po „Demo: symuluj zmianę”.

## Źródła liczb ze slajdu 02
- Bankier.pl: https://www.bankier.pl/wiadomosc/2-5-mln-Polakow-ma-krypto-a-20-tys-placi-podatki-Dlaczego-lepiej-to-zrobic-9123341.html
- TRM Labs: https://www.trmlabs.com/resources/blog/report-teaser-proportion-of-illicit-volume-of-crypto-dropped-51-in-2024
- Komisja Europejska (DAC8): https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en
