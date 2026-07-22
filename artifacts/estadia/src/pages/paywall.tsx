import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useCriarCheckout, useGetMetodosAssinatura } from '@workspace/api-client-react';
import {
  CheckCircle2, Shield, FileText, Smartphone, ArrowLeft, Loader2, Check,
  QrCode, CreditCard, Zap,
} from 'lucide-react';
import { checkoutStore } from '@/lib/checkout-store';

type Step = 'plano' | 'metodo';
type Metodo = 'pix_avulso' | 'pix_automatico' | 'cartao';

export default function Paywall() {
  const [, navigate] = useLocation();
  const criarCheckout = useCriarCheckout();

  const valorStr = sessionStorage.getItem('paywall_valor');
  const valorEmJogo = valorStr ? Number(valorStr) : null;

  const [step, setStep] = useState<Step>('plano');
  const [selectedPlan, setSelectedPlan] = useState<'pro_mensal' | 'pro_anual'>('pro_anual');
  const [selectedMetodo, setSelectedMetodo] = useState<Metodo>('pix_avulso');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Fetch available payment methods from the server
  const { data: metodos } = useGetMetodosAssinatura();
  const pixAvulsoOk = metodos?.pix_avulso ?? true; // always available — default true while loading
  const pixAutomaticoOk = metodos?.pix_automatico ?? false;
  const cartaoOk = metodos?.cartao ?? false;

  const preco = selectedPlan === 'pro_anual' ? '199' : '19,90';
  const periodo = selectedPlan === 'pro_anual' ? 'ano' : 'mês';

  const handleAssinar = () => {
    setCheckoutError(null);
    criarCheckout.mutate(
      { data: { plano: selectedPlan, metodo: selectedMetodo } },
      {
        onSuccess: (data) => {
          checkoutStore.set(data);
          navigate('/pagamento');
        },
        onError: (err: any) => {
          const msg =
            err?.response?.data?.error ??
            err?.message ??
            'Não foi possível iniciar o pagamento. Verifique sua conexão e tente novamente.';
          setCheckoutError(msg);
        },
      }
    );
  };

  // ── STEP 1: Plan selection ─────────────────────────────────────────────────
  if (step === 'plano') {
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

            {/* ── Plan cards ─────────────────────────────────────────────── */}
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

            {/* ── Benefits ───────────────────────────────────────────────── */}
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

            {/* ── CTA ────────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 mt-auto">
              <Button
                size="lg"
                className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
                onClick={() => setStep('metodo')}
              >
                Continuar — R$ {preco}/{periodo}
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

  // ── STEP 2: Payment method selection ──────────────────────────────────────
  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background overflow-y-auto">
        <div className="p-4 shrink-0 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setStep('plano')} className="-ml-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <p className="text-sm text-muted-foreground">
            {selectedPlan === 'pro_anual' ? 'PRO Anual · R$ 199/ano' : 'PRO Mensal · R$ 19,90/mês'}
          </p>
        </div>

        <div className="px-6 pb-8 flex-1 flex flex-col">
          <h2 className="text-2xl font-display uppercase tracking-tight text-primary mb-2">
            Como você quer pagar?
          </h2>
          <p className="text-muted-foreground mb-8 text-sm">
            Escolha a forma de pagamento.
          </p>

          <div className="space-y-3 mb-8">
            {/* PIX à vista — always available */}
            <button
              className={`w-full text-left rounded-2xl p-4 transition-all border-2 ${
                selectedMetodo === 'pix_avulso' && pixAvulsoOk
                  ? 'border-primary ring-2 ring-primary/20 bg-card'
                  : 'border-border bg-card hover:border-primary/50'
              } ${!pixAvulsoOk ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onClick={() => pixAvulsoOk && setSelectedMetodo('pix_avulso')}
              disabled={!pixAvulsoOk}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedMetodo === 'pix_avulso' ? 'bg-primary/20' : 'bg-secondary'}`}>
                  <QrCode className={`w-5 h-5 ${selectedMetodo === 'pix_avulso' ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">PIX</p>
                  <p className="text-xs text-muted-foreground">QR Code — ative na hora após o pagamento</p>
                </div>
                {selectedMetodo === 'pix_avulso' && (
                  <Check className="w-5 h-5 text-primary shrink-0" />
                )}
              </div>
            </button>

            {/* Cartão de crédito — disabled until account supports it */}
            <div className={`rounded-2xl p-4 border-2 border-border bg-card opacity-50 relative`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm">Cartão de crédito</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                      Em breve
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Recorrência automática</p>
                </div>
              </div>
              {cartaoOk && (
                <button
                  className={`absolute inset-0 rounded-2xl ${selectedMetodo === 'cartao' ? 'ring-2 ring-primary border-2 border-primary' : ''}`}
                  onClick={() => setSelectedMetodo('cartao')}
                />
              )}
            </div>

            {/* PIX Automático — disabled until account supports it */}
            <div className={`rounded-2xl p-4 border-2 border-border bg-card opacity-50 relative`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                  <Zap className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm">PIX Automático</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
                      Em breve
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Débito recorrente via PIX</p>
                </div>
              </div>
              {pixAutomaticoOk && (
                <button
                  className={`absolute inset-0 rounded-2xl ${selectedMetodo === 'pix_automatico' ? 'ring-2 ring-primary border-2 border-primary' : ''}`}
                  onClick={() => setSelectedMetodo('pix_automatico')}
                />
              )}
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
                `Pagar R$ ${preco} com PIX`
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
