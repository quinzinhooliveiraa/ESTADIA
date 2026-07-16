import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useEffect } from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

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

const queryClient = new QueryClient();

// Initial token setup
setAuthTokenGetter(() => localStorage.getItem('estadia_token'));

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  
  useEffect(() => {
    const token = localStorage.getItem('estadia_token');
    const seenOnboarding = localStorage.getItem('estadia_onboarding_seen');
    
    // Allow public routes
    if (location.startsWith('/verificar')) return;
    
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
