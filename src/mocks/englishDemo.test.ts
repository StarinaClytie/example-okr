import { mockData } from './repository';
import { getMockResourceDetail, mockResources } from './resources';
import { demoText, translateDemoFixture } from './englishDemo';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

it('provides a fully English seeded demo including names, departments, reports and attachments', () => {
  const sample = structuredClone({ ...mockData, resources: mockResources, resourceDetails: mockResources.map(r => getMockResourceDetail(r.id)) });
  const original = JSON.stringify(sample);
  const english = translateDemoFixture(sample, true);
  expect(strings(english).filter(s => /[\u3400-\u9fff]/.test(s))).toEqual([]);
  expect(english.users.find(u => u.id === 'user-project-leader')?.name).toBe('Alex Morgan');
  expect(english.users.find(u => u.id === 'user-hr')?.department).toBe('People Operations');
  expect(english.projects.map(p => p.id)).toEqual(mockData.projects.map(p => p.id));
  expect(JSON.stringify(mockData)).not.toBe(JSON.stringify(english));
  expect(original).toContain('李然');
});
it('does not translate data when the public demo profile is disabled', () => {
  const input = { name: '李然', note: '用户自己录入的文字', id: 'user-project-leader' };
  expect(translateDemoFixture(structuredClone(input), false)).toEqual(input);
});
it('translates demo-only notification and fallback messages', () => {
  vi.stubEnv('VITE_DEMO_STATIC_HOST', 'true');
  try {
    expect(demoText('管理员')).toBe('Administrator');
    expect(demoText('请求的资源不存在')).toBe('The requested resource was not found');
    expect(demoText('当前环境不支持此持久化操作')).toBe('This operation is unavailable in the in-memory demo');
  } finally { vi.unstubAllEnvs(); }
});
