// Generates LICENSES.md from the installed workspace dependencies (pnpm licenses), the label sets, the fonts and the data files.
// It FAILS (exit 1) when a licence needs a human decision that is not recorded below: a strong-copyleft / unknown licence,
// or a weak-copyleft / attribution licence on a package that has no entry in REVIEWED. So a new licence cannot slip in unnoticed.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = (p) => new URL(`../${p}`, import.meta.url);
const raw = execSync('pnpm licenses list -r --json', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const byLicense = JSON.parse(raw);

const pkgs = Object.entries(byLicense).flatMap(([license, list]) => list.map((p) => ({ name: p.name, versions: p.versions.join(', '), license, homepage: p.homepage ?? '', paths: p.paths ?? [] })));
const rows = pkgs.sort((a, b) => a.name.localeCompare(b.name));
const counts = Object.entries(byLicense).map(([license, list]) => [license, list.length]).sort((a, b) => b[1] - a[1]);

// Decisions made by a human (2026-11-21). Key = npm package; value = why it is acceptable and what it obliges us to.
const REVIEWED = {
  elkjs: 'EPL-2.0 (copyleft na poziomie plików). Zależność narzędzia Prisma Studio (`prisma` → `@prisma/studio-core`), niemodyfikowana, niepowiązana z kodem aplikacji. Obowiązek: zachować licencję i wskazać źródło (npm: elkjs).',
  lightningcss: 'MPL-2.0 (copyleft na poziomie plików). Narzędzie budowania (Tailwind / Vite, devDependency interfejsu), niemodyfikowane; do paczki webowej trafia tylko wygenerowany CSS.',
  'lightningcss-win32-x64-msvc': 'MPL-2.0, jak `lightningcss` (binarium dla Windows, tylko narzędzie budowania).',
  'caniuse-lite': 'CC-BY-4.0 (wymaga uznania autorstwa). Dane przeglądarek z caniuse.com © Alexis Deveria i współautorzy, https://creativecommons.org/licenses/by/4.0/ — używane tylko przy budowaniu (browserslist), niezmienione.',
  '@fontsource/ibm-plex-mono': 'OFL-1.1 — czcionka interfejsu, patrz „Czcionki”.',
  '@fontsource/vt323': 'OFL-1.1 — czcionka nagłówków interfejsu, patrz „Czcionki”.',
};
const needsReview = /MPL|EPL|CC-BY|OFL|LGPL|CDDL/i;
const forbidden = /AGPL|(^|[^L])GPL|SSPL|BUSL|UNKNOWN|UNLICENSED|Commercial|SEE LICENSE/i;
const problems = [];
for (const p of rows) {
  if (forbidden.test(p.license)) problems.push(`${p.name}@${p.versions}: licence "${p.license}" must be reviewed (strong copyleft / unknown)`);
  else if (needsReview.test(p.license) && !REVIEWED[p.name]) problems.push(`${p.name}@${p.versions}: licence "${p.license}" has no entry in REVIEWED`);
}

// Fonts: the claims below are re-checked against the files every time. The web uses @fontsource; the PDF uses the unmodified files in apps/api/assets/fonts.
const ofl = (file) => {
  const text = readFileSync(root(file), 'utf8');
  if (!/SIL Open Font License,? Version 1\.1/i.test(text)) problems.push(`${file}: not the SIL OFL 1.1 any more`);
  return text.split('\n').map((l) => l.trim()).find((l) => /^Copyright/i.test(l))?.replace(/\s*\([^)]*@[^)]*\)/, '').replace(/\s+/g, ' ').slice(0, 140) ?? ''; // an author's e-mail stays in the licence file, not in this table
};
for (const f of ['apps/api/assets/fonts/ibm-plex-mono/IBMPlexMono-Regular.woff', 'apps/api/assets/fonts/ibm-plex-mono/IBMPlexMono-Bold.woff', 'apps/api/assets/fonts/ibm-plex-mono/IBMPlexMono-Italic.woff', 'apps/api/assets/fonts/ibm-plex-mono/IBMPlexMono-BoldItalic.woff', 'apps/api/assets/fonts/vt323/VT323-Regular.ttf']) readFileSync(root(f)); // must exist
const plexCopyright = ofl('apps/api/assets/fonts/ibm-plex-mono/OFL.txt');
const vtCopyright = ofl('apps/api/assets/fonts/vt323/OFL.txt');
const webFont = (name) => {
  const p = rows.find((r) => r.name === name);
  if (!/SIL Open Font License, Version 1\.1/.test(readFileSync(join(p.paths[0], 'LICENSE'), 'utf8'))) problems.push(`${name}: LICENSE is not the SIL OFL 1.1 any more`);
};
webFont('@fontsource/ibm-plex-mono');
webFont('@fontsource/vt323');

// Label sets and data: the headers are required by LabelService, so the table is complete by construction.
const labelDir = root('config/labels');
const labelRows = readdirSync(labelDir).filter((f) => f.endsWith('.json')).sort().map((f) => {
  const d = JSON.parse(readFileSync(new URL(f, `${labelDir.href}/`), 'utf8'));
  const h = d.header;
  const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  return `| \`${f}\` | ${d.entries.length} | ${cell(h.source)}${h.sourceUrl ? ` (${h.sourceUrl})` : ''} | ${cell(h.license)} | ${h.retrieved} |`;
});
const recorded = JSON.parse(readFileSync(root('fixtures/recorded/real-addresses.json'), 'utf8')).header;

