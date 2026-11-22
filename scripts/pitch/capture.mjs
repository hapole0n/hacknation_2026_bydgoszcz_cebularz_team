// Screenshots of the product for the pitch deck (docs/pitch/TRESC.md, frames P1-P8).
//
// Real runs only: the demo case is created and analysed through the UI of a product started on a SEPARATE, CLEAN database.
// The script refuses to run when that database already holds a case (so it can never be pointed at the analyst's dev DB):
//   docker exec olcys-db-1 psql -U olcys -d postgres -c "DROP DATABASE IF EXISTS olcys_pitch" -c "CREATE DATABASE olcys_pitch"
//   DATABASE_URL=postgresql://olcys:olcys@localhost:5432/olcys_pitch pnpm --filter api exec prisma migrate deploy
//   DATABASE_URL=...olcys_pitch API_PORT=3102 node apps/api/dist/main.js        (pnpm --filter api build first)
//   cd apps/web && API_PORT=3102 npx vite --port 5182 --strictPort
// Then: PITCH_WEB=http://localhost:5182 PITCH_API=http://localhost:3102 node scripts/pitch/capture.mjs
// To retake some frames on the database that capture.mjs already filled: PITCH_REUSE=1 PITCH_ONLY=P3,P5 node scripts/pitch/capture.mjs
//
// Every frame is a locator.screenshot() of one component at deviceScaleFactor 2. Only the DOM around it is hidden or sized (the product code
// is never changed). The bounding boxes of the elements the slides point at go to docs/pitch/assets/shots.json (CSS px, relative to the frame).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = process.env.PITCH_WEB ?? 'http://localhost:5182';
const API = process.env.PITCH_API ?? 'http://localhost:3102';
const REUSE = process.env.PITCH_REUSE === '1';
const ONLY = process.env.PITCH_ONLY ? new Set(process.env.PITCH_ONLY.split(',')) : null;
const OUT = new URL('../../docs/pitch/assets/shots/', import.meta.url);
const MANIFEST = new URL('../shots.json', OUT);
const TRON = 'TEonzwFMXhEWwoxNLdM13MBs99T9xAGZey'; // the synthetic persona's TRON address (fixtures/addresses.json)
const want = (name) => !ONLY || ONLY.has(name);

const getJson = async (path) => (await fetch(`${API}${path}`)).json();
const existing = await getJson('/api/cases');
if (!Array.isArray(existing)) throw new Error(`${API} did not answer like the KROPKA API`);
if (existing.length > 0 && !REUSE) {
  console.error(`${API} is not a clean database (${existing.length} case(s)). Create an empty one - see the header of this file.`);
  process.exit(1);
}
if (existing.length === 0 && REUSE) throw new Error('PITCH_REUSE=1 needs a database that already holds the demo case');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 2, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
const page = await context.newPage();
page.setDefaultTimeout(30000);

const manifest = REUSE && existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

/** The container of a GroupBox / ChildWindow: its id is on the heading inside, the element itself carries aria-labelledby. */
const box = (id) => `[aria-labelledby="${id}"]`;
const view = (w, h = 600) => page.setViewportSize({ width: w, height: h }); // short by default, so that a window is as tall as its content
const windowOf = () => page.locator('main').locator('xpath=ancestor::div[contains(@class,"bevel")][1]');

/** Keep `keepSels` (and the path down to them) inside `rootSel`; hide every other branch. */
async function isolate(rootSel, keepSels) {
  await page.evaluate(([root, keeps]) => {
    const keepEls = keeps.flatMap((s) => Array.from(document.querySelectorAll(s)));
    const walk = (node) => {
      for (const c of Array.from(node.children)) {
        if (keepEls.some((k) => k === c || k.contains(c))) continue;
        if (keepEls.some((k) => c.contains(k))) walk(c);
        else c.style.display = 'none';
      }
    };
    walk(document.querySelector(root));
  }, [rootSel, keepSels]);
}
const hide = (sel) => page.evaluate((s) => document.querySelectorAll(s).forEach((e) => (e.style.display = 'none')), sel);
const style = (sel, css) => page.evaluate(([s, c]) => document.querySelectorAll(s).forEach((e) => Object.assign(e.style, c)), [sel, css]);
/** A component that hangs over the edge of its box (the legend of a GroupBox) needs room: frame the `main` of the window, trimmed. */
const trimMain = () => style('main', { padding: '14px', flex: 'none' });

