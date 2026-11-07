import '@testing-library/jest-dom/vitest';
import { configurePermissionSource } from '../auth/permissionService';
import { mockData } from '../mocks/repository';

// Tests exercise the demo permission model: relationship data (project
// membership roles, reporting lines, shares, workloads) is seeded from the demo
// fixtures. Production Supabase mode leaves this empty and trusts server RLS.
configurePermissionSource(mockData);

// Existing UI fixtures exercise a Chinese-language browser. Locale-specific tests
// override these getters to cover English and unsupported browser preferences.
Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['zh-CN'] });
Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'zh-CN' });
