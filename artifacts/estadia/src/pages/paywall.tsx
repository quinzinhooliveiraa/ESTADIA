import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useCriarCheckout } from '@workspace/api-client-react';
import { CheckCircle2, Shield, FileText, Smartphone, ArrowLeft, Loader2, Check } from 'lucide-react';
import { checkoutStore } from '@/lib/checkout-store';

export default function Paywall() {
  const [, navigate] = useLocation();
  const criarCheckout = useCriarCheckout();

  const valorStr = sessionStorage.getItem('paywall_valor');
  const valorEmJogo = valorStr ? Number(valorStr) : null;

  const [selectedPlan, setSelectedPlan] = useState<'pro_mensal' | 'pro_anual'>('pro_anual');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleAssinar = () => {
    setCheckoutError(null);
    criarCheckout.mutate(
      { data: { plano: selectedPlan } },
      {
        onSuccess: (data) => {
          // Pass checkout data via in-memory store — no localStorage
          checkoutStore.set(data);
          navigate('/pagamento');
        },
        onError: () => {
          setCheckoutError('Não foi possível iniciar o pagamento. Verifique sua conexão e tente novamente.');
        },
      }
    );
  };

  const planLabel =
    selectedPlan === 'pro_anual'
      ? 'Assinar PRO Anual — R$ 199/ano'
      : 'Assinar PRO Mensal — R$ 19,90/mês';

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background overflow-y-auto">
        <div className="p-4 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="-ml-2">
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

          {/* ── Plan cards — click to SELECT only ─────────────────────────── */}
          <div className="space-y-4 mb-8">
            {/* PRO Anual */}
            <div
              className={`bg-card rounded-2xl p-5 cursor-pointer relative overflow-hidden transition-all ${
                selectedPlan === 'pro_anual'
                  ? 'border-2 border-primary ring-2 ring-primary/20'
                  : 'border-2 border-pro/30 hover:border-pro/60'
              }`}
              onClick={() => setSelectedPlan('pro_anual')}
            >
              <div className="absolute top-0 right-0 bg-pro text-pro-foreground px-3 py-1 rounded-bl-xl font-bold text-xs">
                RECOMENDADO
              </div>
              {selectedPlan === 'pro_anual' && (
                <div className="absolute top-3 left-4">
                  <Check className="w-4 h-4 text-primary" />
                </div>
              )}
              <h3 className={`font-bold text-lg mb-1 ${selectedPlan === 'pro_anual' ? 'pl-6' : ''}`}>PRO Anual</h3>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-3xl font-display">R$ 199</span>
                <span className="text-muted-foreground font-medium mb-1">/ano</span>
              </div>
              <div className="text-success text-sm font-bold mb-1">
                2 meses grátis = R$ 16,58/mês
              </div>
            </div>

            {/* PRO Mensal */}
            <div
              className={`bg-secondary rounded-2xl p-5 cursor-pointer transition-all ${
                selectedPlan === 'pro_mensal'
                  ? 'border-2 border-primary ring-2 ring-primary/20'
                  : 'border border-border hover:border-primary/50'
              }`}
              onClick={() => setSelectedPlan('pro_mensal')}
            >
              {selectedPlan === 'pro_mensal' && (
                <div className="flex items-center gap-2 mb-1">
                  <Check className="w-4 h-4 text-primary" />
                </div>
              )}
              <h3 className="font-bold text-lg mb-1">PRO Mensal</h3>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-display">R$ 19,90</span>
                <span className="text-muted-foreground font-medium mb-1">/mês</span>
              </div>
            </div>
          </div>

          {/* ── Benefits ─────────────────────────────────────────────────── */}
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

          {/* ── CTA ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 mt-auto">
            {checkoutError && (
              <p className="text-sm text-destructive text-center px-2">{checkoutError}</p>
            )}
            <Button
              size="lg"
              className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
              disabled={criarCheckout.isPending}
              onClick={handleAssinar}
            >
              {criarCheckout.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                planLabel
              )}
            </Button>

            <button
              className="text-muted-foreground text-sm font-bold uppercase tracking-wider hover:text-foreground pb-4"
              onClick={() => navigate('/')}
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
