import { AppRouter } from './AppRouter';
import { AuthProvider } from '../auth/AuthContext';
import { SupabaseAuthProvider } from '../auth/SupabaseAuthProvider';
import { appMode, repository } from '../lib/supabase';
import { SupabaseOkrRepository } from '../data/supabaseRepository';
import { AppRoutes } from './routes';
import { LocaleProvider } from '../i18n/LocaleProvider';

export function App() {
  const routes = <LocaleProvider repository={repository}><AppRouter mode={appMode} staticDemo={import.meta.env.VITE_DEMO_STATIC_HOST === 'true'}><AppRoutes /></AppRouter></LocaleProvider>;
  if (appMode === 'supabase' && repository instanceof SupabaseOkrRepository) {
    return <SupabaseAuthProvider client={repository.client} repository={repository}>{routes}</SupabaseAuthProvider>;
  }
  return (
    <AuthProvider>
      {routes}
    </AuthProvider>
  );
}
