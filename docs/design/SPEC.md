# KROPKA — UI spec (approved mockup, 21.11.2026)

Reference markup: `mockup-start.dc.html`, `mockup-wynik.dc.html`, `mockup-adres.dc.html`
(design-canvas format: read the inline styles and texts; `{{…}}`, `<sc-for>`, `<sc-if>` are template syntax, not real HTML).
Data in the mockup is synthetic (persona "Jan Testowy").

## Look
Classic desktop-window UI (Windows 95 era) + terminal accents. Serious, official tone. Same style as the author's Proseminarium deck.
No rounded corners, no blur shadows, no gradients, no emoji, no illustrations, no mascots.

## Tokens
| token | value | use |
|---|---|---|
| desktop | `#2F6F6F` | page background around the app window |
| face | `#C3C3C3` | window body, buttons, menus |
| face-pressed | `#B7B7B7` | pressed / current button |
| paper | `#FFFFFF` | sunken data panels, inputs, tables |
| navy | `#1C2F7A` | title bars, selection (white text), links, score blocks, VT323 headings |
| ink | `#2A2A2A` | text; dark bevel edge |
| shadow | `#6E6E6E` | bevel shadow, empty score blocks |
| light | `#FFFFFF` / `#DFDFDF` | bevel highlight |
| rule | `#9A9A9A` dashed | row separators |
| alert | `#8A2B0E` | ONLY: thresholds exceeded, exclusions, cash-out signals |
| secondary text | `#555555` on paper, `#444444` on face | never `#6E6E6E` for text (contrast) |

Fonts: **IBM Plex Mono** (whole UI, 400/600/700), **VT323** (large headings only). Both OFL — ship locally via `@fontsource/ibm-plex-mono` and `@fontsource/vt323`, no CDN; list in LICENSES.md.

## Components
- **Raised bevel** (window, buttons): `border:2px solid; border-color:#FFF #2A2A2A #2A2A2A #FFF; box-shadow: inset -1px -1px 0 #6E6E6E, inset 1px 1px 0 #DFDFDF`.
- **Pressed bevel** (current tab/button): colors inverted, background `#B7B7B7`.
- **Default button** (main action): raised bevel + `outline:1px solid #2A2A2A`, bold.
- **Sunken panel / input**: `background:#FFF; border:2px solid; border-color:#6E6E6E #FFF #FFF #6E6E6E; box-shadow: inset 1px 1px 0 #2A2A2A`.
- **Group box**: 1px `#6E6E6E` etched border (+ white inset/outer 1px), title sitting on the top line on face background.
- **Window**: navy title bar (white, 600) with system box left and ▼▲ right; menu bar `Sprawa / Widok / Raport / Pomoc` (first letter underlined); toolbar of bevel buttons with key labels; status bar at the bottom (sunken cells with F-keys + state text).
- **Child window**: small window inside the main one (e.g. "Uzasadnienie oceny — adres A1"), navy title bar.
- **Table**: on paper; header row bold, `border-bottom:3px double #2A2A2A`; rows separated by `1px dashed #9A9A9A`; tags in brackets: `[ GIEŁDA ]`, `[ KONTRAKT ]` (alert color when it is an exclusion/alarm).
- **Score**: 10 navy blocks (filled) / outlined blocks (empty) in a sunken strip + number + band name ("przedział 80–100 (BARDZO WYSOKI)").
- **Selection**: navy background, white text (rows, current step, current list item).
- **Taskbar**: bottom of the page, face color, bevel buttons for open cases (current pressed) and a sunken tray: `PROTOTYP · DANE SYNTETYCZNE` · `Powered by Etherscan.io APIs` · time.
- Interactive targets ≥ 44 px high.

## Screens
1. **Nowa sprawa**: welcome console (scope: open sources only; every request logged), VT323 `> Wprowadź dane osoby` + block cursor as the input label, ONE input for all identifiers with live type detection ("Rozpoznane identyfikatory"), optional field "Numer postępowania / podstawa" (stored in the case, audit log and report), source checkboxes, default button "Rozpocznij analizę (Enter)", demo-case link, "Przebieg analizy" [1]–[4], "Rejestr spraw" with case signature `KR/YYYY/NNNN`.
2. **Wynik analizy**: case line + steps [1]–[5], VT323 one-sentence verdict, counters in a sunken `<pre>` with dot leaders, table "Adresy przypisane osobie" + child window "Uzasadnienie oceny" (row button selects), analyst comment + "Potwierdź przypisanie / Odrzuć przypisanie", "Przesłanki wypłaty do gotówki", "Wykluczone z przypisania osobie", "Przeszukane źródła" with query time.
3. **Karta adresu**: address in VT323, tags, 4 totals, month strip of days (navy = inflow, alert = transfer to exchange service), transaction list with [FAKT]/[OBLICZENIE] and NBP rate line (art. 11a PIT), thresholds (art. 35 ust. 1 ustawy AML) as block meters, counterparties, "Rekomendowane dalsze czynności".
Graph, audit log ("Dziennik zapytań") and HTML report use the same chrome. PDF report: light, same fonts and colors.

## Language
Formal Polish (EN toggle kept and translated). No colloquial phrases ("prawie na pewno" → "z bardzo wysokim prawdopodobieństwem").
