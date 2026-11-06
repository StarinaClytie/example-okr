import { BrowserRouter, HashRouter } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import type { AppMode } from '../data/types';

export function AppRouter({ children, mode, staticDemo = false }: PropsWithChildren<{ mode: AppMode; staticDemo?: boolean }>) {
  const Router = mode === 'demo' && staticDemo ? HashRouter : BrowserRouter;
  return <Router>{children}</Router>;
}
