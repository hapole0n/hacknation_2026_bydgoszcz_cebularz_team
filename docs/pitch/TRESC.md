# KROPKA — prezentacja dla jury (treść slajdów, wersja 3)

Język: polski. 10 slajdów (maksimum), 16:9 (1920×1080). Dane w przykładach są syntetyczne (sprawa demonstracyjna „Jan Testowy”).
Styl: Win95 jak w poprzedniej wersji, wzorzec w `docs/pitch/win95/` (`deck.css`, `slides/*.html`). Zrzuty produktu stoją jako osobne okno produktu na pulpicie, obok okna prezentacji. Wzorzec: `win95/makieta.html`, `makieta-a.png` (slajd tekstowy) i `makieta-b.png` (slajd ze zrzutem).

**Zasada czytelności — obowiązuje na każdym slajdzie:**
- Jeden slajd to jedna myśl. Juror ma ją zrozumieć w 5 sekund.
- Nagłówek ma najwyżej 7 słów (VT323, co najmniej 84 px).
- Najwyżej 3 punkty po najwyżej 8 słów, tekst co najmniej 32 px.
- Drobny druk (24 px) tylko na źródła i zastrzeżenia, najwyżej jedna linia na slajd.
- Żadnych tabel ani akapitów.
- Zrzut pokazuje tylko element, o którym mówi slajd: duży (skala 1,3–2,0) i wypełniający kolumnę. Numery 1–3 w szynie między oknami są tymi samymi numerami co punkty po lewej. Osobnej legendy nie ma.

Myśl przewodnia: narzędzia blockchain pokazują, DOKĄD płyną pieniądze. KROPKA pokazuje, KTO stoi za adresem, także za nielegalnym kantorem P2P, na podstawie Telegrama, e-maila i ogłoszeń.

---

## 01 · Okładka
- Układ: okno + produkt. Okno produktu to P1 (własny pasek tytułu), bez numerów.
- Pasek tytułu okna: KROPKA — Osintowy Łapacz Cyfrowych Śladów
- Pole sunken u góry (24 px): HackNation 2026 · Bydgoszcz · zadanie MF i KAS (OŁCyŚ)
- Znak słowny (VT323, ok. 180 px): KROPKA
- Linia z kursorem (VT323): > Kto stoi za adresem?
- Jedno zdanie (32 px): Od Telegrama i e-maila do adresu kryptowaluty — dla analityka KAS.
- Autor (muted): Oleh Kropyva · zespół cebularz · stolik 8f
- Notatka: Dzień dobry, nazywam się Oleh Kropyva, zespół cebularz. KROPKA odpowiada na pytanie, którego nie rozwiąże sam blockchain: kto stoi za adresem kryptowaluty. Wystarczy nick, e-mail albo kanał na Telegramie.

## 02 · Problem
- Układ: pełne okno, bez zrzutu.
- Pasek tytułu okna: Problem
- Nagłówek: Kantor P2P nie jest w rejestrze
- Trzy pola sunken w rzędzie: duża liczba (VT323, ok. 150 px) + podpis (32 px):
  1. **20 tys.** — wykazuje krypto w PIT-38, a ma je 2,5 mln
  2. **58%** (kolor alert) — nielegalnego wolumenu w 2024 r.: sieć TRON
  3. **2027** — DAC8: tylko pośrednicy, bez P2P
- Pas na dole (ramka przerywana, 32 px): Ślad kantoru jest na Telegramie, w ogłoszeniu i w e-mailu.
- Drobny druk (jedna linia): Źródła: Bankier.pl (dane MF), TRM Labs, Komisja Europejska.
- Notatka: Kryptowaluty w PIT-38 wykazuje około 20 tysięcy osób rocznie, a ma je około 2,5 miliona Polaków. 58% nielegalnego wolumenu w 2024 roku przeszło przez sieć TRON. DAC8 da dane dopiero od 2027 roku i tylko od pośredników. Kantor P2P nie jest w żadnym rejestrze, ale ogłasza się na Telegramie i forach.

## 03 · Istota rozwiązania
- Układ: pełne okno, dokładnie jak `win95/makieta-a.png`.
- Pasek tytułu okna: Istota — kto, a nie dokąd
- Nagłówek w dwóch liniach (VT323, ok. 104 px): Blockchain pokazuje: DOKĄD. / KROPKA pokazuje: KTO.
- Dwa pola sunken obok siebie:
  - Lewe: [ NARZĘDZIA BLOCKCHAIN ] / adres → przepływy / Odpowiadają, dokąd płyną środki z adresu. / (muted) np. Chainalysis Reactor, TRM, Arkham
  - Prawe (zaznaczone granatową ramką): [ KROPKA ] / @Telegram · e-mail · ogłoszenie → osoba → adres / Odpowiada, kto stoi za adresem — także za kantorem P2P.
- Pas na dole: Nie zastępujemy tych narzędzi: dajemy im adres i uzasadnienie, od których zaczyna się śledzenie.
- Notatka: To jest sedno. Chainalysis, TRM czy Arkham pokazują, dokąd płyną pieniądze z adresu. KROPKA odpowiada wcześniej: kto za tym adresem stoi. Szukamy go tam, gdzie kantor naprawdę działa: na Telegramie, w ogłoszeniach i w e-mailach.

