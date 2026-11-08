import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import { repository } from '../lib/supabase';
import { currentWeekRange } from '../domain/hrWorkHours';
import { PageHeader } from '../components/PageHeader';
import { WorkHoursSettings } from './WorkHoursSettings';
import { useLocale } from '../i18n/LocaleProvider';

export function SettingsPage({ dataRepository = repository }: { dataRepository?: OkrRepository }) {
  const { t } = useLocale();
  const { currentUser, refreshProfile } = useAuth();
  const identity = `${currentUser?.id}:${currentUser?.role}`;
  const latestIdentity = useRef({ identity });
  if (latestIdentity.current.identity !== identity) latestIdentity.current = { identity };
  useEffect(() => {
    latestIdentity.current = { identity };
    return () => { latestIdentity.current = { identity: '' }; };
  }, [identity]);
  const [activeTabId, setActiveTabId] = useState('personal');
  const [timeZone, setTimeZone] = useState(currentUser?.businessTimeZone ?? 'Asia/Shanghai');
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(currentUser?.weekStartsOn ?? 1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<'invalidZone' | 'saveError' | 'calendarSaved' | null>(null);
  const idBase = useId();
  useEffect(() => {
    setTimeZone(currentUser?.businessTimeZone ?? 'Asia/Shanghai');
    setWeekStartsOn(currentUser?.weekStartsOn ?? 1);
    setMessage(null); setSaving(false);
  }, [identity, currentUser?.businessTimeZone, currentUser?.weekStartsOn]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (currentUser?.role !== 'administrator' || saving) return;
    const zone = timeZone.trim();
    try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); }
    catch { setMessage('invalidZone'); return; }
    const owner = latestIdentity.current;
    setSaving(true); setMessage(null);
    try {
      // Demo operations use the same selected actor as dashboard writes.
      if (dataRepository.mode === 'demo') dataRepository.getCachedDashboardData?.(currentUser.id);
      const result = await dataRepository.updateOrganizationCalendar?.({ timeZone: zone, weekStartsOn });
      if (latestIdentity.current !== owner) return;
      if (!result?.ok) { setMessage('saveError'); return; }
      await refreshProfile?.();
      if (latestIdentity.current === owner) setMessage('calendarSaved');
    } catch { if (latestIdentity.current === owner) setMessage('saveError'); }
    finally { if (latestIdentity.current === owner) setSaving(false); }
  };
  if (!currentUser) return null;
  const week = currentWeekRange(new Date(), currentUser.businessTimeZone, currentUser.weekStartsOn);
  const tabs = [
    { id: 'personal', label: t('settings.personal'), description: t('settings.personalDescription') },
    ...(currentUser.role === 'project_leader' ? [{ id: 'project', label: t('settings.project'), description: t('settings.projectDescription') }] : []),
    ...(currentUser.role === 'hr' ? [{ id: 'hr', label: t('settings.hr'), description: t('settings.hrDescription') }] : []),
    ...(currentUser.role === 'administrator' ? [{ id: 'system', label: t('settings.system'), description: t('settings.systemDescription') }] : []),
  ];
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  return (
    <section className="business-page" aria-labelledby="settings-page-title">
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <p>{t('settings.calendarSummary', { timeZone: currentUser.businessTimeZone ?? 'Asia/Shanghai', from: week.from, to: week.to })}</p>
      <div className="settings-tabs" role="tablist" aria-label={t('settings.categories')}>
        {tabs.map((tab) => <button key={tab.id} id={`${idBase}-${tab.id}-tab`} type="button" role="tab" aria-selected={tab.id === active.id} aria-controls={tab.id === active.id ? `${idBase}-${tab.id}-panel` : undefined} className="settings-tab" onClick={() => setActiveTabId(tab.id)}>{tab.label}</button>)}
      </div>
      <section id={`${idBase}-${active.id}-panel`} className="settings-panel form-card form-section" role="tabpanel" aria-label={active.label} aria-labelledby={`${idBase}-${active.id}-tab`}>
        <h2>{active.label}</h2>
        <p>{active.description}</p>
        {active.id === 'system' ? <><WorkHoursSettings dataRepository={dataRepository} /><form onSubmit={save}>
          <label className="modal-field"><span>{t('settings.timeZone')}</span><input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Europe/London" required disabled={saving} /></label>
          <label className="modal-field"><span>{t('settings.weekStartsOn')}</span><select value={weekStartsOn} onChange={(event) => setWeekStartsOn(Number(event.target.value) as 0 | 1)} disabled={saving}><option value="1">{t('settings.monday')}</option><option value="0">{t('settings.sunday')}</option></select></label>
          <p>{t('settings.calendarHelp')}</p>
          <button type="submit" className="button button--primary" disabled={saving}>{t(saving ? 'settings.savingCalendar' : 'settings.saveCalendar')}</button>
          {message ? <p role={message === 'calendarSaved' ? 'status' : 'alert'}>{t(`settings.${message}`)}</p> : null}
        </form></> : <p className="reports-coming-soon">{t('settings.notImplemented')}</p>}
      </section>
    </section>
  );
}
