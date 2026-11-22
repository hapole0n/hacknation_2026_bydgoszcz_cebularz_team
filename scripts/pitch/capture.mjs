// Screenshots of the product for the pitch deck (docs/pitch/TRESC.md, "Zrzuty dla prezentacji").
//
// Real runs only: the demo cases are created and analysed through the UI of a product started on a SEPARATE, CLEAN database.
// The script refuses to run when that database already holds a case (so it can never be pointed at the analyst's dev DB):
//   docker exec olcys-db-1 psql -U olcys -d postgres -c "DROP DATABASE IF EXISTS olcys_pitch" -c "CREATE DATABASE olcys_pitch"
//   DATABASE_URL=postgresql://olcys:olcys@localhost:5432/olcys_pitch pnpm --filter api exec prisma migrate deploy
//   DATABASE_URL=...olcys_pitch API_PORT=3102 node apps/api/dist/main.js        (pnpm --filter api build first)
//   cd apps/web && API_PORT=3102 npx vite --port 5182 --strictPort
// Then: PITCH_WEB=http://localhost:5182 PITCH_API=http://localhost:3102 node scripts/pitch/capture.mjs
// To retake some frames on the database that capture.mjs already filled: PITCH_REUSE=1 PITCH_ONLY=P3,P5 node scripts/pitch/capture.mjs
//
// Every frame is a locator.screenshot() of ONE component at deviceScaleFactor 2, focused on what the slide is about: second-level parts
// (rule codes, "Dowody", URLs, links) may be hidden, numbers and texts of the product never change. The viewport width decides the cut and the
// scale on the slide (1.3-2.0). For the elements a slide points at, the boxes (CSS px, relative to the frame) go to docs/pitch/assets/shots.json,
// together with `lineY`: a y inside the element where a horizontal line from the left edge of the frame to the element crosses NO text.
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

// viewport widths: they decide the cut of a frame and so its scale on the slide
const W = { P1: 663, P3: 1052, P4: 600, P5: 800, P9: 640, P11: 580 };

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

const manifest = (REUSE || ONLY) && existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

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

/**
 * Boxes of the elements a slide points at (CSS px, relative to the frame) + `lineY` for each: a y inside the element's vertical extent where a
 * horizontal line from the frame's left edge to the element crosses no text of the product. `items`: key -> { css, text?, nth?, closest?, deepest?, textBox? }.
 */
async function annotations(frame, items) {
  if (Object.keys(items).length === 0) return {};
  return frame.evaluate((frameEl, items) => {
    const fr = frameEl.getBoundingClientRect();
    const texts = [];
    const walker = document.createTreeWalker(frameEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!n.textContent.trim() || !p || p.getClientRects().length === 0 || getComputedStyle(p).visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) texts.push(r);
    }
    const out = {};
    for (const [key, d] of Object.entries(items)) {
      let list = Array.from(document.querySelectorAll(d.css)).filter((e) => (!d.text || e.textContent.includes(d.text)) && e.getClientRects().length > 0);
      if (d.deepest) list = list.filter((e) => !list.some((o) => o !== e && e.contains(o)));
      let el = list[d.nth ?? 0];
      if (!el) throw new Error(`annotation ${key}: no element for ${d.css} ${d.text ?? ''}`);
      if (d.closest) el = el.closest(d.closest);
      let r = el.getBoundingClientRect();
      if (d.textBox) { // frame the text of the element, not its padding: neighbouring table rows then do not touch
        const tr = texts.filter((t) => t.left >= r.left - 1 && t.right <= r.right + 1 && t.top >= r.top - 1 && t.bottom <= r.bottom + 1);
        if (tr.length) r = new DOMRect(Math.min(...tr.map((t) => t.left)), Math.min(...tr.map((t) => t.top)), Math.max(...tr.map((t) => t.right)) - Math.min(...tr.map((t) => t.left)), Math.max(...tr.map((t) => t.bottom)) - Math.min(...tr.map((t) => t.top)));
      }
      const mid = (r.top + r.bottom) / 2;
      let lineY = null;
      for (let dy = 0; dy <= r.height / 2 + 4 && lineY === null; dy += 0.5) {
        for (const y of dy === 0 ? [mid] : [mid - dy, mid + dy]) {
          if (y < r.top - 4 || y > r.bottom + 4) continue;
          const crosses = texts.some((t) => t.left < r.left - 6 && t.right > fr.left && t.top < y + 4 && t.bottom > y - 4);
          if (!crosses) { lineY = y; break; }
        }
      }
      if (lineY === null) throw new Error(`annotation ${key}: no free line from the left edge of the frame to the element`);
      out[key] = { x: +(r.left - fr.left).toFixed(1), y: +(r.top - fr.top).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), lineY: +(lineY - fr.top).toFixed(1) };
    }
    return out;
  }, items);
}