/** Box of each selector inside `frame`, in CSS px relative to the frame. */
async function boxes(frame, named) {
  const f = await frame.boundingBox();
  const out = {};
  for (const [name, sel] of Object.entries(named)) {
    const b = await (typeof sel === 'string' ? page.locator(sel).first() : sel).boundingBox();
    if (!b) throw new Error(`no box for ${name}`);
    out[name] = { x: +(b.x - f.x).toFixed(1), y: +(b.y - f.y).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
  }
  return { frame: { w: +f.width.toFixed(1), h: +f.height.toFixed(1) }, boxes: out };
}

async function shot(name, frame, named = {}, caption = '') {
  await frame.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)), animations: 'disabled' });
  manifest[name] = { file: `assets/shots/${name}.png`, dsf: 2, caption, ...(await boxes(frame, named)) };
  console.log(`${name}: ${manifest[name].frame.w} x ${manifest[name].frame.h} css px`);
}

// ---- P1: the new-case window with three identifiers typed in ----------------------------------------------------------------------------
if (want('P1')) {
  await page.setViewportSize({ width: 996, height: 800 });
  await page.goto(`${WEB}/`);
  await page.locator('#q').fill('jtestowy, jan.testowy@example.org, @jtestowy_pl');
  await page.getByText('Rozpoznane identyfikatory').first().waitFor();
  await page.locator('#q').blur();
  await hide('section[aria-labelledby="przebieg"], section[aria-labelledby="rejestr"]'); // the explanation and the (empty) register are not part of the frame
  await shot('P1', windowOf(), { recognised: 'main .sunken >> nth=1' }, 'Nowa sprawa: jedno pole, typ rozpoznawany automatycznie');
}

