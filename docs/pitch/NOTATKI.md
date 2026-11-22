# KROPKA — notatki do wystąpienia

Plik generowany przez `pnpm pitch` z `TRESC.md` (pole „Notatka” każdego slajdu) — nie edytować ręcznie. Przykłady w prezentacji są syntetyczne (sprawa demonstracyjna „Jan Testowy”).

## 01 · Okładka

Dzień dobry, nazywam się Oleh Kropyva, zespół cebularz. KROPKA odpowiada na pytanie, którego nie rozwiąże sam blockchain: kto stoi za adresem kryptowaluty. Wystarczy nick, e-mail albo kanał na Telegramie.

## 02 · Problem

Kryptowaluty w PIT-38 wykazuje około 20 tysięcy osób rocznie, a ma je około 2,5 miliona Polaków. 58% nielegalnego wolumenu w 2024 roku przeszło przez sieć TRON. DAC8 da dane dopiero od 2027 roku i tylko od pośredników. Kantor P2P nie jest w żadnym rejestrze, ale ogłasza się na Telegramie i forach.

## 03 · Istota rozwiązania

To jest sedno. Chainalysis, TRM czy Arkham pokazują, dokąd płyną pieniądze z adresu. KROPKA odpowiada wcześniej: kto za tym adresem stoi. Szukamy go tam, gdzie kantor naprawdę działa: na Telegramie, w ogłoszeniach i w e-mailach.

## 04 · Telegram i e-mail → adres

To nasza główna różnica. Z e-maila sprawdzamy commity na GitHubie, profil Gravatar i stopki wiadomości. Z identyfikatora komunikatora sprawdzamy kanały i ogłoszenia, a każdy znaleziony adres sprawdzamy odwrotnie. Każde zapytanie trafia do Dziennika zapytań.

## 05 · Kto stoi za adresem?

Gdy analityk ma tylko adres, na przykład z przelewu, KROPKA szuka odwrotnie: kto ten adres publikuje i jakie inne adresy publikują te same konta. Tak od jednego ogłoszenia dochodzimy do całej sieci kantoru. Zbieżność nicków nie wystarcza i system to wprost oznacza.

## 06 · Ślad gotówki — kantor P2P

Kantor zostawia ślad w blockchainie: wiele małych wpływów USDT i przelewy na adres z ogłoszenia „USDT za gotówkę”. Każdą transakcję wyceniamy w złotych kursem NBP i pilnujemy progów z art. 35 ustawy AML. Gdy kantor zmieni adres na kanale, monitoring to wykryje i powiadomi analityka.

## 07 · Wskaźnik Pewności

Wskaźnik liczymy według przedziałów z załącznika KAS. Oferta P2P i rozliczenie w komunikatorze to 60 do 79 punktów, oficjalny profil 80 do 100. Za dwa niezależne źródła jest +15. Każdy punkt widać w uzasadnieniu, z oznaczeniem, czy to fakt, obliczenie, czy wniosek.

## 08 · Odrzucanie fałszywych przypisań

Giełdy rozpoznajemy po publicznych etykietach, kontrakty po kodzie w blockchainie. Kantor nie jest portfelem osoby, więc go nie przypisujemy, ale przelewy do niego zapisujemy jako przesłankę wypłaty. Na pięciu prawdziwych adresach publicznych test dał pięć na pięć.

## 09 · Raport i wdrożenie

Raport jest napisany dla osoby bez wiedzy IT: każde zdanie ma etykietę fakt, obliczenie albo wniosek. Skrót SHA-256 i wersja reguł pozwalają sprawdzić, że raport opisuje dokładnie te dane. Całość działa lokalnie w Dockerze, bez chmury.

## 10 · Koniec

Dalsze kroki to pilotaż na zanonimizowanych sprawach, etykiety kantorów od KAS i Telegram na żywo po ocenie prawnej. Dziękuję, chętnie odpowiem na pytania.

## Źródła liczb ze slajdu 02

- Bankier.pl: https://www.bankier.pl/wiadomosc/2-5-mln-Polakow-ma-krypto-a-20-tys-placi-podatki-Dlaczego-lepiej-to-zrobic-9123341.html
- TRM Labs: https://www.trmlabs.com/resources/blog/report-teaser-proportion-of-illicit-volume-of-crypto-dropped-51-in-2024
- Komisja Europejska (DAC8): https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en