/** `own`: the frame already is a product window with its own title bar (the deck then draws no frame around it). */
async function shot(name, frame, { own = false, items = {}, caption = '' } = {}) {
  const boxes = await annotations(frame, items);
  await frame.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)), animations: 'disabled' });
  const f = await frame.boundingBox();
  manifest[name] = { file: `assets/shots/${name}.png`, dsf: 2, own, caption, frame: { w: +f.width.toFixed(1), h: +f.height.toFixed(1) }, boxes };
  console.log(`${name}: ${manifest[name].frame.w} x ${manifest[name].frame.h} css px${own ? ' (own window frame)' : ''}`);
}

// ---- P1: "Nowa sprawa" - the window with the heading, the field with three identifiers and the list of recognised ones -----------------------
if (want('P1')) {
  await view(W.P1);
  await page.goto(`${WEB}/`);
  await page.locator('#q').fill('jtestowy, jan.testowy@example.org, @jtestowy_pl');
  await page.getByText('Rozpoznane identyfikatory').first().waitFor();
  await page.locator('#q').blur();
  await hide('main > .sunken, main > p, section[aria-labelledby="przebieg"], section[aria-labelledby="rejestr"]'); // intro console, demo links, flow, register
  await hide('form > div.flex.flex-wrap.items-center, form > details'); // check boxes, "Ustawienia zaawansowane"
  await hide('div.bevel > nav.no-print'); // the shortcut bar at the bottom of the window
  await hide('div.border-t.border-white > div.ml-auto'); // PL / EN / Powiadomienia: F2, F4, F8 then stand in ONE row
  await style('div.border-t.border-white', { flexWrap: 'nowrap' });
  await style('main', { paddingBottom: '8px' }); // less empty grey under the list: the frame gets scale >= 1.4 on the slide
  await page.evaluate(() => document.querySelector('#podstawa').closest('div.flex-col').style.setProperty('display', 'none')); // the optional case number
  await shot('P1', windowOf(), { own: true, caption: 'Nowa sprawa: jedno pole, typ rozpoznawany automatycznie' });
}

