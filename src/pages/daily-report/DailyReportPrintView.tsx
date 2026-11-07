import { formatLinkedKeyResult } from '../../domain/dailyReportKeyResult';
import type { DailyReportDetail } from '../../domain/types';

import type { Locale } from '../../i18n/messages';
import { dailyReportExportText } from '../../services/dailyReportExportText';

export function escapeHtml(value: string | number) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}

export function renderDailyReportPrintView(detail: DailyReportDetail, locale: Locale = 'zh-CN') {
  const { t, title, hours, keyResult, attachmentMetadata } = dailyReportExportText(locale);
  const entries = detail.blocks.map((block, index) => {
    const keyResults = formatLinkedKeyResult(block, keyResult);
    const attachments = block.evidenceItems?.length
      ? `<ul>${block.evidenceItems.map((item) => `<li>${escapeHtml(item.label)} (${escapeHtml(attachmentMetadata(item.kind, item.classification, item.uploadState ?? 'unknown'))})</li>`).join('')}</ul>`
      : '';
    return `<article class="daily-report-print__entry"><h3>${t('daily.entryNumber', { number: index + 1 })}</h3><p><strong>${t('daily.objective')}: </strong>${escapeHtml(block.dailyObjective)}</p><p><strong>${t('daily.linkedQuarterlyKr')}: </strong>${escapeHtml(keyResults)}</p>${block.workDescription ? `<p><strong>${t('daily.workDescription')}: </strong>${escapeHtml(block.workDescription)}</p>` : ''}<p><strong>${t('daily.result')}: </strong>${escapeHtml(block.result)}</p><p><strong>${t('daily.hours')}: </strong>${escapeHtml(hours(block.hours))}</p>${attachments}</article>`;
  }).join('');
  const comments = detail.comments.length
    ? `<ol>${detail.comments.map((comment) => `<li><strong>${escapeHtml(comment.authorName)}</strong> · ${escapeHtml(comment.createdAt)}<br>${escapeHtml(comment.body)}</li>`).join('')}</ol>`
    : `<p>${t('daily.noComments')}</p>`;

  return `<main class="daily-report-print"><header><h1>${title}</h1><p>${t('daily.printHint')}</p></header><dl class="daily-report-print__meta"><div><dt>${t('daily.author')}</dt><dd>${escapeHtml(detail.authorName)}</dd></div><div><dt>${t('daily.date')}</dt><dd>${escapeHtml(detail.date)}</dd></div><div><dt>${t('table.status')}</dt><dd>${escapeHtml(t(`status.${detail.status}`))}</dd></div><div><dt>${t('daily.hours')}</dt><dd>${escapeHtml(hours(detail.hours))}</dd></div></dl><section><h2>${t('daily.detailEntries')}</h2>${entries}</section><section><h2>${t('daily.comments')}</h2>${comments}</section></main>`;
}
