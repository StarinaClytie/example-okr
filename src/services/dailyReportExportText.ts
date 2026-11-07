import { translate, type Locale, type MessageKey } from '../i18n/messages';

const classificationKeys: Record<string, MessageKey | undefined> = {
  public: 'classification.public', internal: 'classification.internal', confidential: 'classification.confidential', restricted: 'classification.restricted',
};
const uploadStateKeys: Record<string, MessageKey | undefined> = {
  selected: 'daily.uploadPending', pending: 'daily.uploadPending', uploading: 'daily.uploading', verifying: 'daily.uploadVerifying', uploaded: 'daily.uploaded', failed: 'daily.uploadFailed', deleting: 'daily.deleting',
};

export function dailyReportExportText(locale: Locale) {
  const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);
  return {
    t,
    title: t('daily.exportTitle'),
    hours: (count: number) => t('common.hours', { count }),
    keyResult: { unavailable: t('daily.krUnavailable'), owner: t('table.owner') },
    attachmentMetadata: (kind: string, classification: string, uploadState: string) =>
      `${t(kind === 'file' ? 'daily.attachment' : 'daily.link')} · ${t(classificationKeys[classification] ?? 'daily.exportUnknown')} · ${t(uploadStateKeys[uploadState] ?? 'daily.exportUnknown')}`,
  };
}
