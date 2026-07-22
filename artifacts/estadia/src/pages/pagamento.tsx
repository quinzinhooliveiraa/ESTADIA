import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useGetAssinatura, getGetAssinaturaQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Check,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { checkoutStore } from '@/lib/checkout-store';

const POLLING_INTERVAL_MS = 3_000;
const POLLING_MAX_MS = 30 * 60 * 1_000; // 30 minutes

export default function Pagamento() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checkout data passed via in-memory store — no localStorage
  const checkout = checkoutStore.get();
  const isLive: boolean = checkout?.is_live === true;

  // Two display modes:
  //   checkout_url → embedded iframe (v2 live mode)
  //   pix_qr_code  → inline QR code (mock/dev mode)
  const hasCheckoutUrl = Boolean(checkout?.checkout_url);
  const hasInlinePix = Boolean(checkout?.pix_qr_code && checkout?.pix_copia_cola);

  const { data: assinatura } = useGetAssinatura();

  // ── Start polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!checkout) return;

    pollingRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetAssinaturaQueryKey() });
    }, POLLING_INTERVAL_MS);

    timeoutRef.current = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      setTimedOut(true);
    }, POLLING_MAX_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [queryClient, checkout]);

  // ── Navigate on payment confirmed ────────────────────────────────────────
  useEffect(() => {
    if (assinatura?.status === 'ativo') {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      toast({ title: 'Pagamento confirmado!', description: 'Você agora é PRO.' });
      checkoutStore.clear();
      setLocation('/');
    }
  }, [assinatura, setLocation, toast]);

  // ── Redirect if no checkout data ─────────────────────────────────────────
  useEffect(() => {
    if (!checkout) setLocation('/paywall');
  }, [checkout, setLocation]);

  if (!checkout) return null;

  // ── Inline PIX copy handler (mock/dev) ───────────────────────────────────
  const handleCopy = () => {
    if (!checkout.pix_copia_cola) return;
    navigator.clipboard.writeText(checkout.pix_copia_cola);
    setCopied(true);
    toast({ title: 'Código PIX copiado' });
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Mock-only: confirm payment manually ──────────────────────────────────
  const handleConfirmarMock = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const token = localStorage.getItem('estadia_token');
      const res = await fetch('/api/assinatura/confirmar-mock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ billing_id: checkout.billing_id }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getGetAssinaturaQueryKey() });
      } else {
        const body = await res.json().catch(() => ({}));
        setConfirmError(body?.message || `Erro ${res.status} ao confirmar pagamento.`);
      }
    } catch {
      setConfirmError('Falha de conexão. Verifique sua rede e tente novamente.');
    } finally {
      setConfirming(false);
    }
  };

  // ── FLOW A: Embedded checkout iframe (v2 live mode) ──────────────────────
  if (hasCheckoutUrl) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {/* Slim header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            onClick={() => {
              checkoutStore.clear();
              setLocation('/paywall');
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="text-base font-semibold">Pagamento seguro</span>

          {/* Polling indicator */}
          {!timedOut && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Aguardando…
            </div>
          )}
        </div>

        {/* Iframe fills the rest of the screen */}
        <div className="relative flex-1 overflow-hidden">
          {/* Loading skeleton while iframe initialises */}
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando checkout…</p>
            </div>
          )}

          <iframe
            src={checkout.checkout_url!}
            title="Checkout AbacatePay"
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(true)}
            allow="payment"
          />
        </div>

        {/* Timeout fallback bar */}
        {timedOut && (
          <div className="shrink-0 p-4 border-t border-border bg-background text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Tempo esgotado. Verifique seu banco e volte para conferir o status.
            </p>
            <Button variant="outline" onClick={() => setLocation('/paywall')}>
              Voltar aos planos
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── FLOW B: Inline PIX QR code (mock/dev) ───────────────────────────────
  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background p-6">
        {/* Header */}
        <div className="mb-6 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/paywall')}
            className="-ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold ml-2">Pagamento</h1>
        </div>

        <div className="flex-1 flex flex-col items-center">
          {hasInlinePix ? (
            <>
              <p className="text-muted-foreground text-center mb-6">
                Escaneie o QR Code ou copie o código para pagar no app do seu banco.
              </p>

              <div className="bg-white p-4 rounded-2xl mb-8 w-64 h-64 flex items-center justify-center">
                <img
                  src={`data:image/png;base64,${checkout.pix_qr_code}`}
                  alt="QR Code PIX"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="w-full bg-card border border-border rounded-xl p-4 mb-6">
                <p className="text-xs text-muted-foreground font-bold mb-2 uppercase tracking-wider">
                  PIX Copia e Cola
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-background rounded-lg px-3 py-3 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-mono text-muted-foreground">
                    {checkout.pix_copia_cola}
                  </div>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={handleCopy}
                    className="h-auto shrink-0 bg-primary/20 text-primary hover:bg-primary/30 hover:text-primary border-0"
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </Button>
                </div>
              </div>

              {timedOut ? (
                <div className="text-center text-muted-foreground text-sm">
                  <p className="mb-3">O QR Code expirou. Tente novamente.</p>
                  <Button variant="outline" onClick={() => setLocation('/paywall')}>
                    Voltar aos planos
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 mt-auto pb-8 w-full">
                  <div className="flex items-center gap-3 text-muted-foreground font-medium animate-pulse">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    Aguardando confirmação…
                  </div>

                  {/* Only shown in mock/dev mode */}
                  {!isLive && (
                    <div className="w-full flex flex-col gap-2">
                      {confirmError && (
                        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-center">
                          <p className="text-sm text-destructive mb-2">{confirmError}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={handleConfirmarMock}
                            disabled={confirming}
                          >
                            Tentar novamente
                          </Button>
                        </div>
                      )}
                      {!confirmError && (
                        <Button
                          variant="outline"
                          size="lg"
                          className="w-full h-12 font-bold gap-2"
                          onClick={handleConfirmarMock}
                          disabled={confirming}
                        >
                          {confirming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          )}
                          Já paguei — confirmar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Neither checkout_url nor inline PIX */
            <div className="text-center text-muted-foreground text-sm mt-8">
              <p className="mb-3">Dados de pagamento indisponíveis. Tente novamente.</p>
              <Button variant="outline" onClick={() => setLocation('/paywall')}>
                Voltar aos planos
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
