import React from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useCriarCheckout } from '@workspace/api-client-react';
import { CheckCircle2, Shield, FileText, Smartphone, ArrowLeft, Loader2 } from 'lucide-react';

export default function Paywall() {
  const [, setLocation] = useLocation();
  const criarCheckout = useCriarCheckout();
  
  const valorStr = sessionStorage.getItem('paywall_valor');
  const valorEmJogo = valorStr ? Number(valorStr) : null;

  const handleAssinar = (plano: 'pro_mensal' | 'pro_anual') => {
    criarCheckout.mutate({ data: { plano } }, {
      onSuccess: (data) => {
        localStorage.setItem('checkout_result', JSON.stringify(data));
        setLocation('/pagamento');
      }
    });
  };

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background overflow-y-auto">
        <div className="p-4 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')} className="-ml-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>

        <div className="px-6 pb-8 flex-1 flex flex-col">
          <div className="mb-8">
            {valorEmJogo ? (
              <h1 className="text-3xl font-display uppercase tracking-tight text-primary leading-tight">
                Essa espera vale {valorEmJogo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — não deixe na mesa.
              </h1>
            ) : (
              <h1 className="text-3xl font-display uppercase tracking-tight text-primary leading-tight">
                Receba pelo seu tempo parado.
              </h1>
            )}
            <p className="text-muted-foreground mt-3 font-medium text-lg">
              Assine o PRO e recupere seu dinheiro.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            <div 
              className="bg-card border-2 border-pro/50 hover:border-pro rounded-2xl p-5 cursor-pointer relative overflow-hidden transition-colors"
              onClick={() => handleAssinar('pro_anual')}
            >
              <div className="absolute top-0 right-0 bg-pro text-pro-foreground px-3 py-1 rounded-bl-xl font-bold text-xs">
                RECOMENDADO
              </div>
              <h3 className="font-bold text-lg mb-1">PRO Anual</h3>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-3xl font-display">R$ 199</span>
                <span className="text-muted-foreground font-medium mb-1">/ano</span>
              </div>
              <div className="text-success text-sm font-bold mb-1">
                2 meses grátis = R$ 16,58/mês
              </div>
            </div>

            <div 
              className="bg-secondary border border-border rounded-2xl p-5 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => handleAssinar('pro_mensal')}
            >
              <h3 className="font-bold text-lg mb-1">PRO Mensal</h3>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-display">R$ 19,90</span>
                <span className="text-muted-foreground font-medium mb-1">/mês</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-8 bg-card p-5 rounded-2xl border border-card-border">
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider mb-4">
              Vantagens do PRO
            </h3>
            
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
              <p className="text-sm font-medium">Cobranças ilimitadas todo mês</p>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-success shrink-0" />
              <p className="text-sm font-medium">PDF com QR Code de verificação</p>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-success shrink-0" />
              <p className="text-sm font-medium">Fotos ilimitadas no comprovante</p>
            </div>
            <div className="flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-success shrink-0" />
              <p className="text-sm font-medium">Suporte prioritário via WhatsApp</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-auto">
            <Button 
              size="lg" 
              className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
              disabled={criarCheckout.isPending}
              onClick={() => handleAssinar('pro_anual')}
            >
              {criarCheckout.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'ASSINAR PRO'}
            </Button>
            
            <button 
              className="text-muted-foreground text-sm font-bold uppercase tracking-wider hover:text-foreground pb-4"
              onClick={() => setLocation('/')}
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