const md = `# Licencje wykorzystanych komponentów

Plik generowany skryptem \`pnpm licenses:report\` (${new Date().toISOString().slice(0, 10)}) — nie edytować ręcznie.
Wszystkie komponenty zewnętrzne są Open Source; licencja własnego kodu projektu: plik \`LICENSE\`. Skrypt kończy się błędem, jeśli pojawi się licencja wymagająca decyzji człowieka (silny copyleft, nieznana, albo słaby copyleft / uznanie autorstwa bez wpisu w sekcji „Uwagi”).

## Podsumowanie (${rows.length} pakietów npm)

| Licencja | Liczba pakietów |
|---|---|
${counts.map(([l, n]) => `| ${l} | ${n} |`).join('\n')}

Silnego copyleftu (GPL / AGPL / SSPL) ani licencji nieznanych wśród zależności nie ma.

## Uwagi do licencji o szczególnych wymogach

| Pakiet | Decyzja |
|---|---|
${Object.entries(REVIEWED).filter(([name]) => rows.some((r) => r.name === name)).map(([name, why]) => `| \`${name}\` | ${why} |`).join('\n')}

## Komponenty spoza npm (obrazy Docker i usługi)

| Komponent | Licencja |
|---|---|
| PostgreSQL 16 (\`postgres:16-alpine\`) | PostgreSQL License |
| nginx (\`nginx:alpine\`) | BSD-2-Clause |
| Node.js 22 (\`node:22-bookworm-slim\`) | MIT |
| Ollama (opcjonalnie, uruchamiany osobno przez użytkownika; nie jest częścią \`docker-compose.yml\`) | MIT |

Obrazy bazowe zawierają też pakiety systemowe Debian / Alpine na ich własnych licencjach (w tym GPL); aplikacja ich nie modyfikuje ani nie łączy z własnym kodem.

## Czcionki

Wszystkie czcionki są serwowane lokalnie (żadnych czcionek z CDN) i objęte SIL Open Font License 1.1; skrypt sprawdza przy każdym generowaniu, że pliki i pakiety nadal to deklarują. Interfejs używa pakietów \`@fontsource/*\`, raport PDF — niezmodyfikowanych plików z \`apps/api/assets/fonts/\` (razem z tekstami licencji).

| Czcionka | Licencja | Informacja o prawach autorskich | Użycie |
|---|---|---|---|
| IBM Plex Mono (\`@fontsource/ibm-plex-mono\`; pliki \`apps/api/assets/fonts/ibm-plex-mono/*.woff\`) | SIL OFL-1.1 | ${plexCopyright} | cały interfejs i tekst raportu PDF |
| VT323 (\`@fontsource/vt323\`; plik \`apps/api/assets/fonts/vt323/VT323-Regular.ttf\`) | SIL OFL-1.1 | ${vtCopyright} | duże nagłówki interfejsu i raportu PDF |

## Zbiory danych i etykiet

Listy etykiet adresów (\`config/labels/*.json\`). Aplikacja nie wystartuje, jeśli plik nie ma w nagłówku źródła, licencji i daty pobrania.

| Plik | Wpisów | Źródło | Licencja | Pobrano |
|---|---|---|---|---|
${labelRows.join('\n')}

Pozostałe dane:

| Dane | Pochodzenie | Licencja |
|---|---|---|
| \`fixtures/sandbox-web\`, \`fixtures/chain\`, \`fixtures/addresses.json\`, \`fixtures/expected.json\`, \`fixtures/demo-case.json\` | **syntetyczne**: osoby, strony i adresy zmyślone (adresy z losowych kluczy, \`scripts/gen-fixture-addresses.mjs\`; e-maile na domenach zarezerwowanych) | autorstwa zespołu; nie dotyczą żadnej prawdziwej osoby |
| \`fixtures/recorded/real-addresses.json\` | odpowiedzi publicznych API (${recorded.source}) dla pięciu adresów instytucjonalnych, zapisane ${recorded.recordedAt.slice(0, 10)}; bez kluczy API i bez list transakcji | ${recorded.license} |
| Kursy NBP (API \`api.nbp.pl\`, tabela A) | pobierane w czasie działania, w testach zastępowane syntetycznymi (USD 4,00; EUR 4,40) | dane publiczne NBP; nie są zapisywane w repozytorium |
| Dane Ethereum z Etherscan API v2 | pobierane w czasie działania (Powered by Etherscan.io APIs); w repozytorium tylko odpowiedzi \`eth_getCode\` pięciu adresów publicznych | regulamin Etherscan API |
| Dane TRON z TronGrid | jak wyżej (\`wallet/getcontract\`) | regulamin TronGrid |

## Pakiety npm

| Pakiet | Wersje | Licencja | Strona |
|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.versions} | ${r.license} | ${r.homepage} |`).join('\n')}
`;

if (problems.length) {
  console.error(`LICENSES.md NOT written — ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
writeFileSync(new URL('../LICENSES.md', import.meta.url), md);
console.log(`LICENSES.md: ${rows.length} packages, ${labelRows.length} label sets`);
