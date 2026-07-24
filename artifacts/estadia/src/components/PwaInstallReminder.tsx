/**
 * PwaInstallReminder — lembrete recorrente e não-invasivo de instalação do PWA.
 *
 * Regras implementadas:
 * 1. Só aparece se NÃO estiver em modo standalone.
 * 2. Dois pontos de exibição: post-cobrança (PwaInstallCard) e home (PwaInstallBanner).
 * 3. Cooldown de 3 dias ao dispensar. Armazenado em cookie (não localStorage).
 * 4. "Não mostrar mais" respeita definitivamente.
 * 5. Botão INSTALAR dispara prompt nativo (Android/Chrome) ou abre instrução visual passo a passo.
 * 6. Nunca bloqueia o uso — sempre dispensável.
 */

import React, { useState, useCallback } from 'react';
import { X, Download, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDisplayMode } from '@/hooks/useDisplayMode';
import { useBeforeInstallPrompt } from '@/hooks/useBeforeInstallPrompt';

// ── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_NAME = 'estadia_pwa_remind';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

interface CookieState {
  permanent: boolean;
  dismissedAt: number | null;
}

function readCookieState(): CookieState {
  if (typeof document === 'undefined') return { permanent: false, dismissedAt: null };
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]*)'));
  if (!match) return { permanent: false, dismissedAt: null };
  const val = decodeURIComponent(match[1]);
  if (val === 'permanent') return { permanent: true, dismissedAt: null };
  const n = Number(val);
  return { permanent: false, dismissedAt: isNaN(n) ? null : n };
}

function writeDismissCookie(isPermanent: boolean) {
  const value = isPermanent ? 'permanent' : String(Date.now());
  const days = isPermanent ? 3650 : 7; // 10 years or 7 days (safe buffer for 3-day check)
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

// ── Browser / platform detection (mirrors onboarding.tsx logic) ───────────────

function detectBrowser() {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos) {
    const isIosSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    return { isIos: true, browser: isIosSafari ? 'ios-safari' : 'ios-other' } as const;
  }
  if (/SamsungBrowser/.test(ua)) return { isIos: false, browser: 'samsung' } as const;
  if (/Firefox/.test(ua))        return { isIos: false, browser: 'firefox' } as const;
  if (/Edg\//.test(ua))          return { isIos: false, browser: 'edge'    } as const;
  return { isIos: false, browser: 'chrome' } as const;
}

type ManualStep = { icon: string; label: string; sub?: string };

function buildManualSteps(browser: string): ManualStep[] {
  switch (browser) {
    case 'ios-safari':
      return [
        { icon: '⬆️', label: 'Toca em Compartilhar',         sub: 'botão na barra inferior do Safari' },
        { icon: '🏠', label: '"Adicionar à Tela de Início"',  sub: 'rola a lista pra encontrar' },
        { icon: '✅', label: 'Pronto!',                        sub: 'ESTADIA aparece na tela inicial' },
      ];
    case 'ios-other':
      return [
        { icon: '🌐', label: 'Abre no Safari',                sub: 'Chrome/Firefox no iPhone não instala' },
        { icon: '⬆️', label: 'Toca em Compartilhar',         sub: 'botão na barra inferior' },
        { icon: '🏠', label: '"Adicionar à Tela de Início"',  sub: 'rola a lista pra encontrar' },
      ];
    case 'samsung':
      return [
        { icon: '☰',  label: 'Toca nas três linhas',          sub: 'canto inferior direito do Samsung Internet' },
        { icon: '➕', label: '"Adicionar página a…"',         sub: 'depois "Tela inicial"' },
        { icon: '✅', label: 'Pronto!',                        sub: 'ESTADIA aparece na tela inicial' },
      ];
    case 'firefox':
      return [
        { icon: '⋮',  label: 'Toca nos três pontinhos',       sub: 'canto direito da barra do Firefox' },
        { icon: '📲', label: '"Instalar"',                    sub: 'ou "Adicionar à tela inicial"' },
        { icon: '✅', label: 'Pronto!',                        sub: 'ESTADIA aparece na tela inicial' },
      ];
    case 'edge':
      return [
        { icon: '⋯',  label: 'Toca nos três pontinhos',       sub: 'barra inferior do Edge' },
        { icon: '📲', label: '"Adicionar à tela inicial"',    sub: 'ou "Instalar aplicativo"' },
        { icon: '✅', label: 'Pronto!',                        sub: 'ESTADIA aparece na tela inicial' },
      ];
    default: // chrome
      return [
        { icon: '⋮',  label: 'Toca nos três pontinhos',       sub: 'canto superior direito do Chrome' },
        { icon: '📲', label: '"Instalar aplicativo"',         sub: 'ou "Adicionar à tela inicial"' },
        { icon: '✅', label: 'Pronto!',                        sub: 'ESTADIA aparece na tela inicial' },
      ];
  }
}

// ── Instructions modal (passo a passo visual) ─────────────────────────────────

function InstallInstructionsModal({ onClose }: { onClose: () => void }) {
  const deferredPrompt = useBeforeInstallPrompt();
  const [installing, setInstalling] = useState(false);
  const detected = detectBrowser();
  const hasNativePrompt = !detected.isIos && !!deferredPrompt;
  const steps = buildManualSteps(detected.browser);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setTimeout(onClose, 800);
        return;
      }
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-card border border-card-border rounded-t-3xl p-6 animate-in slide-in-from-bottom-4 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-display uppercase tracking-tight">Instalar ESTADIA</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps or one-tap hint */}
        {hasNativePrompt ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center mb-6">
            <span className="text-5xl select-none">👇</span>
            <p className="font-bold text-base">Aperta o botão aqui embaixo</p>
            <p className="text-sm text-muted-foreground">O celular vai confirmar — só aceita e pronto.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 bg-muted/40 rounded-2xl px-4 py-5 mb-6">
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <span className="text-primary font-display font-bold text-base leading-none">{i + 1}</span>
                  </div>
                  <span className="text-3xl leading-none select-none shrink-0">{s.icon}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm text-foreground leading-tight">{s.label}</span>
                    {s.sub && (
                      <span className="text-xs text-muted-foreground mt-0.5">{s.sub}</span>
                    )}
                  </div>
                </div>
                {i < steps.length - 1 && <div className="border-t border-border ml-[52px]" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Native install button */}
        {hasNativePrompt && (
          <Button
            size="lg"
            className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700 text-white gap-2 mb-3"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Instalando…</>
            ) : (
              <><Download className="w-5 h-5" /> INSTALAR AGORA</>
            )}
          </Button>
        )}

        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}

