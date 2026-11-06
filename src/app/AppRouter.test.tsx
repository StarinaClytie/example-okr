import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { AppRouter } from './AppRouter';

function Content() {
  return <><Link to="/reports">Reports</Link><Routes><Route path="/" element={<h1>Home</h1>} /><Route path="/reports" element={<h1>Reports page</h1>} /></Routes></>;
}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it('keeps static demo navigation and a reopened deep link inside the repository URL', async () => {
  window.history.replaceState(null, '', '/example-okr/');
  render(<AppRouter mode="demo" staticDemo><Content /></AppRouter>);
  await userEvent.click(screen.getByRole('link', { name: 'Reports' }));
  expect(window.location.pathname).toBe('/example-okr/');
  expect(window.location.hash).toBe('#/reports');
  cleanup();
  render(<AppRouter mode="demo" staticDemo><Content /></AppRouter>);
  expect(screen.getByRole('heading', { name: 'Reports page' })).toBeVisible();
});

it('retains browser routing for persistent mode even when the demo hosting flag is set', async () => {
  render(<AppRouter mode="supabase" staticDemo><Content /></AppRouter>);
  await userEvent.click(screen.getByRole('link', { name: 'Reports' }));
  expect(window.location.pathname).toBe('/reports');
  expect(window.location.hash).toBe('');
});
