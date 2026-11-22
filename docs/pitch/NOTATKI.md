# KROPKA — notatki do wystąpienia

Plik generowany przez `pnpm pitch` z `TRESC.md` (pole „Notatka” każdego slajdu) — nie edytować ręcznie. Przykłady w prezentacji są syntetyczne (sprawa demonstracyjna „Jan Testowy”).

## 01 · Okładka

Dzień dobry. Nazywam się Oleh Kropyva, zespół cebularz. KROPKA odpowiada na jedno pytanie analityka KAS: czyj jest dany adres kryptowaluty i skąd to wiemy.

## 02 · Problem

Według danych MF kryptowaluty w PIT-38 wykazuje rocznie około 20 tysięcy osób, a ma je około 2,5 miliona Polaków. 58% nielegalnego wolumenu w 2024 roku to sieć TRON. DAC8 da dane od 2027 roku, ale tylko tam, gdzie jest pośrednik — portfele prywatne i P2P zostają poza nim.

## 03 · Rozwiązanie

Analityk wkleja to, co ma; system sam rozpoznaje typ danych, przeszukuje źródła i blockchain, liczy wskaźnik według załącznika KAS i składa raport. Każde zapytanie trafia do Dziennika zapytań.

## 04 · Scenariusz demonstracyjny

Trzy identyfikatory dają trzynaście dowodów i dziesięć adresów; trzy mają bardzo wysoki wskaźnik. Cztery odrzucamy, ale kantor zostaje jako kontrahent: trzy przelewy na około 68,8 tys. zł. Przy kolejnej analizie system wykrywa zmianę adresu i powiadamia analityka.

## 05 · Wskaźnik Pewności

Oficjalny profil to 80–100, oferta P2P 60–79, forum 40–59, masowe komentarze 10–39, a giełdy, zbiórki, miksery i kontrakty dostają 0. Za dwa niezależne źródła jest +15. Każdy punkt widać w uzasadnieniu, z oznaczeniem, czy to fakt, czy obliczenie.

## 06 · Odrzucanie fałszywych przypisań

Giełdy rozpoznajemy po publicznych etykietach, kontrakty po kodzie w blockchainie, adresy depozytowe po tym, że przekazują środki na giełdę. Sprawdziliśmy to na pięciu prawdziwych adresach — wszystkie wykluczone z poprawnym powodem.

## 07 · Raport

Każde zdanie raportu ma etykietę FAKT, OBLICZENIE albo WNIOSEK. W raporcie jest skrót SHA-256 danych i wersja reguł, a decyzje analityka są zapisane osobno.

## 08 · Ślad pieniędzy

Każdą transakcję wyceniamy w złotych kursem NBP z dnia poprzedzającego. System pilnuje progów z art. 35 ustawy AML, pojedynczo i łącznie, a monitoring powiadamia o zmianach.

## 09 · Oryginalność i wdrożenie

Narzędzia takie jak Chainalysis Reactor, TRM czy Arkham odpowiadają, dokąd płyną środki. My odpowiadamy wcześniej: czyj to adres i skąd to wiemy — według jawnych reguł KAS. Całość działa lokalnie, bez chmury.

## 10 · Koniec

Dalsze kroki: pilotaż, etykiety KAS, kolejne sieci po ocenie prawnej i integracja. Dziękuję — chętnie odpowiem na pytania.

## Źródła liczb ze slajdu 02

- Bankier.pl: https://www.bankier.pl/wiadomosc/2-5-mln-Polakow-ma-krypto-a-20-tys-placi-podatki-Dlaczego-lepiej-to-zrobic-9123341.html
- TRM Labs: https://www.trmlabs.com/resources/blog/report-teaser-proportion-of-illicit-volume-of-crypto-dropped-51-in-2024
- Komisja Europejska (DAC8): https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en