// ── Shared hook ───────────────────────────────────────────────────────────────

function usePwaReminder() {
  const displayMode = useDisplayMode();
  const deferredPrompt = useBeforeInstallPrompt();
  const [cookieState, setCookieState] = useState<CookieState>(readCookieState);
  const [showInstructions, setShowInstructions] = useState(false);

  const isInstalled = displayMode === 'standalone';
  const { permanent, dismissedAt } = cookieState;
  const cooldownActive = dismissedAt !== null && Date.now() - dismissedAt < THREE_DAYS_MS;
  const canShow = !isInstalled && !permanent && !cooldownActive;

  const dismiss = useCallback((isPermanent: boolean) => {
    writeDismissCookie(isPermanent);
    setCookieState(readCookieState());
  }, []);

  const triggerInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') return;
      } catch { /* fall through to instructions */ }
    }
    setShowInstructions(true);
  }, [deferredPrompt]);

  return { canShow, dismiss, triggerInstall, showInstructions, setShowInstructions };
}

// ── Post-cobrança card ────────────────────────────────────────────────────────

/**
 * Card discreto exibido após gerar um documento de cobrança.
 * Coloca dentro da área scrollável da página de cobrança, após o documento.
 */
export function PwaInstallCard() {
  const { canShow, dismiss, triggerInstall, showInstructions, setShowInstructions } = usePwaReminder();
  const [localDismissed, setLocalDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!canShow || localDismissed) return null;

  async function handleInstall() {
    setInstalling(true);
    await triggerInstall();
    setInstalling(false);
  }

  function handleDismiss(permanent: boolean) {
    dismiss(permanent);
    setLocalDismissed(true);
  }

  return (
    <>
      <div className="w-full max-w-[400px] mt-4 bg-primary/5 border border-primary/20 rounded-xl p-4">
        {/* Top row: icon + text + X */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5">
            <span className="text-2xl leading-none select-none mt-0.5 shrink-0">📲</span>
            <p className="text-sm font-semibold text-foreground leading-snug">
              Instala o ESTADIA na tela inicial pra abrir com um toque no pátio
            </p>
          </div>
          <button
            onClick={() => handleDismiss(false)}
            className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
            aria-label="Dispensar por 3 dias"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground font-bold gap-1.5 shrink-0"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            INSTALAR
          </Button>
          <button
            onClick={() => handleDismiss(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            não mostrar mais
          </button>
        </div>
      </div>

      {showInstructions && (
        <InstallInstructionsModal onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}

// ── Home banner ───────────────────────────────────────────────────────────────

/**
 * Banner fino no topo da home. Só aparece se já passaram 3 dias desde a última
 * dispensa (ou se nunca foi dispensado).
 */
export function PwaInstallBanner() {
  const { canShow, dismiss, triggerInstall, showInstructions, setShowInstructions } = usePwaReminder();
  const [localDismissed, setLocalDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (!canShow || localDismissed) return null;

  async function handleInstall() {
    setInstalling(true);
    await triggerInstall();
    setInstalling(false);
  }

  function handleDismiss(permanent: boolean) {
    dismiss(permanent);
    setLocalDismissed(true);
  }

  return (
    <>
      <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2.5 mb-4">
        {/* Main row */}
        <div className="flex items-center gap-2">
          <span className="text-base leading-none select-none shrink-0">📲</span>
          <p className="text-xs font-medium text-foreground leading-snug flex-1 min-w-0">
            Instala o ESTADIA na tela inicial pra abrir com um toque no pátio
          </p>
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs font-bold bg-primary text-primary-foreground gap-1 shrink-0"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing && <Loader2 className="w-3 h-3 animate-spin" />}
            INSTALAR
          </Button>
          <button
            onClick={() => handleDismiss(false)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dispensar por 3 dias"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* "Não mostrar mais" — secondary, smaller */}
        <button
          onClick={() => handleDismiss(true)}
          className="mt-1.5 ml-6 text-[10px] text-muted-foreground/70 hover:text-muted-foreground underline underline-offset-2"
        >
          não mostrar mais
        </button>
      </div>

      {showInstructions && (
        <InstallInstructionsModal onClose={() => setShowInstructions(false)} />
      )}
    </>
  );
}