// ---- the demo case, through the UI (once) -----------------------------------------------------------------------------------------------
let runUrl;
let runId;
let lastRunUrl;
if (REUSE) {
  const c = await getJson(`/api/cases/${existing[0].id}`);
  const runs = [...c.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  runId = runs[0].id;
  runUrl = `${WEB}/runs/${runId}`;
  lastRunUrl = `${WEB}/runs/${runs.at(-1).id}`;
} else {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto(`${WEB}/`);
  await page.getByText('otwórz sprawę demonstracyjną').click();
  await page.waitForURL(/\/runs\//, { timeout: 120000 });
  await page.getByText('Uzasadnienie oceny').first().waitFor();
  runUrl = page.url();
  runId = runUrl.split('/runs/')[1];
}
const openRun = async (w) => {
  await view(w);
  await page.goto(runUrl);
  await page.getByText('Uzasadnienie oceny').first().waitFor();
};

// ---- P2: verdict, counters and the table of addresses assigned to the person ----------------------------------------------------------
if (want('P2')) {
  await openRun(1180);
  await isolate('main', ['section[aria-labelledby="werdykt"]', box('adresy')]);
  await hide(box('dlaczego'));
  await trimMain();
  const row = `${box('adresy')} .sunken .border-dashed >> nth=0`;
  await shot('P2', page.locator('main'), { verdict: '#werdykt', counters: 'section[aria-labelledby="werdykt"] pre', score: `${row} >> xpath=./span[1]`, basis: `${row} >> xpath=./span[4]`, table: `${box('adresy')} .sunken` }, 'Wynik analizy: werdykt, liczniki, adresy przypisane osobie');
}

// ---- P3: the reasoning panel of the first address, header to total ------------------------------------------------------------------------
if (want('P3')) {
  await openRun(1052);
  await hide(box('adresy'));
  await page.evaluate(() => {
    const panel = document.querySelector('aside[aria-labelledby="dlaczego"]');
    Object.assign(panel.style, { width: '820px', flex: 'none' });
    const total = Array.from(panel.querySelectorAll('div')).find((d) => d.textContent.trim().startsWith('RAZEM'));
    const ledger = total.closest('.flex.flex-col.gap-2\\.5');
    for (let e = ledger.nextElementSibling; e; e = e.nextElementSibling) e.style.display = 'none'; // conclusion, decision form, link to the card
  });
  const line = (rule) => page.locator(`${box('dlaczego')} div.border-b:has-text("${rule}")`).first();
  await shot('P3', page.locator(box('dlaczego')), { official: line('BASE_OFFICIAL_PROFILE'), synergy: line('SYNERGY_INDEPENDENT_SOURCES'), total: page.locator(`${box('dlaczego')} div.font-bold:has-text("RAZEM")`) }, 'Uzasadnienie oceny: każdy punkt z regułą, dowodem i etykietą');
}

// ---- P4: excluded addresses ---------------------------------------------------------------------------------------------------------------
if (want('P4')) {
  await openRun(1180);
  await isolate('main', [box('odrzucone')]);
  await trimMain();
  await shot('P4', page.locator('main'), { table: `${box('odrzucone')} .sunken` }, 'Wykluczone z przypisania osobie: powód i źródło etykiety');
}

// ---- P5: the TRON address card (header, sums, days axis), and its AML thresholds frame -----------------------------------------------------
const addressPage = async (w) => {
  await view(w);
  await page.goto(`${WEB}/runs/${runId}/address/TRON/${TRON}`);
  await page.getByText('Przebieg transakcji').first().waitFor();
};
if (want('P5')) {
  await addressPage(800);
  await page.evaluate(() => document.querySelector('main').children[1].setAttribute('data-pitch', 'totals')); // the four sums follow the header section
  await isolate('main', ['section[aria-labelledby="adres"]', '[data-pitch="totals"]', box('os')]);
  await hide('section[aria-labelledby="adres"] > p, section[aria-labelledby="adres"] > div:last-child'); // basis text and the back button
  await hide(`${box('os')} ol`); // the transaction list is not part of this frame
  await hide('section[aria-labelledby="adres"] > div > span:not(.bg-alert)'); // category and score tags wrap into three lines at this width; the cash-out tag stays
  await trimMain();
  await shot('P5', page.locator('main'), { totals: '[data-pitch="totals"]', axis: `${box('os')} .sunken >> nth=0` }, 'Karta adresu TRON: sumy w USDT i złotych, oś dni');
}
if (want('P5b')) {
  await addressPage(1180);
  await isolate('main', [box('progi')]);
  await trimMain();
  await style('main', { width: '344px', alignSelf: 'flex-start' });
  await shot('P5b', page.locator('main'), { thresholds: box('progi') }, 'Progi AML: art. 35 ust. 1 ustawy AML');
}

// ---- P6a, P6b: the report (HTML view), two sheets --------------------------------------------------------------------------------------------
const reportPage = async () => {
  await view(980, 1400); // tall: the clipped sheet must stay inside the window
  await page.goto(`${WEB}/runs/${runId}/report`);
  await page.getByText('Jak czytać ten raport').first().waitFor();
};
if (want('P6a')) {
  await reportPage();
  await hide('article > nav, article > section'); // the table of contents and the sections: this is the first page
  await style('article', { maxWidth: '860px', maxHeight: '600px', overflow: 'hidden' });
  await shot('P6a', page.locator('article'), {}, 'Raport: strona pierwsza');
}
if (want('P6b')) {
  await reportPage();
  await isolate('article', ['#sec-links']);
  await style('#sec-links', { marginTop: '0' });
  // The report table breaks "Ethereum" in two in its narrow network column (overflow-wrap: anywhere). Capture-only: let the column take the word's width.
  await style('#sec-links th, #sec-links td', { overflowWrap: 'normal', wordBreak: 'normal' });
  await style('#sec-links td:first-child, #sec-links th:first-child', { overflowWrap: 'anywhere' }); // long addresses still wrap
  await style('article', { maxWidth: '860px', maxHeight: '600px', overflow: 'hidden' });
  await shot('P6b', page.locator('article'), {}, 'Raport: Powiązane adresy i Wskaźnik Pewności');
}

// ---- P7: the request log (spare) ---------------------------------------------------------------------------------------------------------------
if (want('P7')) {
  await view(1180);
  await page.goto(`${WEB}/audit`);
  await page.getByText('Zapytania').first().waitFor();
  await style('main', { padding: '14px', flex: 'none', maxHeight: '760px', overflow: 'hidden' });
  await shot('P7', page.locator('main'), {}, 'Dziennik zapytań');
}

// ---- P8: changes since the previous run, after "Demo: symuluj zmianę" (a cut-out of the first groups) ----------------------------------------
if (want('P8')) {
  if (!REUSE) {
    await view(1180);
    const caseId = (await getJson('/api/cases'))[0].id;
    await page.goto(`${WEB}/cases/${caseId}`);
    await page.getByText('Historia analiz').first().waitFor();
    await page.getByRole('button', { name: 'Demo: symuluj zmianę' }).click();
    await page.getByRole('button', { name: 'Cofnij zmianę' }).waitFor();
    await page.goto(runUrl);
    await page.getByText('Uzasadnienie oceny').first().waitFor();
    await page.keyboard.press('F5'); // "Uruchom ponownie"
    await page.waitForURL((u) => u.pathname.startsWith('/runs/') && !u.href.startsWith(runUrl), { timeout: 120000 });
    lastRunUrl = page.url();
  }
  await view(600, 1400);
  await page.goto(lastRunUrl);
  await page.getByText('Zmiany od poprzedniego przebiegu').first().waitFor();
  await page.locator(`${box('zmiany')} .sunken`).waitFor();
  await isolate('main', [box('zmiany')]);
  await style(`${box('zmiany')} .sunken`, { maxHeight: '128px', overflow: 'hidden' });
  await trimMain();
  await shot('P8', page.locator('main'), { addressSwap: `${box('zmiany')} .sunken > div >> nth=0` }, 'Zmiany od poprzedniego przebiegu');
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
console.log('done: docs/pitch/assets/shots.json');
