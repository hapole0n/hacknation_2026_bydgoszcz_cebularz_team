// Builds the pitch deck (v3, Win95): docs/pitch/deck.html -> PNG previews (docs/pitch/preview/NN.png) and a 10-page PDF (KROPKA_HackNation2026.pdf).
// Also lays out the windows of the product and the annotations from docs/pitch/assets/shots.json (made by `pnpm pitch:capture`), writes the QR code
// (local `qrcode` library), the speaker notes (NOTATKI.md, from TRESC.md) and the check report (preview/report.json).
// The build FAILS (exit 1) when a rule of the brief is broken - see `found` below: slide count (10 at most), fonts in the PDF, overflow / clipped text,
// headings (<= 7 words, >= 84 px), points (<= 3, <= 8 words, >= 32 px), anything outside the desktop 44/36 - 1876/972, windows not from y=36 to y=972,
// an empty band > 120 px in a window, product frames (scale 1.3 - 2.0, cover >= 1.2; proportions; filling the window; exactly one window frame)
// and annotations (number in the rail, frame inside the image). Words = tokens of at least 3 letters / digits (prepositions and symbols are not counted).
// Run: pnpm pitch
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { chromium } from 'playwright-core';

const DIR = fileURLToPath(new URL('../../docs/pitch/', import.meta.url));
const at = (p) => `${DIR}${p}`;
const REPO_URL = 'https://github.com/hapole0n/hacknation_2026_bydgoszcz_cebularz_team';
const PDF = at('KROPKA_HackNation2026.pdf');
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const SLIDES = 10; // the competition allows at most 10 slides

mkdirSync(at('preview'), { recursive: true });

