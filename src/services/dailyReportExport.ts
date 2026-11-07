import { formatLinkedKeyResult } from '../domain/dailyReportKeyResult';
import type { DailyReportDetail } from '../domain/types';
import { escapeHtml, renderDailyReportPrintView } from '../pages/daily-report/DailyReportPrintView';
import type { Locale } from '../i18n/messages';
import { dailyReportExportText } from './dailyReportExportText';

type DocxModule = typeof import('docx');

export class DailyReportExportError extends Error {
  readonly code: 'popup_blocked';

  constructor(code: 'popup_blocked') {
    super(code);
    this.name = 'DailyReportExportError';
    this.code = code;
  }
}

function textCell(docx: DocxModule, value: string) {
  return new docx.TableCell({ children: [new docx.Paragraph(value)] });
}

function detailsTable(docx: DocxModule, detail: DailyReportDetail, locale: Locale) {
  const { t, hours } = dailyReportExportText(locale);
  return new docx.Table({
    rows: [
      new docx.TableRow({ children: [textCell(docx, t('daily.author')), textCell(docx, detail.authorName), textCell(docx, t('daily.date')), textCell(docx, detail.date)] }),
      new docx.TableRow({ children: [textCell(docx, t('table.status')), textCell(docx, t(`status.${detail.status}`)), textCell(docx, t('daily.hours')), textCell(docx, hours(detail.hours))] }),
    ],
  });
}

function safeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').trim() || 'report';
}

function documentChildren(docx: DocxModule, detail: DailyReportDetail, locale: Locale) {
  const { t, title, hours, keyResult, attachmentMetadata } = dailyReportExportText(locale);
  return [
    new docx.Paragraph({ text: title, heading: docx.HeadingLevel.HEADING_1 }),
    detailsTable(docx, detail, locale),
    new docx.Paragraph({ text: t('daily.detailEntries'), heading: docx.HeadingLevel.HEADING_2 }),
    ...detail.blocks.flatMap((block, index) => [
      new docx.Paragraph({ text: t('daily.entryNumber', { number: index + 1 }), heading: docx.HeadingLevel.HEADING_3 }),
      new docx.Paragraph(`${t('daily.objective')}: ${block.dailyObjective}`),
      new docx.Paragraph(`${t('daily.linkedQuarterlyKr')}: ${formatLinkedKeyResult(block, keyResult)}`),
      ...(block.workDescription ? [new docx.Paragraph(`${t('daily.workDescription')}: ${block.workDescription}`)] : []),
      new docx.Paragraph(`${t('daily.result')}: ${block.result}`),
      new docx.Paragraph(`${t('daily.hours')}: ${hours(block.hours)}`),
      ...(block.evidenceItems?.map((item) => new docx.Paragraph(`${t('daily.attachment')}: ${item.label} (${attachmentMetadata(item.kind, item.classification, item.uploadState ?? 'unknown')})`)) ?? []),
    ]),
    new docx.Paragraph({ text: t('daily.comments'), heading: docx.HeadingLevel.HEADING_2 }),
    ...(detail.comments.length
      ? detail.comments.map((comment) => new docx.Paragraph(`${comment.authorName} · ${comment.createdAt}\n${comment.body}`))
      : [new docx.Paragraph(t('daily.noComments'))]),
  ];
}

export async function exportDailyReportWord(detail: DailyReportDetail, locale: Locale = 'zh-CN'): Promise<void> {
  const docx = await import('docx');
  const wordDocument = new docx.Document({ styles: { default: { document: { run: { language: { value: locale === 'en' ? 'en-US' : 'zh-CN' } } } } }, sections: [{ children: documentChildren(docx, detail, locale) }] });
  const blob = await docx.Packer.toBlob(wordDocument);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = documentCreateAnchor(objectUrl, `${dailyReportExportText(locale).title}-${safeFilenamePart(detail.authorName)}-${detail.date}.docx`);

  try {
    window.document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

function documentCreateAnchor(href: string, filename: string) {
  const anchor = window.document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.style.display = 'none';
  return anchor;
}

function printDocument(title: string, body: string, locale: Locale) {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body { color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif; line-height: 1.55; margin: 32px; }
    h1, h2, h3 { color: #0f172a; } .daily-report-print__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .daily-report-print__meta div, .daily-report-print__entry { border: 1px solid #d1d5db; padding: 12px; margin-bottom: 12px; } dt { font-weight: 700; } dd { margin: 4px 0 0; }
    @media print { .daily-report-print header p { display: none; } body { margin: 0; } }
  </style></head><body>${body}</body></html>`;
}

/**
 * Keep the popup same-origin and blank so its document can be written and no
 * external page can receive an opener reference. `noopener`/`noreferrer`
 * would disown the handle needed by the print workflow in some browsers.
 */
export function openDailyReportPrintWindow(opener: Pick<Window, 'open'> = window): Window | null {
  return opener.open('', '_blank');
}

export function printDailyReportPdf(detail: DailyReportDetail, locale: Locale = 'zh-CN'): void {
  const popup = openDailyReportPrintWindow();
  if (!popup) throw new DailyReportExportError('popup_blocked');

  const title = `${dailyReportExportText(locale).title}-${safeFilenamePart(detail.authorName)}-${detail.date}`;
  popup.addEventListener('load', () => popup.print(), { once: true });
  popup.document.open();
  popup.document.write(printDocument(title, renderDailyReportPrintView(detail, locale), locale));
  popup.document.close();
}
