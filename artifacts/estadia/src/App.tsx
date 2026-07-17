import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect } from 'react';
import { setAuthTokenGetter, ApiError } from '@workspace/api-client-react';

import Onboarding from '@/pages/onboarding';
import Login from '@/pages/login';
import Home from '@/pages/home';
import Espera from '@/pages/espera';
import Paywall from '@/pages/paywall';
import Pagamento from '@/pages/pagamento';
import Cobranca from '@/pages/cobranca';
import Verificar from '@/pages/verificar';
import Historico from '@/pages/historico';
import Perfil from '@/pages/perfil';
import Termos from '@/pages/termos';
import Privacidade from '@/pages/privacidade';
import Admin from '@/pages/admin';

function handleUnauthorized() {
  localStorage.removeItem('estadia_token');
  // Navigate to login without a full page reload
  window.location.replace(
    import.meta.env.BASE_URL.replace(/\/$/, '') + '/login'
  );
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) handleUnauthorized();
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) handleUnauthorized();
    },
  }),
  defaultOptions: {
    queries: {
      // Don't retry on 401 — a new request won't fix an invalid/expired token
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

// Initial token setup
setAuthTokenGetter(() => localStorage.getItem('estadia_token'));

// Public paths that don't require authentication
const PUBLIC_PATHS = ['/verificar', '/termos', '/privacidade', '/admin'];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('estadia_token');
    const seenOnboarding = localStorage.getItem('estadia_onboarding_seen');

    // Allow public routes
    if (PUBLIC_PATHS.some(p => location.startsWith(p))) return;

    if (!token) {
      if (!seenOnboarding && location !== '/onboarding') {
        setLocation('/onboarding');
      } else if (seenOnboarding && location !== '/login') {
        setLocation('/login');
      }
    }
  }, [location, setLocation]);

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/login" component={Login} />
      <Route path="/" component={Home} />
      <Route path="/espera/:id" component={Espera} />
      <Route path="/paywall" component={Paywall} />
      <Route path="/pagamento" component={Pagamento} />
      <Route path="/cobranca/:id" component={Cobranca} />
      <Route path="/verificar/:token" component={Verificar} />
      <Route path="/historico" component={Historico} />
      <Route path="/perfil" component={Perfil} />
      {/* C1, C2: legal pages — public, no auth required */}
      <Route path="/termos" component={Termos} />
      <Route path="/privacidade" component={Privacidade} />
      {/* Admin panel — access by direct URL only, no menu link */}
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthGuard>
            <Router />
          </AuthGuard>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
