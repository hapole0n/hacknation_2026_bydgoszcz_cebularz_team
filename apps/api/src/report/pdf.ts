import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import pdfmake from 'pdfmake';
import type { Content, TableCell } from 'pdfmake';
import { fmtDateTime, type Block, type ReportDoc, type ReportSection, type StatementKind } from '@kropka/core';

export interface ReportIntegrity {
  generatedAt: string;
  /** SHA-256 of the report data (the canonical JSON of the document). */
  sha256: string;
  /** SHA-256 over the sorted SHA-256 of every evidence item. */
  evidenceSha256: string;
}

// pdfmake ships Roboto (SIL OFL-1.1 per the font file, full Latin Extended-A: ą ę ł ś ż ź ć ń ó); the PDF embeds the subset it uses.
const robotoDir = join(dirname(createRequire(import.meta.url).resolve('pdfmake/package.json')), 'fonts', 'Roboto');
pdfmake.setFonts({ Roboto: { normal: join(robotoDir, 'Roboto-Regular.ttf'), bold: join(robotoDir, 'Roboto-Medium.ttf'), italics: join(robotoDir, 'Roboto-Italic.ttf'), bolditalics: join(robotoDir, 'Roboto-MediumItalic.ttf') } });
pdfmake.setLocalAccessPolicy((path) => path.startsWith(robotoDir)); // nothing but the bundled fonts may be read
pdfmake.setUrlAccessPolicy(() => false); // and nothing is fetched from the network

const PAGE_WIDTH = 595.28 - 80;
// pdfmake adds the cell padding on top of fixed column widths; leave room for it so tables stay inside the margins.
const CELL_PAD = 8;
const INK = '#16233b';
const MUTED = '#56627a';
const LINE = '#c3cad5';
const KIND_COLOR: Record<StatementKind, string> = { FAKT: '#2f5d8c', OBLICZENIE: '#1f6b46', WNIOSEK: '#8a5200' };

const chip = (kind: StatementKind): Content =>
  ({
  table: { body: [[{ text: kind, color: '#ffffff', bold: true, fontSize: 7, alignment: 'center', margin: [3, 1.5, 3, 1.5] }]] },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => KIND_COLOR[kind] },
  width: 58,
}) as Content;

function tableBlock(b: Extract<Block, { type: 'table' }>): Content {
  const weights = b.weights ?? b.columns.map(() => 1);
  const total = weights.reduce((s, w) => s + w, 0);
  const cell = (text: string, ci: number): TableCell => ({ text, fontSize: b.mono?.includes(ci) ? 7 : 8, color: INK });
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: weights.map((w) => (w / total) * (PAGE_WIDTH - CELL_PAD * weights.length)),
      body: [b.columns.map((c) => ({ text: c, bold: true, fontSize: 8, color: INK, fillColor: '#eef0f4' })), ...b.rows.map((r) => r.map(cell))],
    },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4, paddingRight: () => 4 },
    margin: [0, 2, 0, 8],
  };
}

function block(b: Block, section: ReportSection): Content {
  switch (b.type) {
    case 'heading':
      return { text: b.text, bold: true, fontSize: 10.5, color: INK, margin: [0, 8, 0, 3] };
    case 'list':
      return { ul: b.items.map((t) => ({ text: t, fontSize: 9.5 })), margin: [0, 2, 0, 8] };
    case 'table':
      // the section heading already carries its label; a table only repeats it when its own label differs
      return b.kind && b.kind !== section.kind ? { stack: [{ columns: [chip(b.kind)], margin: [0, 2, 0, 3] }, tableBlock(b)] } : tableBlock(b);
    case 'text':
      return b.kind
        ? { columns: [chip(b.kind), { stack: [{ text: b.text, fontSize: 9.5 }, ...(b.basis ? [{ text: `Podstawa: ${b.basis}`, fontSize: 8, color: MUTED, italics: true, margin: [0, 2, 0, 0] } as Content] : [])] }], columnGap: 8, margin: [0, 2, 0, 8] }
        : { text: b.text, fontSize: 9.5, margin: [0, 2, 0, 8] };
  }
}

