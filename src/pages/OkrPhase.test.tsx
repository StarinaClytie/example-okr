import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';

function renderOkrRoute(userId: string, path: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('OKR objective detail', () => {
  it('shows an objective leader its Key Results, assignments, and progress history', async () => {
    const user = userEvent.setup();
    renderOkrRoute('user-zhang-san', '/okrs/objective-customer-support');

    expect(await screen.findByRole('heading', { name: '客户支持平台升级' })).toBeVisible();
    expect(screen.getByRole('button', { name: '添加 Key Result' })).toBeEnabled();

    await user.click(screen.getByRole('tab', { name: 'Key Results' }));

    expect(screen.getByText('将自助支持覆盖率提升至 35%')).toBeVisible();
    expect(screen.getByText('9月15日前完成服务架构设计并通过技术评审')).toBeVisible();
    expect(screen.getByText('完成首轮支持内容核验。')).toBeVisible();
    expect(screen.getAllByText('负责人：').length).toBeGreaterThan(0);
  });
});

describe('OKR employee contributions', () => {
  it('shows a multi-objective employee their owned KRs without inventing personal objectives', async () => {
    renderOkrRoute('user-wang-fang', '/okrs');

    expect(await screen.findByRole('heading', { name: '我的工作' })).toBeVisible();
    expect(screen.getAllByText('将自助支持覆盖率提升至 35%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('完成知识库文档整理（≥5000篇）').length).toBeGreaterThan(0);
  });
});
