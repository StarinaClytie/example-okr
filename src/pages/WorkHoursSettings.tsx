import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import { useLocale } from '../i18n/LocaleProvider';

/** Separate from the calendar so saving one setting cannot overwrite another. */
export function WorkHoursSettings({ dataRepository }: { dataRepository: OkrRepository }) {
  const { currentUser, refreshProfile } = useAuth();
  const { t } = useLocale();
  const identity = `${currentUser?.id}:${currentUser?.role}:${currentUser?.organization}`;
  const owner = useRef({ identity });
  if (owner.current.identity !== identity) owner.current = { identity };
  const [enabled, setEnabled] = useState(currentUser?.workHoursEnabled !== false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'hoursSaved' | 'hoursSaveError'>();
  useEffect(() => {
    owner.current = { identity };
    setStatus(undefined); setSaving(false);
    return () => { owner.current = { identity: '' }; };
  }, [identity]);
  useEffect(() => { setEnabled(currentUser?.workHoursEnabled !== false); }, [identity, currentUser?.workHoursEnabled]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || currentUser?.role !== 'administrator') return;
    const requestOwner = owner.current;
    setSaving(true); setStatus(undefined);
    try {
      if (dataRepository.mode === 'demo') dataRepository.getCachedDashboardData?.(currentUser.id);
      const result = await dataRepository.updateOrganizationWorkHours?.(enabled);
      if (owner.current !== requestOwner) return;
      if (!result?.ok) { setStatus('hoursSaveError'); return; }
      await refreshProfile?.();
      if (owner.current === requestOwner) setStatus('hoursSaved');
    } catch { if (owner.current === requestOwner) setStatus('hoursSaveError'); }
    finally { if (owner.current === requestOwner) setSaving(false); }
  }
  if (currentUser?.role !== 'administrator') return null;
  return <form onSubmit={save} className="form-section">
    <label><input type="checkbox" checked={enabled} disabled={saving} onChange={(event) => setEnabled(event.target.checked)} /> {t('settings.hoursEnabled')}</label>
    <p>{t('settings.hoursHelp')}</p>
    <button type="submit" className="button button--primary" disabled={saving}>{t(saving ? 'settings.savingHours' : 'settings.saveHours')}</button>
    {status ? <p role={status === 'hoursSaved' ? 'status' : 'alert'}>{t(`settings.${status}`)}</p> : null}
  </form>;
}