const sectionHeading = (s: ReportSection, first: boolean): Content => ({
  columns: [{ text: `${s.number}. ${s.title}`, style: 'h2', tocItem: true, width: '*' }, ...(s.kind ? [chip(s.kind)] : [])],
  margin: [0, 16, 0, 6],
  unbreakable: true,
  ...(first ? { pageBreak: 'before' as const } : {}),
});

/** The one place that renders the report document as a PDF (local, no browser; fonts are embedded). */
export async function renderPdf(source: ReportDoc, integrity: ReportIntegrity): Promise<Buffer> {
  const doc = fontSafe(source);
  const sections: Content[] = [];
  for (const [i, s] of doc.sections.entries()) {
    sections.push(sectionHeading(s, i === 0), ...s.blocks.map((b) => block(b, s)));
    if (s.id === 'meta')
      sections.push(
        { text: 'Integralność raportu', bold: true, fontSize: 10.5, margin: [0, 8, 0, 3] },
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
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.25, color: INK },
    styles: { h1: { fontSize: 22, bold: true }, h2: { fontSize: 13, bold: true } },
    header: (page: number) => (page === 1 ? undefined : { text: `${doc.appName} — ${doc.title}: ${doc.caseTitle}`, fontSize: 8, color: MUTED, margin: [40, 24, 40, 0] }),
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `SHA-256: ${integrity.sha256.slice(0, 16)}…`, fontSize: 7, color: MUTED },
        { text: `Strona ${page} z ${pages}`, fontSize: 8, color: MUTED, alignment: 'right' },
      ],
      margin: [40, 18, 40, 0],
    }),
    content: [
      { text: doc.appName, fontSize: 11, bold: true, color: MUTED },
      { text: doc.title, style: 'h1', margin: [0, 2, 0, 0] },
      { text: doc.caseTitle, fontSize: 14, margin: [0, 2, 0, 10] },
      table2(doc.meta),
      { text: 'Podsumowanie', style: 'h2', margin: [0, 14, 0, 4] },
      { text: 'W pięciu zdaniach:', fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 3] },
      { ol: doc.summary.map((t) => ({ text: t, fontSize: 10.5, margin: [0, 0, 0, 3] })) },
      { text: 'Jak czytać ten raport', style: 'h2', margin: [0, 14, 0, 4] },
      ...doc.legend.map((l): Content => ({ columns: [chip(l.kind), { text: l.text, fontSize: 9 }], columnGap: 8, margin: [0, 0, 0, 4] })),
      { toc: { title: { text: 'Spis treści', style: 'h2', margin: [0, 16, 0, 4] } }, margin: [0, 0, 0, 0] },
      ...sections,
      { text: 'Słowniczek', style: 'h2', tocItem: true, margin: [0, 18, 0, 6], pageBreak: 'before' },
      { table: { headerRows: 1, widths: [130, PAGE_WIDTH - 130 - 2 * CELL_PAD], body: [[{ text: 'Pojęcie', bold: true, fontSize: 8, fillColor: '#eef0f4' }, { text: 'Wyjaśnienie', bold: true, fontSize: 8, fillColor: '#eef0f4' }], ...doc.glossary.map((g): TableCell[] => [{ text: g.term, bold: true, fontSize: 8.5 }, { text: g.definition, fontSize: 8.5 }])] }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 3, paddingBottom: () => 3 } },
    ],
  };
  return pdfmake.createPdf(definition as never).getBuffer();
}

// Roboto has no arrows; names from label lists may contain them (e.g. "Kantor USDT ↔ gotówka").
const MISSING_GLYPHS: [RegExp, string][] = [[/↔/g, '<->'], [/[→⟶]/g, '->'], [/←/g, '<-']];
const fontSafe = (doc: ReportDoc): ReportDoc => JSON.parse(JSON.stringify(doc), (_k, v) => (typeof v === 'string' ? MISSING_GLYPHS.reduce((s, [re, to]) => s.replace(re, to), v) : v));

function table2(rows: [string, string][]): Content {
  return {
    table: { widths: [130, PAGE_WIDTH - 130 - 2 * CELL_PAD], body: rows.map(([k, v]) => [{ text: k, color: MUTED, fontSize: 8.5 }, { text: v, fontSize: /^[0-9a-f]{64}$/.test(v) ? 7.5 : 9 }]) },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4 },
    margin: [0, 0, 0, 6],
  };
}
