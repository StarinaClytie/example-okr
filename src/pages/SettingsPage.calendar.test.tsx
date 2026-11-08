import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, AuthProvider, useAuth, type AuthContextValue } from '../auth/AuthContext';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { SettingsPage } from './SettingsPage';
import { DemoOkrRepository } from '../data/demoRepository';
import { users } from '../mocks/users';
import type { OkrRepository } from '../data/types';
const admin = { id: 'admin', name: 'Admin', role: 'administrator' as const, clearance: 'internal' as const, title: '', department: '', projectIds: [], businessTimeZone: 'UTC', weekStartsOn: 1 as const };
function context(role = admin.role): AuthContextValue { return { status: 'ready', mode: 'supabase', currentUser: { ...admin, role }, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(), refreshProfile: vi.fn(async () => undefined) }; }
function page(value: AuthContextValue, repository: OkrRepository) { return <AuthContext.Provider value={value}><LocaleProvider repository={repository}><SettingsPage dataRepository={repository} /></LocaleProvider></AuthContext.Provider>; }
describe('organization calendar settings', () => {
  it('validates zones then saves and refreshes the current profile', async () => {
    const value = context();
    const save = vi.fn(async () => ({ ok: true as const, data: undefined }));
    render(page(value, { mode: 'supabase', updateOrganizationCalendar: save } as unknown as OkrRepository));
    fireEvent.click(screen.getByRole('tab', { name: '系统设置' }));
    const zone = screen.getByLabelText('组织时区');
    fireEvent.change(zone, { target: { value: 'invalid/zone' } });
    fireEvent.click(screen.getByRole('button', { name: '保存组织日历' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible();
    fireEvent.change(zone, { target: { value: 'Europe/London' } });
    fireEvent.change(screen.getByLabelText('每周开始日'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '保存组织日历' }));
    await waitFor(() => expect(value.refreshProfile).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith({ timeZone: 'Europe/London', weekStartsOn: 0 });
  });
  it('completes a save after StrictMode simulates mounting again', async () => {
    const value = context();
    const repository = { mode: 'supabase', updateOrganizationCalendar: async () => ({ ok: true, data: undefined }) } as unknown as OkrRepository;
    render(<StrictMode>{page(value, repository)}</StrictMode>);
    fireEvent.click(screen.getByRole('tab', { name: '系统设置' }));
    fireEvent.click(screen.getByRole('button', { name: '保存组织日历' }));
    await waitFor(() => expect(value.refreshProfile).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: '保存组织日历' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('组织日历已保存');
  });
  it('keeps failed saves scoped to the current profile without refreshing', async () => {
    const value = context();
    render(page(value, { mode: 'supabase', updateOrganizationCalendar: async () => ({ ok: false, error: { code: 'unauthorized', message: 'denied' } }) } as unknown as OkrRepository));
    fireEvent.click(screen.getByRole('tab', { name: '系统设置' }));
    fireEvent.click(screen.getByRole('button', { name: '保存组织日历' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('组织日历保存失败');
    expect(value.refreshProfile).not.toHaveBeenCalled();
  });
  it('does not expose system controls to employees', () => {
    const value = { ...context(), currentUser: { ...admin, role: 'employee' as const } };
    render(page(value, { mode: 'supabase' } as OkrRepository));
    expect(screen.queryByRole('tab', { name: '系统设置' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('组织时区')).not.toBeInTheDocument();
  });
  it('ignores a pending save after the signed-in identity changes', async () => {
    let finish!: (value: { ok: true; data: undefined }) => void;
    const save = vi.fn(() => new Promise<{ ok: true; data: undefined }>((resolve) => { finish = resolve; }));
    const repository = { mode: 'supabase', updateOrganizationCalendar: save } as unknown as OkrRepository;
    const value = context();
    const rendered = render(page(value, repository));
    fireEvent.click(screen.getByRole('tab', { name: '系统设置' }));
    fireEvent.click(screen.getByRole('button', { name: '保存组织日历' }));
    rendered.rerender(page({ ...value, currentUser: { ...admin, id: 'other', role: 'employee' } }, repository));
    finish({ ok: true, data: undefined });
    await waitFor(() => expect(screen.queryByLabelText('组织时区')).not.toBeInTheDocument());
    expect(value.refreshProfile).not.toHaveBeenCalled();
  });
});

const demoCalendar = users.map((user) => ({ user, zone: user.businessTimeZone, start: user.weekStartsOn }));
afterEach(() => demoCalendar.forEach(({ user, zone, start }) => { user.businessTimeZone = zone; user.weekStartsOn = start; }));
function DemoSwitch() {
  const { currentUser, selectUser } = useAuth();
  return <><button onClick={() => selectUser('user-employee')}>Employee</button><span data-testid="profile-zone">{currentUser?.businessTimeZone ?? 'Asia/Shanghai'}</span></>;
}
it('refreshes the demo profile and shares saved settings after switching users', async () => {
  const repository = new DemoOkrRepository();
  render(<AuthProvider initialUserId="user-administrator"><LocaleProvider repository={repository}><DemoSwitch /><SettingsPage dataRepository={repository} /></LocaleProvider></AuthProvider>);
  fireEvent.click(screen.getByRole('tab', { name: '系统设置' }));
  fireEvent.change(screen.getByLabelText('组织时区'), { target: { value: 'America/New_York' } });
  fireEvent.click(screen.getByRole('button', { name: '保存组织日历' }));
  await waitFor(() => expect(screen.getByTestId('profile-zone')).toHaveTextContent('America/New_York'));
  fireEvent.click(screen.getByRole('button', { name: 'Employee' }));
  expect(screen.getByTestId('profile-zone')).toHaveTextContent('America/New_York');
  expect(screen.queryByLabelText('组织时区')).not.toBeInTheDocument();
});
it('lets an admin turn off hours separately from the calendar', async () => {
 const value = context();
 const updateOrganizationWorkHours = vi.fn(async () => ({ ok: true as const, data: undefined }));
 render(page(value, {mode:'supabase', updateOrganizationWorkHours} as unknown as OkrRepository));
 fireEvent.click(screen.getByRole('tab', {name:'系统设置'}));
 fireEvent.click(screen.getByRole('checkbox', {name:'启用工时记录'}));
 fireEvent.click(screen.getByRole('button', {name:'保存工时设置'}));
 await waitFor(() => expect(value.refreshProfile).toHaveBeenCalledOnce());
 expect(updateOrganizationWorkHours).toHaveBeenCalledWith(false);
 expect(screen.getByText(/已有历史工时不会被删除/)).toBeVisible();
});


it('shows a saved status when demo profile refresh changes the hours flag', async () => {
 const flags = users.map((user) => ({user, enabled:user.workHoursEnabled}));
 try {
  const repository = new DemoOkrRepository();
  render(<AuthProvider initialUserId="user-administrator"><LocaleProvider repository={repository}><SettingsPage dataRepository={repository} /></LocaleProvider></AuthProvider>);
  fireEvent.click(screen.getByRole('tab', {name:'系统设置'}));
  fireEvent.click(screen.getByRole('checkbox', {name:'启用工时记录'}));
  await userEvent.click(screen.getByRole('button', {name:'保存工时设置'}));
  expect(await screen.findByRole('status')).toHaveTextContent('工时设置已保存');
 } finally { flags.forEach(({user,enabled}) => {user.workHoursEnabled=enabled;}); }
});