// ---- QR code (local library, no network): dark on the white of the contact window --------------------------------------------------------------
writeFileSync(at('assets/qr.svg'), await QRCode.toString(REPO_URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#2a2a2a', light: '#ffffff' } }));

// ---- speaker notes from TRESC.md ---------------------------------------------------------------------------------------------------------------
const tresc = readFileSync(at('TRESC.md'), 'utf8');
const end = tresc.indexOf('\n---\n\n## Zrzuty');
const sections = [...tresc.matchAll(/^## (\d\d) · (.+)$/gm)].map((m, i, all) => ({ n: m[1], title: m[2], body: tresc.slice(m.index, all[i + 1]?.index ?? end) }));
const sources = tresc.slice(tresc.indexOf('## Źródła liczb')).split('\n').filter((l) => l.startsWith('- '));
const notes = sections.map((s) => {
  const note = /^- Notatka: (.+)$/m.exec(s.body)?.[1];
  if (!note) throw new Error(`slide ${s.n}: no "Notatka" in TRESC.md`);
  return `## ${s.n} · ${s.title}\n\n${note}\n`;
});
if (notes.length !== SLIDES) throw new Error(`TRESC.md has ${notes.length} slides, expected ${SLIDES}`);
writeFileSync(at('NOTATKI.md'), `# KROPKA — notatki do wystąpienia\n\nPlik generowany przez \`pnpm pitch\` z \`TRESC.md\` (pole „Notatka” każdego slajdu) — nie edytować ręcznie. Przykłady w prezentacji są syntetyczne (sprawa demonstracyjna „Jan Testowy”).\n\n${notes.join('\n')}\n## Źródła liczb ze slajdu 02\n\n${sources.join('\n')}\n`);

// ---- static rules: nothing from a CDN, no other font than Plex Mono and VT323 ---------------------------------------------------------------------
const issues = [];
const html = readFileSync(at('deck.html'), 'utf8');
const css = readFileSync(at('deck.css'), 'utf8');
if (/(?:src|href)\s*=\s*["']https?:/i.test(html) || /url\(\s*["']?https?:/i.test(css) || /@import\s+(?:url\()?["']?https?:/i.test(css)) issues.push({ slide: 0, rule: 'no-cdn', msg: 'deck.html / deck.css load something from the network' });
if (/ibm-plex-sans/i.test(css) || /IBM Plex Sans/i.test(css)) issues.push({ slide: 0, rule: 'fonts', msg: 'IBM Plex Sans must not be used in the deck' });

// ---- render -------------------------------------------------------------------------------------------------------------------------------------
const shots = JSON.parse(readFileSync(at('assets/shots.json'), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome' });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
await page.goto(pathToFileURL(at('deck.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));

// the photo only when the file exists
if (!existsSync(at('assets/oleh.jpg'))) await page.evaluate(() => document.querySelectorAll('[data-photo-box]').forEach((e) => e.remove()));

// ---- layout: the product window gets the size of its frame (scale = client height / frame height), the presentation window the rest; then the annotations ----
const layout = await page.evaluate((shotsJson) => {
  const out = [];
  for (const app of document.querySelectorAll('.app[data-shot]')) {
    const name = app.dataset.shot;
    const shot = shotsJson[name];
    const own = app.classList.contains('own');
    const slide = app.closest('.slide');
    const left = slide.querySelector('.win.left');
    const client = app.querySelector('.client');
    const img = client.querySelector('img');
    const clientH = own ? 936 : 870;
    const s = clientH / shot.frame.h;
    const clientW = Math.round(shot.frame.w * s);
    const appW = own ? clientW : clientW + 12;
    app.style.width = `${appW}px`;
    left.style.width = `${1832 - 72 - appW}px`;
    client.style.width = `${clientW}px`;
    client.style.height = `${clientH}px`;
    img.style.width = `${clientW}px`;
    img.style.height = `${clientH}px`;
    const info = { slide: slide.id, name, scale: +s.toFixed(3), clientW, clientH, appW, marks: [] };
    const keys = (app.dataset.marks ?? '').split(' ').filter(Boolean);
    const railLeft = left.getBoundingClientRect().right;
    const cr = client.getBoundingClientRect();
    keys.forEach((key, i) => {
      const b = shot.boxes[key];
      if (!b) { info.marks.push({ key, error: 'no box in shots.json' }); return; }
      const mark = document.createElement('i');
      mark.className = 'mark';
      Object.assign(mark.style, { left: `${b.x * s - 8}px`, top: `${b.y * s - 8}px`, width: `${b.w * s + 16}px`, height: `${b.h * s + 16}px` });
      const pin = document.createElement('span');
      pin.className = 'pin';
      const badgeLeft = railLeft - cr.left; // the badge starts where the presentation window ends: it stands in the rail
      const lineW = b.x * s - 8 - (badgeLeft + 44);
      pin.style.left = `${badgeLeft}px`;
      pin.style.top = `${b.lineY * s - 22}px`;
      pin.innerHTML = `<b class="badge">${i + 1}</b><i class="lead" style="width:${Math.max(0, lineW)}px"></i>`;
      client.append(mark, pin);
      info.marks.push({ key, n: i + 1, x: +(b.x * s - 8).toFixed(1), y: +(b.y * s - 8).toFixed(1), w: +(b.w * s + 16).toFixed(1), h: +(b.h * s + 16).toFixed(1), lineY: +(b.lineY * s).toFixed(1) });
    });
    out.push(info);
  }
  return out;
}, shots);

// ---- checks (all measured in the page) ----------------------------------------------------------------------------------------------------------
const found = await page.evaluate(({ shotsJson, count }) => {
  const issues = [];
  const frames = [];
  const slides = Array.from(document.querySelectorAll('.slide'));
  const px = (v) => parseFloat(v);
  const alnum = /[A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g;
  const tokens = (t) => t.replace(/ /g, ' ').split(/\s+/).filter(Boolean);
  const words = (t) => tokens(t).filter((w) => (w.match(alnum) ?? []).length >= 3).length;
  const loaded = Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/"/g, '')}:${f.weight}`);
  for (const need of ['IBM Plex Mono:400', 'IBM Plex Mono:700', 'VT323:400']) if (!loaded.includes(need)) issues.push({ slide: 0, rule: 'font', msg: `font not loaded: ${need}` });
  if (slides.length > count) issues.push({ slide: 0, rule: 'slides', msg: `${slides.length} slides, the maximum is ${count}` });

  slides.forEach((slide, i) => {
    const n = i + 1;
    const sr = slide.getBoundingClientRect();
    const rel = (e) => { const r = e.getBoundingClientRect(); return { l: r.left - sr.left, t: r.top - sr.top, r: r.right - sr.left, b: r.bottom - sr.top, w: r.width, h: r.height }; };
    const all = Array.from(slide.querySelectorAll('*')).filter((e) => !(e.closest('svg') && e.tagName !== 'svg'));
    const where = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? `.${e.className.split(' ')[0]}` : ''} "${(e.textContent || '').trim().slice(0, 36)}"`;
    const visible = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; };
    const ownText = (e) => Array.from(e.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim().length > 0);
    const inTask = (e) => !!e.closest('.task');

    for (const e of all) {
      if (!visible(e)) continue;
      const cs = getComputedStyle(e);
      const r = rel(e);
      const own = ownText(e);
      const vt = cs.fontFamily.includes('VT323');
      const tolH = vt ? 0.32 * px(cs.fontSize) : 4;

      // text must not overflow or be clipped (also by an ellipsis in a window title)
      if (e.tagName !== 'IMG' && e.tagName !== 'svg' && (own || e.children.length > 0) && (e.scrollWidth - e.clientWidth > 3 || e.scrollHeight - e.clientHeight > tolH))
        issues.push({ slide: n, rule: 'overflow', msg: `${where(e)}: scroll ${e.scrollWidth}x${e.scrollHeight} > box ${e.clientWidth}x${e.clientHeight}` });
      if (own && cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth) issues.push({ slide: n, rule: 'ellipsis', msg: `${where(e)}: the title is cut` });

      // nothing outside the desktop 44/36 - 1876/972, except the task bar
      if (!inTask(e) && e !== slide && (r.l < 43.5 || r.r > 1876.5 || r.t < 35.5 || r.b > 972.5)) issues.push({ slide: n, rule: 'bounds', msg: `${where(e)}: ${Math.round(r.l)},${Math.round(r.t)} - ${Math.round(r.r)},${Math.round(r.b)} leaves the desktop 44/36-1876/972` });

      // text size: >= 32 px (chrome of windows, tags, badges and the one line of small print are exempt)
      if (own && !e.closest('.task, .tbar, .ctb, .tag, .tagred, .badge')) {
        const size = px(cs.fontSize);
        if (e.classList.contains('muted')) { if (size < 23.99) issues.push({ slide: n, rule: 'font-size', msg: `${where(e)}: ${size}px small print` }); }
        else if (size < 31.99) issues.push({ slide: n, rule: 'font-size', msg: `${where(e)}: ${size}px (text must be >= 32 px)` });
      }
    }

    // at most one line of small print
    const small = slide.querySelectorAll('.muted');
    if (small.length > 1) issues.push({ slide: n, rule: 'small-print', msg: `${small.length} small-print lines (one allowed)` });

    // headings: <= 7 words, >= 84 px
    for (const h of slide.querySelectorAll('[data-head]')) {
      const plain = tokens(h.textContent).filter((t) => /[A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(t)).length;
      if (plain > 7) issues.push({ slide: n, rule: 'heading-words', msg: `heading has ${plain} words: ${h.textContent.trim()}` });
      for (const t of [h, ...h.querySelectorAll('*')].filter(ownText)) if (px(getComputedStyle(t).fontSize) < 83.99) issues.push({ slide: n, rule: 'heading-size', msg: `${where(t)}: ${getComputedStyle(t).fontSize} (heading >= 84 px)` });
    }
    // points: at most 3 per list, each at most 8 words
    const pts = Array.from(slide.querySelectorAll('.pt'));
    if (pts.length > 3) issues.push({ slide: n, rule: 'points', msg: `${pts.length} points (max 3)` });
    for (const p of pts) { const t = p.querySelector('span').textContent; if (words(t) > 8) issues.push({ slide: n, rule: 'point-words', msg: `${words(t)} words: ${t}` }); }
    const rows = Array.from(slide.querySelectorAll('[data-pt]'));
    if (rows.length > 3) issues.push({ slide: n, rule: 'points', msg: `${rows.length} rows (max 3)` });
    for (const p of rows) if (words(p.textContent) > 8) issues.push({ slide: n, rule: 'point-words', msg: `${words(p.textContent)} words: ${p.textContent}` });
    for (const list of slide.querySelectorAll('[data-list]')) {
      const items = list.children.length;
      if (items > Number(list.dataset.list)) issues.push({ slide: n, rule: 'points', msg: `list of ${items} items (max ${list.dataset.list})` });
      for (const it of list.children) if (words(it.textContent) > 8) issues.push({ slide: n, rule: 'point-words', msg: `${words(it.textContent)} words: ${it.textContent}` });
    }

    // windows (and the product window) from y=36 to y=972
    for (const w of slide.querySelectorAll('.win, .app')) {
      const r = rel(w);
      if (Math.abs(r.t - 36) > 2 || Math.abs(r.b - 972) > 2) issues.push({ slide: n, rule: 'window', msg: `${where(w)}: y ${Math.round(r.t)} - ${Math.round(r.b)}, expected 36 - 972` });
    }

    // an empty band taller than 120 px inside a presentation window: boxes with text, a visible border or a background count as content
    for (const w of slide.querySelectorAll('.win')) {
      const wr = rel(w);
      const tb = w.querySelector('.tbar');
      const top = rel(tb).b;
      const bottom = wr.b - 8;
      const boxes = Array.from(w.querySelectorAll('*'))
        .filter((e) => e !== tb && !tb.contains(e) && visible(e) && !(e.closest('svg') && e.tagName !== 'svg'))
        .filter((e) => { const cs = getComputedStyle(e); return ownText(e) || e.tagName === 'IMG' || e.tagName === 'svg' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || px(cs.borderTopWidth) > 0 || px(cs.borderLeftWidth) > 0; })
        .map((e) => { const r = rel(e); return [Math.max(r.t, top), Math.min(r.b, bottom)]; })
        .filter(([a, b]) => b > a)
        .sort((a, b) => a[0] - b[0]);
      let cursor = top; let gap = 0;
      for (const [a, b] of boxes) { gap = Math.max(gap, a - cursor); cursor = Math.max(cursor, b); }
      gap = Math.max(gap, bottom - cursor);
      if (gap > 120) issues.push({ slide: n, rule: 'gap', msg: `an empty band of ${Math.round(gap)} px inside the window "${(tb.querySelector('.ttl')?.textContent ?? '').slice(0, 30)}"` });
    }

    // product windows: scale, proportions, fills the window, exactly one window frame, annotations
    for (const app of slide.querySelectorAll('.app[data-shot]')) {
      const name = app.dataset.shot;
      const shot = shotsJson[name];
      const own = app.classList.contains('own');
      const client = app.querySelector('.client');
      const img = client.querySelector('img');
      const ir = img.getBoundingClientRect();
      const cr = client.getBoundingClientRect();
      const ar = app.getBoundingClientRect();
      const scale = ir.width / shot.frame.w;
      const minScale = name === 'P1' ? 1.2 : 1.3;
      const aspect = (ir.width / ir.height) / (img.naturalWidth / img.naturalHeight);
      const frameCount = app.querySelectorAll('.tbar').length + (shot.own ? 1 : 0);
      frames.push({ slide: n, shot: name, scale: +scale.toFixed(3), aspectError: +(Math.abs(aspect - 1) * 100).toFixed(3), windowFrames: frameCount, size: `${Math.round(ir.width)}x${Math.round(ir.height)}` });
      if (scale < minScale || scale > 2.0001) issues.push({ slide: n, rule: 'scale', msg: `${name} is shown at ${scale.toFixed(2)}x (allowed ${minScale}-2.0)` });
      if (Math.abs(aspect - 1) > 0.005) issues.push({ slide: n, rule: 'proportions', msg: `${name}: proportions off by ${(Math.abs(aspect - 1) * 100).toFixed(2)} %` });
      const pad = own ? 0 : 6;
      if (Math.abs(ir.left - cr.left) > 1 || Math.abs(ir.right - cr.right) > 1 || Math.abs(ir.top - cr.top) > 1 || Math.abs(ir.bottom - cr.bottom) > 1 || Math.abs(cr.right - (ar.right - pad)) > 1.5 || Math.abs(cr.bottom - (ar.bottom - pad)) > 1.5 || Math.abs(cr.left - (ar.left + pad)) > 1.5)
        issues.push({ slide: n, rule: 'fill', msg: `${name}: the frame does not fill the window of the product` });
      if (own !== !!shot.own || frameCount !== 1) issues.push({ slide: n, rule: 'window-frames', msg: `${name}: ${frameCount} window frame(s) (own frame in the image: ${!!shot.own}, drawn: ${app.querySelectorAll('.tbar').length})` });
      if (!(img.naturalWidth > 0)) issues.push({ slide: n, rule: 'image', msg: `${name} did not load` });

      // annotations: at most 3, numbers = the numbers of the points on the left, the number in the rail, the frame inside the image
      const left = slide.querySelector('.win.left');
      const rail = { l: left.getBoundingClientRect().right, r: ar.left };
      const marks = Array.from(client.querySelectorAll('.mark'));
      const pins = Array.from(client.querySelectorAll('.pin'));
      if (marks.length > 3) issues.push({ slide: n, rule: 'annotations', msg: `${marks.length} frames (max 3)` });
      const pointNumbers = Array.from(slide.querySelectorAll('.pt .badge')).map((b) => b.textContent.trim());
      const pinNumbers = pins.map((p) => p.querySelector('.badge').textContent.trim());
      if (pinNumbers.join() !== pointNumbers.join()) issues.push({ slide: n, rule: 'numbers', msg: `numbers on the screenshot (${pinNumbers.join(',')}) differ from the points on the left (${pointNumbers.join(',')})` });
      for (const p of pins) {
        const b = p.querySelector('.badge').getBoundingClientRect();
        if (b.left < rail.l - 0.5 || b.right > rail.r + 0.5) issues.push({ slide: n, rule: 'rail', msg: `number ${p.querySelector('.badge').textContent} is outside the rail (${Math.round(b.left)}-${Math.round(b.right)} vs ${Math.round(rail.l)}-${Math.round(rail.r)})` });
      }
      for (const m of marks) {
        const r = m.getBoundingClientRect();
        if (r.left < ir.left - 0.5 || r.top < ir.top - 0.5 || r.right > ir.right + 0.5 || r.bottom > ir.bottom + 0.5) issues.push({ slide: n, rule: 'annotation-frame', msg: `${name}: an annotation frame leaves the image` });
      }
      // the numbers must not touch each other
      const ys = pins.map((p) => p.getBoundingClientRect().top).sort((a, b) => a - b);
      for (let k = 1; k < ys.length; k++) if (ys[k] - ys[k - 1] < 46) issues.push({ slide: n, rule: 'numbers', msg: `${name}: two numbers overlap in the rail` });
      // the title of the presentation window must be whole
      const ttl = left.querySelector('.ttl');
      if (ttl.scrollWidth > ttl.clientWidth + 1) issues.push({ slide: n, rule: 'ellipsis', msg: `the title of the window is cut: ${ttl.textContent}` });
    }
  });
  return { issues, frames };
}, { shotsJson: shots, count: SLIDES });
issues.push(...found.issues);
for (const m of layout.flatMap((l) => l.marks.filter((x) => x.error).map((x) => `${l.name}.${x.key}: ${x.error}`))) issues.push({ slide: 0, rule: 'annotation', msg: m });

// ---- previews and PDF ---------------------------------------------------------------------------------------------------------------------------
const slideEls = page.locator('.slide');
for (let i = 0; i < SLIDES; i++) await slideEls.nth(i).screenshot({ path: at(`preview/${String(i + 1).padStart(2, '0')}.png`) });
await page.pdf({ path: PDF, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
await browser.close();

const pdfBytes = readFileSync(PDF);
const pdfText = pdfBytes.toString('latin1');
const pages = (pdfText.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
const size = statSync(PDF).size;
// only the deck's own fonts may end up in the PDF: a glyph missing in Plex Mono / VT323 would be taken from a system font (Consolas, Arial ...)
const fontNames = [...new Set([...pdfText.matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([^\s/\]>]+)/g)].map((m) => m[1]))];
for (const f of fontNames) if (!/^(IBMPlexMono|VT323)/.test(f)) issues.push({ slide: 0, rule: 'pdf-fonts', msg: `font outside IBM Plex Mono / VT323 in the PDF: ${f}` });
if (pages > SLIDES) issues.push({ slide: 0, rule: 'pdf-pages', msg: `the PDF has ${pages} pages, the maximum is ${SLIDES}` });
if (size > MAX_PDF_BYTES) issues.push({ slide: 0, rule: 'pdf-size', msg: `the PDF is ${(size / 1048576).toFixed(1)} MB (limit 15)` });

writeFileSync(at('preview/report.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), ok: issues.length === 0, pdf: { file: 'KROPKA_HackNation2026.pdf', pages, bytes: size, fonts: fontNames }, productFrames: found.frames, layout, issues }, null, 2)}\n`);
console.log(`PDF: ${pages} pages, ${(size / 1048576).toFixed(2)} MB; fonts: ${fontNames.join(', ')}`);
if (issues.length) {
  for (const x of issues) console.error(`slide ${String(x.slide).padStart(2, '0')} [${x.rule}] ${x.msg}`);
  console.error(`${issues.length} problem(s) - see docs/pitch/preview/report.json`);
  process.exit(1);
}
console.log('all checks passed');
