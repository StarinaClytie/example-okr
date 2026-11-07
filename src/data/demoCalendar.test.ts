import { afterEach, expect, it } from 'vitest';
import { DemoOkrRepository } from './demoRepository';
import { users } from '../mocks/users';
const original = users.map((user) => ({ user, timeZone: user.businessTimeZone, weekStartsOn: user.weekStartsOn }));
afterEach(() => original.forEach(({ user, timeZone, weekStartsOn }) => { user.businessTimeZone = timeZone; user.weekStartsOn = weekStartsOn; }));
it('shares calendar settings across demo users and rejects non-admin actors', async () => {
 const repository = new DemoOkrRepository();
 repository.getCachedDashboardData('user-employee');
 expect((await repository.updateOrganizationCalendar({ timeZone: 'UTC', weekStartsOn: 0 })).ok).toBe(false);
 repository.getCachedDashboardData('user-administrator');
 expect((await repository.updateOrganizationCalendar({ timeZone: 'UTC', weekStartsOn: 0 })).ok).toBe(true);
 expect(repository.getCachedDashboardData('user-employee').currentUser).toMatchObject({ businessTimeZone: 'UTC', weekStartsOn: 0 });
 expect((await repository.updateOrganizationCalendar({ timeZone: 'Europe/London', weekStartsOn: 1 })).ok).toBe(false);
});
