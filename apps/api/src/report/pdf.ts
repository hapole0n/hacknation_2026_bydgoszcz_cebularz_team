import { join } from 'node:path';
import pdfmake from 'pdfmake';
import type { Content, TableCell } from 'pdfmake';
import { repoPath } from '../paths.js';
import { fmtDateTime, type Block, type ReportDoc, type ReportSection, type StatementKind } from '@kropka/core';

export interface ReportIntegrity {
  generatedAt: string;
  /** SHA-256 of the report data (the canonical JSON of the document). */
  sha256: string;
  /** SHA-256 over the sorted SHA-256 of every evidence item. */
  evidenceSha256: string;
}

// The fonts of the application (docs/design/SPEC.md): IBM Plex Mono for the text, VT323 for the big headings. Both are SIL OFL-1.1; the
// unmodified files and their licences are in apps/api/assets/fonts (the web uses the same fonts through @fontsource). The PDF embeds the subset it uses.
const fontsDir = repoPath('apps/api/assets/fonts');
const plex = (style: string) => join(fontsDir, 'ibm-plex-mono', `IBMPlexMono-${style}.woff`);
const vt = join(fontsDir, 'vt323', 'VT323-Regular.ttf');
pdfmake.setFonts({
  Plex: { normal: plex('Regular'), bold: plex('Bold'), italics: plex('Italic'), bolditalics: plex('BoldItalic') },
  VT: { normal: vt, bold: vt, italics: vt, bolditalics: vt },
});
pdfmake.setLocalAccessPolicy((path) => path.startsWith(fontsDir)); // nothing but the bundled fonts may be read
pdfmake.setUrlAccessPolicy(() => false); // and nothing is fetched from the network

const PAGE_WIDTH = 595.28 - 80;
// pdfmake adds the cell padding on top of fixed column widths; leave room for it so tables stay inside the margins.
const CELL_PAD = 8;
// The desktop palette on a light page (SPEC.md): ink text, navy headings and labels, grey rules; the alert colour is not used on paper.
const INK = '#2a2a2a';
const NAVY = '#1c2f7a';
const MUTED = '#555555';
const RULE = '#9a9a9a';
const HEAD_FILL = '#dfdfdf';

/** `[FAKT]` / `[OBLICZENIE]` / `[WNIOSEK]`: a word in brackets, the same labels as on screen. */
const chip = (kind: StatementKind): Content => ({ text: `[${kind}]`, color: NAVY, bold: true, fontSize: 7, width: 70 } as Content);

/** VT323 has no arrows; a name typed by the analyst may contain one. */
const vtSafe = (s: string) => s.replace(/↔/g, '<->').replace(/[→⟶]/g, '->').replace(/←/g, '<-');

const rule = (width = PAGE_WIDTH): Content => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.8, lineColor: INK }, { type: 'line', x1: 0, y1: 2.2, x2: width, y2: 2.2, lineWidth: 0.8, lineColor: INK }], margin: [0, 2, 0, 6] });

function tableBlock(b: Extract<Block, { type: 'table' }>): Content {
  const weights = b.weights ?? b.columns.map(() => 1);
  const total = weights.reduce((s, w) => s + w, 0);
  const cell = (text: string, ci: number): TableCell => ({ text, fontSize: b.mono?.includes(ci) ? 6.2 : 7, color: INK });
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: weights.map((w) => (w / total) * (PAGE_WIDTH - CELL_PAD * weights.length)),
      body: [b.columns.map((c) => ({ text: c.toUpperCase(), bold: true, fontSize: 6.6, color: INK, fillColor: HEAD_FILL })), ...b.rows.map((r) => r.map(cell))],
    },
    layout: { hLineWidth: (i: number) => (i === 1 ? 1.2 : 0.4), vLineWidth: () => 0, hLineColor: (i: number) => (i === 1 ? INK : RULE), paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4, paddingRight: () => 4 },
    margin: [0, 2, 0, 8],
  };
}

function block(b: Block, section: ReportSection): Content {
  switch (b.type) {
    case 'heading':
      return { text: b.text, bold: true, fontSize: 9, color: INK, margin: [0, 8, 0, 3] };
    case 'list':
      return { ul: b.items.map((t) => ({ text: t, fontSize: 8.3 })), margin: [0, 2, 0, 8] };
    case 'table':
      // the section heading already carries its label; a table only repeats it when its own label differs
      return b.kind && b.kind !== section.kind ? { stack: [{ columns: [chip(b.kind)], margin: [0, 2, 0, 3] }, tableBlock(b)] } : tableBlock(b);
    case 'text':
      return b.kind
        ? { columns: [chip(b.kind), { stack: [{ text: b.text, fontSize: 8.3 }, ...(b.basis ? [{ text: `Podstawa: ${b.basis}`, fontSize: 7, color: MUTED, italics: true, margin: [0, 2, 0, 0] } as Content] : [])] }], columnGap: 6, margin: [0, 2, 0, 8] }
        : { text: b.text, fontSize: 8.3, margin: [0, 2, 0, 8] };
  }
}

