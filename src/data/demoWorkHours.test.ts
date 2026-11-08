import { afterEach, expect, it } from 'vitest';
import { DemoOkrRepository } from './demoRepository';
import { users } from '../mocks/users';
const original = users.map((user) => ({ user, enabled: user.workHoursEnabled }));
afterEach(() => original.forEach(({ user, enabled }) => { user.workHoursEnabled = enabled; }));
it('limits toggles to admins and shares organization opt-out with demo profiles', async () => {
 const repository = new DemoOkrRepository();
 repository.getCachedDashboardData('user-employee');
 expect((await repository.updateOrganizationWorkHours(false)).ok).toBe(false);
 repository.getCachedDashboardData('user-administrator');
 expect((await repository.updateOrganizationWorkHours(false)).ok).toBe(true);
 expect(repository.getCachedDashboardData('user-hr').currentUser.workHoursEnabled).toBe(false);
 expect((await repository.getHrWorkHours({from:'2026-01-01',to:'2026-12-31'})).ok).toBe(false);
});
