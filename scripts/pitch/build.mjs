// Builds the pitch deck: docs/pitch/deck.html -> PNG previews (docs/pitch/preview/NN.png) and a 10-page PDF (KROPKA_HackNation2026.pdf).
// Also writes the QR code (local `qrcode` library), the speaker notes (NOTATKI.md, from TRESC.md) and the check report (preview/report.json).
// The build FAILS (exit 1) when a layout rule is broken: text overflow, anything outside the slide margins or over the footer, text below 22 px,
// content filling less than 85 % of the content zone, a gap taller than 120 px, columns of different height, a page count other than 10.
// Run: pnpm pitch   (the screenshots in docs/pitch/assets/shots come from `pnpm pitch:capture`, see scripts/pitch/capture.mjs)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { chromium } from 'playwright-core';

const DIR = fileURLToPath(new URL('../../docs/pitch/', import.meta.url));
const at = (p) => `${DIR}${p}`;
const REPO_URL = 'https://github.com/hapole0n/hacknation_2026_bydgoszcz_cebularz_team';
const PDF = at('KROPKA_HackNation2026.pdf');
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const SLIDES = 10;

mkdirSync(at('preview'), { recursive: true });

// ---- QR code (local library, no network) ------------------------------------------------------------------------------------------------------
writeFileSync(at('assets/qr.svg'), await QRCode.toString(REPO_URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16181d', light: '#f6f5f1' } }));

// ---- speaker notes from TRESC.md ---------------------------------------------------------------------------------------------------------------
const tresc = readFileSync(at('TRESC.md'), 'utf8');
const sections = [...tresc.matchAll(/^## (\d\d) · (.+)$/gm)].map((m, i, all) => ({ n: m[1], title: m[2].replace(/\s*\(tło granatowe\)/, ''), body: tresc.slice(m.index, all[i + 1]?.index ?? tresc.indexOf('\n---\n\n## Zrzuty')) }));
const sources = tresc.slice(tresc.indexOf('## Źródła liczb')).split('\n').filter((l) => l.startsWith('- '));
const notes = sections.map((s) => {
  const note = /^- Notatka: (.+)$/m.exec(s.body)?.[1];
  if (!note) throw new Error(`slide ${s.n}: no "Notatka" in TRESC.md`);
  return `## ${s.n} · ${s.title}\n\n${note}\n`;
});
if (notes.length !== SLIDES) throw new Error(`TRESC.md has ${notes.length} slides, expected ${SLIDES}`);
writeFileSync(at('NOTATKI.md'), `# KROPKA — notatki do wystąpienia\n\nPlik generowany przez \`pnpm pitch\` z \`TRESC.md\` (pole „Notatka” każdego slajdu) — nie edytować ręcznie. Przykłady w prezentacji są syntetyczne (sprawa demonstracyjna „Jan Testowy”).\n\n${notes.join('\n')}\n## Źródła liczb ze slajdu 02\n\n${sources.join('\n')}\n`);

// ---- static rules: nothing from a CDN ---------------------------------------------------------------------------------------------------------
const issues = [];
const html = readFileSync(at('deck.html'), 'utf8');
const css = readFileSync(at('deck.css'), 'utf8');
if (/(?:src|href)\s*=\s*["']https?:/i.test(html) || /url\(\s*["']?https?:/i.test(css) || /@import\s+(?:url\()?["']?https?:/i.test(css)) issues.push({ slide: 0, rule: 'no-cdn', msg: 'deck.html / deck.css load something from the network' });

// ---- render -------------------------------------------------------------------------------------------------------------------------------------
const shots = JSON.parse(readFileSync(at('assets/shots.json'), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
await page.goto(pathToFileURL(at('deck.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));

// the photo only when the file exists
if (!existsSync(at('assets/oleh.jpg'))) await page.evaluate(() => document.querySelectorAll('[data-photo]').forEach((e) => e.remove()));

// callouts: put every circle exactly on its element, from the boxes recorded by capture.mjs
const placed = await page.evaluate((shotsJson) => {
  const out = [];
  for (const co of document.querySelectorAll('.co[data-ref]')) {
    const [name, key] = co.dataset.ref.split('.');
    const exh = co.closest('.exh');
    const img = exh.querySelector(`img[data-shot="${name}"]`);
    const box = shotsJson[name]?.boxes?.[key];
    if (!img || !box) { out.push({ ref: co.dataset.ref, error: 'no image or box' }); continue; }
    const scale = img.getBoundingClientRect().width / shotsJson[name].frame.w;
    const er = exh.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const n = (v) => Number(v ?? 0);
    co.style.left = `${ir.left - er.left - exh.clientLeft + (box.x + n(co.dataset.ax) * box.w) * scale + n(co.dataset.dx)}px`;
    co.style.top = `${ir.top - er.top - exh.clientTop + (box.y + n(co.dataset.ay) * box.h) * scale + n(co.dataset.dy)}px`;
    out.push({ ref: co.dataset.ref, scale: +scale.toFixed(3) });
  }
  return out;
}, shots);
for (const p of placed) if (p.error) issues.push({ slide: 0, rule: 'callout', msg: `${p.ref}: ${p.error}` });

// ---- checks (all measured in the page) ----------------------------------------------------------------------------------------------------------
const found = await page.evaluate(({ shotsJson, count }) => {
  const issues = [];
  const imgs = [];
  const slides = Array.from(document.querySelectorAll('.slide'));
  const px = (v) => parseFloat(v);
  const TOL = 6; // a tight line-height lets a glyph box poke a few px out of its line box; that is not an overflow
  const loaded = Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')}:${f.weight}`);
  for (const need of ['IBM Plex Sans:400', 'IBM Plex Sans:500', 'IBM Plex Sans:600', 'IBM Plex Mono:500', 'IBM Plex Mono:600', 'VT323:400'])
    if (!loaded.includes(need)) issues.push({ slide: 0, rule: 'font', msg: `font not loaded: ${need}` });
  if (slides.length !== count) issues.push({ slide: 0, rule: 'slides', msg: `${slides.length} slides, expected ${count}` });

  slides.forEach((slide, i) => {
    const n = i + 1;
    const sr = slide.getBoundingClientRect();
    const rel = (e) => { const r = e.getBoundingClientRect(); return { l: r.left - sr.left, t: r.top - sr.top, r: r.right - sr.left, b: r.bottom - sr.top, w: r.width, h: r.height }; };
    const all = Array.from(slide.querySelectorAll('*')).filter((e) => !(e.closest('svg') && e.tagName !== 'svg'));
    const inBleed = (e) => !!e.closest('[data-bleed]');
    const where = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.split(' ')[0]}` : ''} "${(e.textContent || '').trim().slice(0, 36)}"`;

    for (const e of all) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = rel(e);
      if (r.w === 0 && r.h === 0) continue;
      const own = Array.from(e.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim().length > 0);

      // text must not overflow its block (clipped images by design are not text blocks)
      if (!inBleed(e) && (own || e.children.length > 0) && !e.matches('img,figure.exh') && (e.scrollHeight - e.clientHeight > TOL || e.scrollWidth - e.clientWidth > TOL) && cs.overflow !== 'hidden')
        issues.push({ slide: n, rule: 'overflow', msg: `${where(e)}: scroll ${e.scrollWidth}x${e.scrollHeight} > box ${e.clientWidth}x${e.clientHeight}` });
      if (own && (e.scrollHeight - e.clientHeight > TOL || e.scrollWidth - e.clientWidth > TOL) && cs.overflow === 'hidden' && !inBleed(e))
        issues.push({ slide: n, rule: 'overflow', msg: `${where(e)}: text is clipped` });

      // nothing outside the margins (left/right 96, top 80, bottom 112 -> y <= 968); the footer is the one thing below
      if (!e.closest('.foot') && !e.classList.contains('foot')) {
        const bleed = e.hasAttribute('data-bleed');
        const maxR = bleed ? 1920 : 1824;
        if (r.l < 95.5 && !inBleed(e) || (r.r > maxR + 0.5 && !inBleed(e)) || r.t < 79.5 || r.b > 968.5) {
          if (!inBleed(e)) issues.push({ slide: n, rule: 'bounds', msg: `${where(e)}: ${Math.round(r.l)},${Math.round(r.t)} - ${Math.round(r.r)},${Math.round(r.b)} leaves the 96/80/1824/968 frame` });
        }
        if (bleed && (r.l < 95.5 || r.t < 79.5 || r.b > 968.5)) issues.push({ slide: n, rule: 'bounds', msg: `${where(e)}: bleeding block leaves the frame` });
      }

      // text no smaller than 22 px
      if (own && px(cs.fontSize) < 21.99) issues.push({ slide: n, rule: 'font-size', msg: `${where(e)}: ${cs.fontSize}` });

      // a product frame is never enlarged, and its text should stay readable
      if (e.tagName === 'IMG' && e.dataset.shot) {
        const shot = shotsJson[e.dataset.shot];
        const scale = r.w / shot.frame.w;
        imgs.push({ slide: n, shot: e.dataset.shot, displayedWidth: Math.round(r.w), naturalCssWidth: shot.frame.w, scale: +scale.toFixed(3) });
        if (scale > 1.005) issues.push({ slide: n, rule: 'upscaled', msg: `${e.dataset.shot} is shown at ${scale.toFixed(2)}x` });
        if (scale < 0.8) issues.push({ slide: n, rule: 'small-ui', msg: `${e.dataset.shot} is shown at ${scale.toFixed(2)}x: its text gets too small` });
      }
      if (e.tagName === 'IMG' && !(e.naturalWidth > 0)) issues.push({ slide: n, rule: 'image', msg: `${e.getAttribute('src')} did not load` });
    }

    // fill of the content zone (y 300..968): at least 85 %, no gap taller than 120 px, columns of one height
    const zone = { t: 300, b: 968 };
    const parts = all.filter((e) => !e.closest('.foot') && !e.classList.contains('eyebrow') && !e.classList.contains('title') && !e.classList.contains('foot') && e !== slide);
    const spans = parts.map(rel).filter((r) => r.w > 0 && r.h > 0 && r.b > zone.t && r.t < zone.b).map((r) => [Math.max(r.t, zone.t), Math.min(r.b, zone.b)]).sort((a, b) => a[0] - b[0]);
    let top = Infinity; let bottom = -Infinity; let cursor = zone.t; let maxGap = 0;
    for (const [a, b] of spans) {
      top = Math.min(top, a); bottom = Math.max(bottom, b);
      if (a > cursor) maxGap = Math.max(maxGap, a - cursor);
      cursor = Math.max(cursor, b);
    }
    maxGap = Math.max(maxGap, zone.b - cursor);
    const fill = spans.length ? (bottom - top) / (zone.b - zone.t) : 0;
    if (fill < 0.85) issues.push({ slide: n, rule: 'fill', msg: `content spans ${(fill * 100).toFixed(0)} % of the content zone` });
    if (maxGap > 120) issues.push({ slide: n, rule: 'gap', msg: `an empty band of ${Math.round(maxGap)} px in the content zone` });
    const byParent = new Map();
    for (const c of slide.querySelectorAll('[data-col]')) (byParent.get(c.parentElement) ?? byParent.set(c.parentElement, []).get(c.parentElement)).push(c);
    for (const cols of byParent.values()) {
      const hs = cols.map((c) => c.getBoundingClientRect().height);
      if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 2) issues.push({ slide: n, rule: 'columns', msg: `neighbouring columns differ in height: ${hs.map(Math.round).join(' / ')}` });
    }

    // one-word last lines
    for (const e of all.filter((x) => Array.from(x.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim().length > 12) && !x.closest('.foot'))) {
      const range = document.createRange();
      const rows = new Map();
      for (const node of Array.from(e.childNodes).filter((c) => c.nodeType === 3)) {
        const re = /\S+/g; let m;
        while ((m = re.exec(node.textContent))) {
          range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
          const rc = range.getClientRects()[0];
          if (!rc) continue;
          const key = Math.round(rc.top / 4);
          rows.set(key, [...(rows.get(key) ?? []), m[0]]);
        }
      }
      const lines = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      if (lines.length >= 2 && lines.at(-1).length === 1 && lines.at(-1)[0].length > 2 && !/^[\d.,:%/-]+$/.test(lines.at(-1)[0])) issues.push({ slide: n, rule: 'widow', msg: `${where(e)}: last line is the single word "${lines.at(-1)[0]}"` });
    }
  });
  return { issues, imgs };
}, { shotsJson: shots, count: SLIDES });
issues.push(...found.issues);

// ---- previews and PDF ---------------------------------------------------------------------------------------------------------------------------
const slideEls = page.locator('.slide');
for (let i = 0; i < SLIDES; i++) await slideEls.nth(i).screenshot({ path: at(`preview/${String(i + 1).padStart(2, '0')}.png`) });
await page.pdf({ path: PDF, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
await browser.close();

const pdfBytes = readFileSync(PDF);
const pages = (pdfBytes.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
const size = statSync(PDF).size;
// only the deck's own fonts may end up in the PDF: a glyph missing in Plex / VT323 would be taken from a system font (Consolas, Arial ...)
const fontNames = [...new Set([...pdfBytes.toString('latin1').matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([^\s/\]>]+)/g)].map((m) => m[1]))];
for (const f of fontNames) if (!/^(IBMPlex(Sans|Mono)|VT323)/.test(f)) issues.push({ slide: 0, rule: 'pdf-fonts', msg: `font outside the deck's set in the PDF: ${f}` });
if (pages !== SLIDES) issues.push({ slide: 0, rule: 'pdf-pages', msg: `the PDF has ${pages} pages, expected ${SLIDES}` });
if (size > MAX_PDF_BYTES) issues.push({ slide: 0, rule: 'pdf-size', msg: `the PDF is ${(size / 1048576).toFixed(1)} MB (limit 15)` });

writeFileSync(at('preview/report.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), ok: issues.length === 0, pdf: { file: 'KROPKA_HackNation2026.pdf', pages, bytes: size, fonts: fontNames }, callouts: placed, productFrames: found.imgs, issues }, null, 2)}\n`);
console.log(`PDF: ${pages} pages, ${(size / 1048576).toFixed(2)} MB`);
if (issues.length) {
  for (const x of issues) console.error(`slide ${String(x.slide).padStart(2, '0')} [${x.rule}] ${x.msg}`);
  console.error(`${issues.length} problem(s) - see docs/pitch/preview/report.json`);
  process.exit(1);
}
console.log('all checks passed');
