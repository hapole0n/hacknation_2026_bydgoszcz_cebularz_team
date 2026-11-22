# Styl prezentacji Win95 — materiał wzorcowy

Pliki pomocnicze do prezentacji `docs/pitch`. Nie są częścią budowania (`pnpm pitch` ich nie czyta).

| Plik | Co to jest |
|---|---|
| `deck.css`, `slides/*.html` | Poprzednia wersja prezentacji w stylu Win95. **Styl obowiązuje bez zmian**: pulpit `#2F6F6F`, pasek zadań z trzema przyciskami i paskiem postępu slajdów, okno z granatowym paskiem tytułu (— ▼ ▲), nagłówki VT323, tekst IBM Plex Mono, białe pola „sunken”, ramki przerywane, listy z zaznaczoną pozycją, etykiety `[ … ]`. **Nie obowiązuje**: ilość tekstu (było go za dużo i był za mały) i zrzuty wstawione jako okno w oknie. |
| `makieta.html`, `makieta-a.png`, `makieta-b.png` | Wzorzec wersji 3. `a` to slajd tekstowy (istota rozwiązania), `b` to slajd ze zrzutem (ślad gotówki). Tak ma wyglądać każdy slajd. |

## Czytelność (najważniejsze)

- Jeden slajd to jedna myśl. Juror ma ją zrozumieć w 5 sekund.
- Nagłówek ma najwyżej 7 słów (VT323, co najmniej 84 px).
- Najwyżej 3 punkty po najwyżej 8 słów, tekst co najmniej 32 px.
- Drobny druk (24 px) tylko na źródła i zastrzeżenia, najwyżej jedna linia.
- Żadnych tabel ani akapitów.

## Zrzuty produktu

1. Zrzut jest osobnym **oknem produktu na pulpicie**, obok okna prezentacji, a nie w jego środku. Między oknami jest szyna 72 px. Oba okna zaczynają się na y = 36 i kończą na y = 972.
2. Każdy zrzut ma **dokładnie jedną ramkę okna**:
   - jeśli kadr ma własny pasek tytułu produktu (P1, P3), pokazujemy go bez zmian;
   - jeśli nie ma, rysujemy ramkę jak w produkcie: granatowy pasek 48 px, prawdziwy tytuł okna, przyciski — ▼ ▲.
   - Obszar okna ma dokładnie rozmiar obrazu: bez passe-partout i bez `object-fit: contain`.
3. Kadr jest **skupiony** (tylko element, o którym mówi slajd), w skali 1,3–2,0 (2x, ostry) i **wypełnia okno produktu**. Skalę i wycinek dobieramy szerokością widoku w `capture.mjs`.
4. Objaśnienia mają kolor bursztynowy `#E8A317`:
   - najwyżej 3 ramki 4 px z ciemnym obrysem, 8 px od elementu;
   - numer 44 × 44 stoi w szynie między oknami i łączy się z ramką linią;
   - linia biegnie pustym pasem między wierszami i **nie przecina tekstu produktu**.
5. Numery na zrzucie są tymi samymi numerami co punkty po lewej. Osobnej legendy nie ma.
