import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';
import { HrWorkHoursPage } from './hr/HrWorkHoursPage';
import { Sidebar } from '../layout/Sidebar';
import { mockRepository } from '../mocks/repository';
import type { OkrRepository } from '../data/types';

const disabledHr = {...mockRepository.getDashboardData('user-hr').currentUser,workHoursEnabled:false};
function context(): AuthContextValue {return {status:'ready',mode:'demo',currentUser:disabledHr,selectableUsers:[],selectUser:vi.fn(),signOut:vi.fn()};}
it('blocks direct HR navigation and removes its sidebar link', () => {
 render(<AuthContext.Provider value={context()}><MemoryRouter initialEntries={['/hr-hours']}><AppRoutes /></MemoryRouter></AuthContext.Provider>);
 expect(screen.getByRole('heading',{name:'访问受限'})).toBeVisible();
 expect(screen.queryByRole('link',{name:'工作工时总览'})).not.toBeInTheDocument();
});
it('does not fetch hours when the disabled HR page is mounted directly', () => {
 const getHrWorkHours=vi.fn();
 render(<AuthContext.Provider value={context()}><HrWorkHoursPage dataRepository={{mode:'demo',getHrWorkHours} as unknown as OkrRepository} /></AuthContext.Provider>);
 expect(getHrWorkHours).not.toHaveBeenCalled();
 expect(screen.getByText(/该组织已关闭工时记录/)).toBeVisible();
});
it('keeps Reports available after hiding HR hours', () => {
 render(<AuthContext.Provider value={context()}><MemoryRouter><Sidebar variant="desktop" collapsed={false} onCollapsedChange={vi.fn()} onNavigate={vi.fn()} /></MemoryRouter></AuthContext.Provider>);
 expect(screen.getByRole('link',{name:'报告'})).toBeVisible();
 expect(screen.queryByRole('link',{name:'工作工时总览'})).not.toBeInTheDocument();
});
