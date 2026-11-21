# Research notes (→ README "Wykorzystane zasoby")

## Progi kwotowe (AML) — wskaźnik „znaczne wartości”
Ustawa z 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu, art. 35 ust. 1 (środki bezpieczeństwa finansowego):
- transakcja okazjonalna o równowartości **15 000 EUR** lub większej (pojedyncza lub kilka powiązanych operacji);
- transfer środków pieniężnych na kwotę przekraczającą **1 000 EUR**;
- transakcja z wykorzystaniem **waluty wirtualnej** o równowartości **1 000 EUR** lub większej (instytucje obowiązane z art. 2 ust. 1 pkt 12);
- gotówkowa transakcja okazjonalna o równowartości **10 000 EUR** lub większej (dla wskazanych instytucji).
Źródło tekstu: https://prawnik.cc/laws/ustawa-o-przeciwdzialaniu-praniu-pieniedzy/rozdzial-5-srodki-bezpieczenstwa-finansowego-art-35-stosowanie-srodkow-bezpieczenstwa (tekst jednolity Dz.U. 2025 poz. 644 — numerację punktów zweryfikować w ISAP).
Użycie w aplikacji: progi T1 = 1 000 EUR, T2 = 10 000 EUR, T3 = 15 000 EUR. To przesłanki analityczne, nie kwalifikacja prawna.

## Przeliczenie na PLN
Art. 11a ust. 1 ustawy o PIT — przychody w walutach obcych przelicza się na złote po kursie średnim NBP z ostatniego dnia roboczego poprzedzającego dzień uzyskania przychodu (zweryfikować brzmienie w ISAP).
API NBP (tabela A, kurs średni): `https://api.nbp.pl/api/exchangerates/rates/A/{EUR|USD}/{YYYY-MM-DD}/?format=json` — dla dni bez notowań cofać się do poprzedniego dnia roboczego.

## Polskie źródła Web2 (formaty wzorcowe dla danych syntetycznych)
- Wykop.pl, tagi #kryptowaluty #bitcoin — m.in. ogłoszenia typu „Sprzedam BTC za gotówkę, Warszawa i Częstochowa”, pytania o kantory i zakup bez KYC.
- forum.bitcoin.pl — polskie forum o kryptowalutach (wątki o serwisach).
- gdziekrypto.pl — katalog miejsc wymiany kryptowalut za gotówkę (wspominany na Wykopie).
- Kryptobankomaty (np. bitomat.com) — punkty cash-out.
- Reklamy kantorów „USDT ↔ gotówka” w Instagram/Facebook — w produkcji: integracja z Meta Ad Library (przejrzystość reklam w UE), w demo: wyłącznie syntetyczne.
- Telegram: publiczne kanały (podgląd `t.me/s/<kanał>`).
W demo wszystkie treści o osobach są syntetyczne (wzorowane na powyższych formatach).

## Etykiety adresów (Web3)
- Etherscan name tags przez API to endpoint PRO (plan Pro Plus) — nie używamy: https://docs.etherscan.io/api-reference/endpoint/getaddresstag
- dawsbot/eth-labels — publiczny zbiór etykiet adresów, licencja MIT: https://github.com/dawsbot/eth-labels
- brianleect/etherscan-labels — zrzut etykiet sieci EVM (JSON/CSV), licencja MIT: https://github.com/brianleect/etherscan-labels
- Bytecode: Etherscan proxy `eth_getCode` (plan darmowy).
- W produkcji: licencjonowane źródło etykiet lub własna baza KAS — interfejs `LabelProvider`.

## API i limity
- Etherscan: każde zapytanie wymaga klucza; plan darmowy 3 zapytania/s i do 100 000 dziennie; wymagana atrybucja („Powered by Etherscan”). https://docs.etherscan.io
- TronGrid: zapytania bez klucza są mocno ograniczane lub odrzucane; nagłówek `TRON-PRO-API-KEY`; plan darmowy ok. 100 000 zapytań dziennie. https://developers.tron.network/reference/rate-limits
- mempool.space: publiczne REST API bez klucza — szanować limity, cache.
- Gravatar API v3: `payments.crypto_wallets` tylko w zapytaniach z kluczem API; identyfikator = SHA-256 znormalizowanego e-maila. https://docs.gravatar.com/api/rest-api
- GitHub REST: bez tokena 60 zapytań/h, z tokenem 5 000/h; `/search/code` wymaga tokena.
- Wayback CDX: `https://web.archive.org/cdx/search/cdx?url=<url>&output=json`
