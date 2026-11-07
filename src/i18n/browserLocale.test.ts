import { readStoredLocale } from './LocaleProvider';

beforeEach(() => { window.localStorage.clear(); vi.stubEnv('VITE_DEMO_STATIC_HOST', 'false'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); window.localStorage.clear(); });

it.each([
  [['en-GB'], 'en'], [['zh-TW'], 'zh-CN'], [['fr-FR', 'en-US', 'zh-CN'], 'en'],
  [['de-DE'], 'en'], [[], 'en'], [['zh-CN', 'en-US'], 'zh-CN'],
])('uses browser preference order %j on first visit', (languages, expected) => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages as string[]);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('');
  expect(readStoredLocale()).toBe(expected);
});
it('keeps an explicit saved choice ahead of the browser language', () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  window.localStorage.setItem('example-okr.locale', 'zh-CN');
  expect(readStoredLocale()).toBe('zh-CN');
});
it('uses browser language when storage is blocked', () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readStoredLocale()).toBe('en');
});