// ---- the demo case, through the UI (once) -----------------------------------------------------------------------------------------------
let runUrl;
let runId;
let lastRunUrl;
let addressRunUrl;
if (REUSE) {
  const cases = (await getJson('/api/cases')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const c = await getJson(`/api/cases/${cases[0].id}`);
  const runs = [...c.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  runId = runs[0].id;
  runUrl = `${WEB}/runs/${runId}`;
  lastRunUrl = `${WEB}/runs/${runs.at(-1).id}`;
  if (cases[1]) addressRunUrl = `${WEB}/runs/${(await getJson(`/api/cases/${cases[1].id}`)).runs[0].id}`;
} else {
  await view(1000);
  await page.goto(`${WEB}/`);
  await page.getByText('otwórz sprawę demonstracyjną').click();
  await page.waitForURL(/\/runs\//, { timeout: 120000 });
  await page.getByText('Uzasadnienie oceny').first().waitFor();
  runUrl = page.url();
  runId = runUrl.split('/runs/')[1];
  lastRunUrl = runUrl;
  // the second demo: an address on the input, "who is behind it?"
  await page.goto(`${WEB}/`);
  await page.getByText('Demonstracja: kto stoi za adresem?').click();
  await page.waitForURL((u) => u.pathname.startsWith('/runs/') && !u.href.startsWith(runUrl), { timeout: 120000 });
  await page.getByText('Konta, które opublikowały adres').first().waitFor();
  addressRunUrl = page.url();
}
const openRun = async (w, url = runUrl) => {
  await view(w);
  await page.goto(url);
  await page.getByText('Uzasadnienie oceny').first().waitFor();
};

// ---- P2 (spare): verdict, counters and the table of addresses assigned to the person ----------------------------------------------------
if (want('P2')) {
  await openRun(1180);
  await isolate('main', ['section[aria-labelledby="werdykt"]', box('adresy')]);
  await hide(box('dlaczego'));
  await trimMain();
  await shot('P2', page.locator('main'), { caption: 'Wynik analizy: werdykt, liczniki, adresy przypisane osobie' });
}

// ---- P3: the reasoning panel of the first address, narrow and focused (no rule codes, no "Dowody") -------------------------------------------
if (want('P3')) {
  await openRun(1052);
  await hide(box('adresy'));
  await page.evaluate(() => {
    const panel = document.querySelector('aside[aria-labelledby="dlaczego"]');
    Object.assign(panel.style, { width: '440px', flex: 'none' });
    const total = Array.from(panel.querySelectorAll('div')).find((d) => d.textContent.trim().startsWith('RAZEM'));
    const ledger = total.closest('.flex.flex-col.gap-2\\.5');
    for (let e = ledger.nextElementSibling; e; e = e.nextElementSibling) e.style.display = 'none'; // conclusion, decision form, link to the card
    panel.querySelectorAll('details').forEach((e) => (e.style.display = 'none')); // "Dowody (n)"
    panel.querySelectorAll('span.block.text-\\[11px\\]').forEach((e) => (e.style.display = 'none')); // rule codes
    panel.querySelectorAll('div[role="group"]').forEach((e) => (e.style.display = 'none')); // the identifier buttons
  });
  const row = (text) => ({ css: `${box('dlaczego')} div.border-b`, text, deepest: true });
  await shot('P3', page.locator(box('dlaczego')), {
    own: true,
    items: { official: row('BASE_OFFICIAL_PROFILE'), synergy: row('SYNERGY_INDEPENDENT_SOURCES'), total: { css: `${box('dlaczego')} div.font-bold`, text: 'RAZEM', deepest: true } },
    caption: 'Uzasadnienie oceny: każdy punkt z regułą i oznaczeniem',
  });
}

// ---- P4: excluded addresses, narrow --------------------------------------------------------------------------------------------------------
if (want('P4')) {
  await openRun(W.P4);
  await isolate('main', [box('odrzucone')]);
  await hide(`${box('odrzucone')} > p`); // the explanation above the table
  await hide(`${box('odrzucone')} tbody td details, ${box('odrzucone')} tbody td:nth-child(4) a, ${box('odrzucone')} tbody td .text-\\[12px\\], ${box('odrzucone')} tbody td .text-sub`); // "Wzmianki", links, rule codes
  await style(`${box('odrzucone')} table, ${box('odrzucone')} .sunken > div`, { minWidth: '0' });
  await trimMain();
  await shot('P4', page.locator('main'), {
    items: { exchange: { css: `${box('odrzucone')} tbody tr`, text: 'GIEŁDA', deepest: true }, kantor: { css: `${box('odrzucone')} tbody tr`, text: 'KANTOR', deepest: true } },
    caption: 'Wykluczone z przypisania osobie',
  });
}

// ---- P5: the TRON address card (address, cash-out tag, four sums, days axis) -----------------------------------------------------------------
const addressPage = async (w) => {
  await view(w);
  await page.goto(`${WEB}/runs/${runId}/address/TRON/${TRON}`);
  await page.getByText('Przebieg transakcji').first().waitFor();
};
if (want('P5')) {
  await addressPage(W.P5);
  await page.evaluate(() => document.querySelector('main').children[1].setAttribute('data-pitch', 'totals')); // the four sums follow the header section
  await isolate('main', ['section[aria-labelledby="adres"]', '[data-pitch="totals"]', box('os')]);
  await hide('section[aria-labelledby="adres"] > p, section[aria-labelledby="adres"] > div:last-child'); // basis text and the back button
  await hide(`${box('os')} ol`); // the transaction list is not part of this frame
  await hide('section[aria-labelledby="adres"] > div > span:not(.bg-alert)'); // category and score tags wrap into three lines at this width; the cash-out tag stays
  await trimMain();
  await shot('P5', page.locator('main'), {
    items: {
      cashTag: { css: 'section[aria-labelledby="adres"] .bg-alert' },
      outTile: { css: '[data-pitch="totals"] div', text: 'DO USŁUGI WYPŁATY', deepest: true },
      novStrip: { css: `${box('os')} div.grid[aria-hidden="true"]`, nth: 1 },
    },
    caption: 'Karta adresu TRON: przesłanka wypłaty, sumy, oś dni',
  });
}
if (want('P5b')) {
  await addressPage(1180);
  await isolate('main', [box('progi')]);
  await trimMain();
  await style('main', { width: '344px', alignSelf: 'flex-start' });
  await shot('P5b', page.locator('main'), { caption: 'Progi AML: art. 35 ust. 1 ustawy AML' });
}

// ---- P6a, P6b (spare): the report (HTML view), two sheets ------------------------------------------------------------------------------------
const reportPage = async () => {
  await view(980, 1400); // tall: the clipped sheet must stay inside the window
  await page.goto(`${WEB}/runs/${runId}/report`);
  await page.getByText('Jak czytać ten raport').first().waitFor();
};
if (want('P6a')) {
  await reportPage();
  await hide('article > nav, article > section'); // the table of contents and the sections: this is the first page
  await style('article', { maxWidth: '860px', maxHeight: '600px', overflow: 'hidden' });
  await shot('P6a', page.locator('article'), { caption: 'Raport: strona pierwsza' });
}
if (want('P6b')) {
  await reportPage();
  await isolate('article', ['#sec-links']);
  await style('#sec-links', { marginTop: '0' });
  // The report table breaks "Ethereum" in two in its narrow network column (overflow-wrap: anywhere). Capture-only: let the column take the word's width.
  await style('#sec-links th, #sec-links td', { overflowWrap: 'normal', wordBreak: 'normal' });
  await style('#sec-links td:first-child, #sec-links th:first-child', { overflowWrap: 'anywhere' }); // long addresses still wrap
  await style('article', { maxWidth: '860px', maxHeight: '600px', overflow: 'hidden' });
  await shot('P6b', page.locator('article'), { caption: 'Raport: Powiązane adresy i Wskaźnik Pewności' });
}

// ---- P7 (spare): the request log ---------------------------------------------------------------------------------------------------------------
if (want('P7')) {
  await view(1180);
  await page.goto(`${WEB}/audit`);
  await page.getByText('Zapytania').first().waitFor();
  await style('main', { padding: '14px', flex: 'none', maxHeight: '760px', overflow: 'hidden' });
  await shot('P7', page.locator('main'), { caption: 'Dziennik zapytań' });
}

// ---- P8 (spare): changes since the previous run, after "Demo: symuluj zmianę" (a cut-out of the first groups) -----------------------------------
if (want('P8')) {
  if (!REUSE) {
    await view(1180);
    const caseId = (await getJson('/api/cases')).find((c) => c.signature.endsWith('0001')).id;
    await page.goto(`${WEB}/cases/${caseId}`);
    await page.getByText('Historia analiz').first().waitFor();
    await page.getByRole('button', { name: 'Demo: symuluj zmianę' }).click();
    await page.getByRole('button', { name: 'Cofnij zmianę' }).waitFor();
    await page.goto(runUrl);
    await page.getByText('Uzasadnienie oceny').first().waitFor();
    await page.keyboard.press('F5'); // "Uruchom ponownie"
    await page.waitForURL((u) => u.pathname.startsWith('/runs/') && !u.href.startsWith(runUrl) && !u.href.startsWith(addressRunUrl), { timeout: 120000 });
    lastRunUrl = page.url();
  }
  await view(600, 1400);
  await page.goto(lastRunUrl);
  await page.getByText('Zmiany od poprzedniego przebiegu').first().waitFor();
  await page.locator(`${box('zmiany')} .sunken`).waitFor();
  await isolate('main', [box('zmiany')]);
  await style(`${box('zmiany')} .sunken`, { maxHeight: '128px', overflow: 'hidden' });
  await trimMain();
  await shot('P8', page.locator('main'), { caption: 'Zmiany od poprzedniego przebiegu' });
}

// ---- P9: "Demonstracja: kto stoi za adresem?" -> "Konta, które opublikowały adres": the first three cards ------------------------------------------
if (want('P9')) {
  await view(W.P9);
  await page.goto(addressRunUrl);
  await page.getByText('Konta, które opublikowały adres').first().waitFor();
  await isolate('main', [box('konta')]);
  await hide(`${box('konta')} > p`); // the explanation under the title
  // the first card (90), the one with 75 and the first "same nick on another platform" card; the second 90 (the same person on another platform) is hidden
  await page.evaluate((sel) => {
    const cards = Array.from(document.querySelectorAll(sel));
    const keep = new Set([cards[0], cards.find((c) => c.textContent.includes('PRAWDOPODOBNY')), cards.find((c) => c.textContent.includes('ten sam nick'))]);
    cards.forEach((c) => { if (!keep.has(c)) c.style.display = 'none'; });
  }, `${box('konta')} li.sunken`);
  await hide(`${box('konta')} li.sunken details, ${box('konta')} li.sunken > p, ${box('konta')} li.sunken a`); // "Rozbicie oceny", URLs, "Karta adresu"
  await trimMain();
  const card = (n) => ({ css: `${box('konta')} li.sunken`, nth: n });
  await shot('P9', page.locator('main'), { items: { first: card(0), second: card(1), sameNick: card(2) }, caption: 'Konta, które opublikowały adres' }); // nth counts the visible cards
}

// ---- P11: "Przeszukane źródła" on the result page: source / what was looked for / result ---------------------------------------------------------
if (want('P11')) {
  await openRun(W.P11);
  await isolate('main', [box('zrodla')]);
  await hide(`${box('zrodla')} > p`); // the one-line summary above the table
  await hide(`${box('zrodla')} th:nth-child(4), ${box('zrodla')} td:nth-child(4)`); // the time column
  await style(`${box('zrodla')} table, ${box('zrodla')} .sunken > div, ${box('zrodla')} .overflow-x-auto > div`, { minWidth: '0' });
  await trimMain();
  const row = (text) => ({ css: `${box('zrodla')} tbody tr`, text, textBox: true }); // neighbouring rows: frame the text of each
  await shot('P11', page.locator('main'), { items: { email: row('Adres e-mail'), messenger: row('Komunikator'), reverse: row('kto jeszcze je publikuje') }, caption: 'Przeszukane źródła' });
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
console.log('done: docs/pitch/assets/shots.json');