const sectionHeading = (s: ReportSection, first: boolean): Content => ({
  stack: [{ columns: [{ text: `${s.number}. ${s.title}`, style: 'h2', tocItem: true, width: '*' }, ...(s.kind ? [chip(s.kind)] : [])] }, rule()],
  margin: [0, 14, 0, 4],
  unbreakable: true,
  ...(first ? { pageBreak: 'before' as const } : {}),
});

/** The one place that renders the report document as a PDF (local, no browser; fonts are embedded). */
export async function renderPdf(source: ReportDoc, integrity: ReportIntegrity): Promise<Buffer> {
  const doc = source;
  const sections: Content[] = [];
  for (const [i, s] of doc.sections.entries()) {
    sections.push(sectionHeading(s, i === 0), ...s.blocks.map((b) => block(b, s)));
    if (s.id === 'meta')
      sections.push(
        { text: 'Integralność raportu', bold: true, fontSize: 9, margin: [0, 8, 0, 3] },
        table2([
          ['Raport wygenerowano', fmtDateTime(integrity.generatedAt)],
          ['SHA-256 danych raportu', integrity.sha256],
          ['SHA-256 zbioru dowodów', integrity.evidenceSha256],
        ]),
      );
  }

  const definition = {
    pageSize: 'A4' as const,
    pageMargins: [40, 56, 40, 52] as [number, number, number, number],
    info: { title: `${doc.title} — ${doc.caseTitle}`, author: doc.appName, subject: 'Analiza OSINT adresów kryptowalutowych' },
    defaultStyle: { font: 'Plex', fontSize: 8.3, lineHeight: 1.3, color: INK },
    styles: { h1: { font: 'VT', fontSize: 34, color: NAVY }, h2: { font: 'VT', fontSize: 20, color: NAVY }, h3: { font: 'VT', fontSize: 15, color: NAVY } },
    header: (page: number) => (page === 1 ? undefined : { text: `${doc.appName} — ${doc.title}: ${doc.caseTitle}`, fontSize: 7, color: MUTED, margin: [40, 24, 40, 0] }),
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `SHA-256: ${integrity.sha256.slice(0, 16)}…`, fontSize: 6.5, color: MUTED },
        { text: `Strona ${page} z ${pages}`, fontSize: 7, color: MUTED, alignment: 'right' },
      ],
      margin: [40, 18, 40, 0],
    }),
    content: [
      // the title bar of the window, on paper
      { table: { widths: ['*'], body: [[{ text: `${doc.appName} — ${doc.title}`, color: '#ffffff', bold: true, fontSize: 9, margin: [4, 3, 4, 3] }]] }, layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => NAVY }, margin: [0, 0, 0, 14] },
      { text: vtSafe(doc.caseTitle), style: 'h1', margin: [0, 0, 0, 8] },
      table2(doc.meta),
      { text: 'Podsumowanie', style: 'h2', margin: [0, 14, 0, 0] },
      rule(),
      { text: 'W pięciu zdaniach:', fontSize: 7.3, color: MUTED, margin: [0, 0, 0, 3] },
      { ol: doc.summary.map((t) => ({ text: t, fontSize: 9, margin: [0, 0, 0, 3] })) },
      { text: 'Jak czytać ten raport', style: 'h2', margin: [0, 14, 0, 0] },
      rule(),
      ...doc.legend.map((l): Content => ({ columns: [chip(l.kind), { text: l.text, fontSize: 8 }], columnGap: 6, margin: [0, 0, 0, 4] })),
      { toc: { title: { text: 'Spis treści', style: 'h2', margin: [0, 16, 0, 4] } }, margin: [0, 0, 0, 0] },
      ...sections,
      { stack: [{ text: 'Słowniczek', style: 'h2', tocItem: true }, rule()], margin: [0, 18, 0, 6], pageBreak: 'before' },
      { table: { headerRows: 1, widths: [120, PAGE_WIDTH - 120 - 2 * CELL_PAD], body: [[{ text: 'POJĘCIE', bold: true, fontSize: 6.6, fillColor: HEAD_FILL }, { text: 'WYJAŚNIENIE', bold: true, fontSize: 6.6, fillColor: HEAD_FILL }], ...doc.glossary.map((g): TableCell[] => [{ text: g.term, bold: true, fontSize: 7.3 }, { text: g.definition, fontSize: 7.3 }])] }, layout: { hLineWidth: (i: number) => (i === 1 ? 1.2 : 0.4), vLineWidth: () => 0, hLineColor: (i: number) => (i === 1 ? INK : RULE), paddingTop: () => 3, paddingBottom: () => 3 } },
    ],
  };
  return pdfmake.createPdf(definition as never).getBuffer();
}

function table2(rows: [string, string][]): Content {
  return {
    table: { widths: [120, PAGE_WIDTH - 120 - 2 * CELL_PAD], body: rows.map(([k, v]) => [{ text: k, color: MUTED, fontSize: 7.3 }, { text: v, fontSize: /^[0-9a-f]{64}$/.test(v) ? 6.2 : 8 }]) },
    layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => RULE, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4 },
    margin: [0, 0, 0, 6],
  };
}
