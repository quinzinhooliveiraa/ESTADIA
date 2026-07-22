import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  RefreshCw,
} from 'lucide-react';
import { checkoutStore } from '@/lib/checkout-store';
import { getToken } from '@/lib/token';

const POLLING_INTERVAL_MS = 3_000;
const VERIFY_INTERVAL_MS = 3_000; // how often to call verify-pix
const POLLING_MAX_MS = 30 * 60 * 1_000; // 30 minutes

const PLANO_LABELS: Record<string, { titulo: string; preco: string; ciclo: string }> = {
  pro_mensal: { titulo: 'PRO Mensal', preco: 'R$ 19,90', ciclo: 'por mês' },
  pro_anual:  { titulo: 'PRO Anual',  preco: 'R$ 199',   ciclo: 'por ano'  },
};

export default function Pagamento() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);

  const checkout = checkoutStore.get();
  const isLive   = checkout?.is_live === true;

  // Determine display mode
  const hasPixQr      = Boolean(checkout?.pix_qr_code && checkout?.pix_copia_cola);
  const hasCheckoutUrl = Boolean(checkout?.checkout_url);

  const planInfo = PLANO_LABELS[checkout?.plano ?? ''] ?? null;

  const { data: assinatura } = useGetAssinatura();

  // ── Activate when subscription becomes active ──────────────────────────────
  useEffect(() => {
    if (assinatura?.status === 'ativo') {
      if (pollingRef.current)  clearInterval(pollingRef.current);
      if (verifyRef.current)   clearInterval(verifyRef.current);
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
      toast({ title: 'Pagamento confirmado!', description: 'Você agora é PRO 🎉' });
      checkoutStore.clear();
      setLocation('/');
    }
  }, [assinatura, setLocation, toast]);

  // ── Verify PIX status on server (live v1 only) ─────────────────────────────
  const verifyPix = useCallback(async () => {
    const chargeId = checkout?.charge_id;
    if (!chargeId || !isLive) return;
    try {
      const token = getToken();
      const res = await fetch('/api/assinatura/verificar-pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ charge_id: chargeId }),
      });
      if (res.ok) {
        // Always refresh — catches both verify-pix activation and webhook-activated cases
        queryClient.invalidateQueries({ queryKey: getGetAssinaturaQueryKey() });
      }
    } catch {
      // ignore — polling continues
    }
  }, [checkout?.charge_id, isLive, queryClient]);

  // ── Start polling loops ────────────────────────────────────────────────────
  useEffect(() => {
    if (!checkout) return;

    // Subscription status poll (covers webhook-activated + verify-pix-activated)
    pollingRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetAssinaturaQueryKey() });
    }, POLLING_INTERVAL_MS);

    // Active verify-pix calls (live PIX avulso only)
    if (hasPixQr && isLive && checkout.charge_id) {
      verifyRef.current = setInterval(verifyPix, VERIFY_INTERVAL_MS);
    }

    timeoutRef.current = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (verifyRef.current)  clearInterval(verifyRef.current);
      setTimedOut(true);
    }, POLLING_MAX_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (verifyRef.current)  clearInterval(verifyRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Redirect if no checkout data ─────────────────────────────────────────
  useEffect(() => {
    if (!checkout) setLocation('/paywall');
  }, [checkout, setLocation]);

  if (!checkout) return null;

  // ── PIX copy handler ────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!checkout.pix_copia_cola) return;
    navigator.clipboard.writeText(checkout.pix_copia_cola);
    setCopied(true);
    toast({ title: 'Código PIX copiado' });
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Manual verify ("Já paguei?") button ────────────────────────────────
  const handleVerificarManual = async () => {
    setVerifying(true);
    await verifyPix();
    await queryClient.invalidateQueries({ queryKey: getGetAssinaturaQueryKey() });
    setVerifying(false);
  };

  // ── Mock-only: confirm payment manually ────────────────────────────────
  const handleConfirmarMock = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const token = getToken();
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
        setConfirmError(body?.error || `Erro ${res.status} ao confirmar pagamento.`);
      }
    } catch {
      setConfirmError('Falha de conexão. Verifique sua rede e tente novamente.');
    } finally {
      setConfirming(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // FLOW A: Embedded iframe (v2 — cartao / pix_automatico)
  // ══════════════════════════════════════════════════════════════════════════
  if (hasCheckoutUrl) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2"
            onClick={() => { checkoutStore.clear(); setLocation('/paywall'); }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="text-base font-semibold">Pagamento seguro</span>
          {!timedOut && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              Aguardando…
            </div>
          )}
        </div>

        <div className="relative flex-1 overflow-hidden">
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

        {timedOut && (
          <div className="shrink-0 p-4 border-t border-border bg-background text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Tempo esgotado. Verifique seu banco e volte para confirmar.
            </p>
            <Button variant="outline" onClick={() => setLocation('/paywall')}>
              Voltar aos planos
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FLOW B: Inline PIX QR (live v1 pix_avulso  OR  mock/dev)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background overflow-y-auto">
        {/* Header */}
        <div className="p-4 shrink-0 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/paywall')}
            className="-ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold ml-2">Pagamento via PIX</h1>
        </div>

        <div className="px-6 pb-8 flex-1 flex flex-col items-center">

          {/* Dev mode banner */}
          {!isLive && (
            <div className="w-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center mb-5">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-0.5">
                Modo desenvolvimento
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300">
                QR Code de teste. Use o botão "Confirmar" abaixo.
              </p>
            </div>
          )}

          {/* Plan info */}
          {planInfo && (
            <div className="w-full flex items-center justify-between mb-5 px-1">
              <span className="font-bold text-sm">{planInfo.titulo}</span>
              <span className="text-muted-foreground text-sm">{planInfo.preco} {planInfo.ciclo}</span>
            </div>
          )}

          {hasPixQr ? (
            <>
              <p className="text-muted-foreground text-center text-sm mb-5">
                Escaneie o QR Code ou copie o código para pagar no app do seu banco.
              </p>

              {/* QR Code */}
              <div className="bg-white p-4 rounded-2xl mb-6 w-56 h-56 flex items-center justify-center shadow-sm">
                {checkout.pix_qr_code ? (
                  <img
                    src={
                      checkout.pix_qr_code.trimStart().startsWith('data:')
                        ? checkout.pix_qr_code
                        : `data:image/png;base64,${checkout.pix_qr_code.replace(/\s/g, '')}`
                    }
                    alt="QR Code PIX"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error('[QR] Failed to render brCodeBase64 as image', e);
                    }}
                  />
                ) : (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Copia e cola */}
              <div className="w-full bg-card border border-border rounded-xl p-4 mb-6">
                <p className="text-xs text-muted-foreground font-bold mb-2 uppercase tracking-wider">
                  PIX Copia e Cola
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-background rounded-lg px-3 py-2.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-mono text-muted-foreground">
                    {checkout.pix_copia_cola}
                  </div>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={handleCopy}
                    className="h-auto shrink-0 bg-primary/15 text-primary hover:bg-primary/25 border-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {timedOut ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-muted-foreground">O QR Code expirou. Tente novamente.</p>
                  <Button variant="outline" onClick={() => setLocation('/paywall')}>
                    Voltar aos planos
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 mt-auto w-full">
                  {/* Waiting indicator */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Aguardando confirmação do banco…
                  </div>

                  {/* Live: "Já paguei?" trigger verify-pix manually */}
                  {isLive && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleVerificarManual}
                      disabled={verifying}
                    >
                      {verifying
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                      Já paguei — verificar
                    </Button>
                  )}

                  {/* Mock: confirm button */}
                  {!isLive && (
                    <div className="w-full flex flex-col gap-2">
                      {confirmError && (
                        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-center">
                          <p className="text-sm text-destructive mb-2">{confirmError}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/40 text-destructive"
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
                          {confirming
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          Já paguei — confirmar (dev)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* No QR and no checkout URL — shouldn't normally happen */
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
