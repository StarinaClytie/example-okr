import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { readStoredLocale, storeLocale } from './LocaleProvider';

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_STATIC_HOST', 'true');
  window.localStorage.clear();
  window.history.replaceState({}, '', '/#/dashboard');
});
afterEach(() => { vi.unstubAllEnvs(); window.localStorage.clear(); window.history.replaceState({}, '', '/'); });

it('opens the public demo synchronously in English, independent of the old Chinese default', () => {
  window.localStorage.setItem('example-okr.locale', 'zh-CN');
  render(<App />);
  expect(document.documentElement.lang).toBe('en');
  expect(screen.getByRole('button', { name: 'Switch to Chinese' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Dashboard' })).toBeVisible();
});
it('remembers an explicit language choice in a separate public-demo preference', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
  expect(document.documentElement.lang).toBe('zh-CN');
  expect(readStoredLocale()).toBe('zh-CN');
  expect(window.localStorage.getItem('example-okr.locale')).toBeNull();
  storeLocale('en');
  expect(readStoredLocale()).toBe('en');
});
it('still defaults to English when browser storage is unavailable', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  try { expect(readStoredLocale()).toBe('en'); } finally { read.mockRestore(); }
});
