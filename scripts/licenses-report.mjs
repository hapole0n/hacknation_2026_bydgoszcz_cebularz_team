// Generates LICENSES.md from the installed workspace dependencies (pnpm licenses).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const raw = execSync('pnpm licenses list -r --json', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const byLicense = JSON.parse(raw);

const rows = Object.values(byLicense)
  .flat()
  .map((p) => ({ name: p.name, versions: p.versions.join(', '), license: p.license, homepage: p.homepage ?? '' }))
  .sort((a, b) => a.name.localeCompare(b.name));

const counts = Object.entries(byLicense)
  .map(([license, pkgs]) => [license, pkgs.length])
  .sort((a, b) => b[1] - a[1]);

const md = `# Licencje wykorzystanych komponentów

Plik generowany skryptem \`pnpm licenses:report\` (${new Date().toISOString().slice(0, 10)}) — nie edytować ręcznie.
Wszystkie komponenty są Open Source.

## Podsumowanie (${rows.length} pakietów npm)

| Licencja | Liczba pakietów |
|---|---|
${counts.map(([l, n]) => `| ${l} | ${n} |`).join('\n')}

## Komponenty spoza npm (obrazy Docker)

| Komponent | Licencja |
|---|---|
| PostgreSQL 16 (\`postgres:16-alpine\`) | PostgreSQL License |
| nginx (\`nginx:alpine\`) | BSD-2-Clause |
| Node.js 22 (\`node:22-bookworm-slim\`) | MIT |
| Ollama (opcjonalnie, profil \`ai\`) | MIT |

## Zbiory danych i etykiet

Pliki \`config/labels/*.json\` zawierają w nagłówku źródło, licencję i datę pobrania.

## Pakiety npm

| Pakiet | Wersje | Licencja | Strona |
|---|---|---|---|
${rows.map((r) => `| ${r.name} | ${r.versions} | ${r.license} | ${r.homepage} |`).join('\n')}
`;

writeFileSync(new URL('../LICENSES.md', import.meta.url), md);
console.log(`LICENSES.md: ${rows.length} packages`);

const review = counts.filter(([l]) => /GPL|SSPL|BUSL|UNKNOWN|UNLICENSED|Commercial/i.test(l));
if (review.length) console.warn('REVIEW licenses:', review.map(([l, n]) => `${l} (${n})`).join(', '));