## 04 · Telegram i e-mail → adres
- Układ: okno + produkt. Okno produktu to P11 z rysowaną ramką „KROPKA — Przeszukane źródła”.
- Pasek tytułu okna: Źródła
- Nagłówek: E-mail i @Telegram → adres
- Punkty (numery = numery na zrzucie):
  - [1] E-mail → GitHub, Gravatar, stopki wiadomości
  - [2] @Telegram → kanały i ogłoszenia P2P
  - [3] Adres → kto jeszcze go publikuje
- Drobny druk: Telegram na żywo po ocenie prawnej; w demo dane syntetyczne.
- Numery na P11: ① wiersz „Adres e-mail” ② wiersz „Komunikator (Telegram i inne)” ③ wiersz „kto jeszcze je publikuje”
- Notatka: To nasza główna różnica. Z e-maila sprawdzamy commity na GitHubie, profil Gravatar i stopki wiadomości. Z identyfikatora komunikatora sprawdzamy kanały i ogłoszenia, a każdy znaleziony adres sprawdzamy odwrotnie. Każde zapytanie trafia do Dziennika zapytań.

## 05 · Kto stoi za adresem?
- Układ: okno + produkt. Okno produktu to P9 z rysowaną ramką „KROPKA — Kto stoi za adresem?”.
- Pasek tytułu okna: Szukanie odwrotne
- Nagłówek: Masz adres? Szukamy, kto go publikuje
- Punkty:
  - [1] Konto, które opublikowało adres — z oceną
  - [2] Inne adresy tego konta: sieć kantoru
  - [3] Ten sam nick to nie ta sama osoba
- Numery na P9: ① pierwsza karta konta (wskaźnik 90) ② druga karta (75) ③ karta „ten sam nick na innej platformie; możliwa inna osoba”
- Notatka: Gdy analityk ma tylko adres, na przykład z przelewu, KROPKA szuka odwrotnie: kto ten adres publikuje i jakie inne adresy publikują te same konta. Tak od jednego ogłoszenia dochodzimy do całej sieci kantoru. Zbieżność nicków nie wystarcza i system to wprost oznacza.

## 06 · Ślad gotówki — kantor P2P
- Układ: okno + produkt, dokładnie jak `win95/makieta-b.png`. Okno produktu to P5 z rysowaną ramką „KROPKA — Karta adresu TEonzw…GZey”.
- Pasek tytułu okna: Ślad gotówki — kantor P2P
- Nagłówek: Od ogłoszenia do gotówki
- Punkty:
  - [1] Przesłanka wypłaty do gotówki — oznaczona automatycznie
  - [2] 68 800 zł do kantoru USDT ↔ gotówka
  - [3] Przelewy na osi dni, w złotych wg kursu NBP
- Ramka przerywana: [ PROGI AML ] 1 000 · 10 000 · 15 000 EUR — przekroczone
- Drobny druk: Dane demonstracyjne, kantor syntetyczny.
- Numery na P5: ① etykieta „! PRZESŁANKA WYPŁATY DO GOTÓWKI” ② pole „DO USŁUGI WYPŁATY 68 800,35 zł” ③ wiersz listopada na osi dni
- Notatka: Kantor zostawia ślad w blockchainie: wiele małych wpływów USDT i przelewy na adres z ogłoszenia „USDT za gotówkę”. Każdą transakcję wyceniamy w złotych kursem NBP i pilnujemy progów z art. 35 ustawy AML. Gdy kantor zmieni adres na kanale, monitoring to wykryje i powiadomi analityka.

## 07 · Wskaźnik Pewności
- Układ: okno + produkt. Okno produktu to P3 (własny pasek tytułu), kadr wąski i skupiony.
- Pasek tytułu okna: Wskaźnik Pewności
- Nagłówek: Każdy punkt ma powód
- Punkty:
  - [1] +85 — adres na oficjalnym profilu
  - [2] +15 — dwa niezależne źródła
  - [3] Wynik 100: bardzo wysoki
- Ramka przerywana (30 px): Skala z załącznika KAS: oferta P2P i komunikator 60–79, profil 80–100, giełda 0.
- Numery na P3: ① `official` ② `synergy` ③ `total`
- Notatka: Wskaźnik liczymy według przedziałów z załącznika KAS. Oferta P2P i rozliczenie w komunikatorze to 60 do 79 punktów, oficjalny profil 80 do 100. Za dwa niezależne źródła jest +15. Każdy punkt widać w uzasadnieniu, z oznaczeniem, czy to fakt, obliczenie, czy wniosek.

## 08 · Odrzucanie fałszywych przypisań
- Układ: okno + produkt. Okno produktu to P4 z rysowaną ramką „KROPKA — Wykluczone z przypisania”.
- Pasek tytułu okna: Odrzucanie przypisań
- Nagłówek: Odrzucamy z powodem
- Punkty:
  - [1] Giełda — publiczna etykieta, 0 pkt
  - [2] Kantor — usługa, nie osoba
- Duża liczba (VT323, ok. 140 px): 5 z 5 + podpis (30 px): prawdziwych adresów wykluczonych poprawnie
- Drobny druk: Binance, OKX, Uniswap, kontrakt USDT, adres zerowy.
- Numery na P4: ① wiersz GIEŁDA ② wiersz KANTOR
- Notatka: Giełdy rozpoznajemy po publicznych etykietach, kontrakty po kodzie w blockchainie. Kantor nie jest portfelem osoby, więc go nie przypisujemy, ale przelewy do niego zapisujemy jako przesłankę wypłaty. Na pięciu prawdziwych adresach publicznych test dał pięć na pięć.

## 09 · Raport i wdrożenie
- Układ: pełne okno; po lewej pole sunken, po prawej okno potomne prezentacji „ARCHITEKTURA.TXT” (element prezentacji, nie zrzut). Oba na tę samą wysokość.
- Pasek tytułu okna: Raport i wdrożenie
- Nagłówek: Raport, który da się sprawdzić
- Lewe pole, trzy wiersze (etykieta + 3–5 słów, 32 px):
  - [FAKT] źródło, odnośnik, czas pobrania
  - [OBLICZENIE] reguła — da się powtórzyć
  - [WNIOSEK] ocena — sprawdza człowiek
- ARCHITEKTURA.TXT (lista, pierwsza pozycja zaznaczona, 32 px):
  - Lokalnie, bez chmury
  - Każde zapytanie w dzienniku
  - SHA-256 i wersja reguł w raporcie
  - Ponad 400 testów
- Notatka: Raport jest napisany dla osoby bez wiedzy IT: każde zdanie ma etykietę fakt, obliczenie albo wniosek. Skrót SHA-256 i wersja reguł pozwalają sprawdzić, że raport opisuje dokładnie te dane. Całość działa lokalnie w Dockerze, bez chmury.

## 10 · Koniec
- Układ: pełne okno jak w poprzedniej wersji (`win95/slides/dalej.html`), z mniejszą ilością tekstu.
- Pasek tytułu okna: Koniec
- Nagłówek (VT323, duży): Dziękuję za uwagę!
- Linia z kursorem: Pytania?
- CO DALEJ (lista, pierwsza pozycja zaznaczona, 32 px):
  - [1] Pilotaż na sprawach KAS
  - [2] Etykiety kantorów od KAS
  - [3] Telegram na żywo po ocenie prawnej
- Po prawej: OLEH.JPG (tylko jeśli plik istnieje) i KONTAKT: Oleh Kropyva · mail@kropyva.com · kod QR do repozytorium (pod kodem krótko: github.com/hapole0n).
- Notatka: Dalsze kroki to pilotaż na zanonimizowanych sprawach, etykiety kantorów od KAS i Telegram na żywo po ocenie prawnej. Dziękuję, chętnie odpowiem na pytania.

---

## Zrzuty dla prezentacji
Robione przez `scripts/pitch/capture.mjs`: Playwright, deviceScaleFactor 2, czysta baza z samą sprawą demonstracyjną, `locator.screenshot()` lub `clip`.
Każdy kadr jest **skupiony**: tylko element, o którym mówi slajd. Wolno ukryć elementy drugorzędne (kody reguł, przełączniki „Dowody”, „Rozbicie oceny”, adresy URL, linki). Nigdy nie wolno zmieniać liczb ani tekstów. Szerokość widoku dobieramy tak, żeby kadr wypełnił okno produktu w skali 1,3–2,0 (okładka: co najmniej 1,2).
- P1 — okno „Nowa sprawa”: pasek tytułu, „> Wprowadź dane osoby”, pole z trzema identyfikatorami i lista rozpoznanych. Bez pól wyboru i linków na dole. Slajd 01.
- P3 — „Uzasadnienie oceny” dla 0x8ae1…3A47 (wąski kadr, bez kodów reguł i przełączników „Dowody”). Slajd 07.
- P4 — „Wykluczone z przypisania osobie” (wąski kadr). Slajd 08.
- P5 — karta adresu TRON: adres, etykieta przesłanki, cztery sumy, oś dni. Slajd 06.
- P9 (nowy) — „Demonstracja: kto stoi za adresem?” → „Konta, które opublikowały adres”: trzy pierwsze karty, bez adresów URL i przełączników. Slajd 05.
- P11 (nowy) — „Przeszukane źródła” na stronie analizy: tabela źródło / czego szukano / wynik. Slajd 04.
- Rezerwowe (bez zmian): P2, P5b, P6a, P6b, P7, P8.

## Źródła liczb ze slajdu 02
- Bankier.pl: https://www.bankier.pl/wiadomosc/2-5-mln-Polakow-ma-krypto-a-20-tys-placi-podatki-Dlaczego-lepiej-to-zrobic-9123341.html
- TRM Labs: https://www.trmlabs.com/resources/blog/report-teaser-proportion-of-illicit-volume-of-crypto-dropped-51-in-2024
- Komisja Europejska (DAC8): https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en
