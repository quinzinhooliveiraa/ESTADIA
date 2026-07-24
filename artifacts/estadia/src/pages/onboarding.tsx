import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ChevronRight, Download, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useDisplayMode } from '@/hooks/useDisplayMode';
import { useBeforeInstallPrompt } from '@/hooks/useBeforeInstallPrompt';

// ── Info slides ──────────────────────────────────────────────────────────────

const INFO_SLIDES = [
  {
    visual: '🚛',
    badge: '💤',
    title: 'Seu caminhão\nvirou depósito?',
    line: 'Passou de 5h — eles te devem.',
  },
  {
    visual: '📍',
    badge: '🔒',
    title: 'Aperta\nCHEGUEI.',
    line: 'O app grava. Prova que não apaga.',
  },
  {
    visual: '📄',
    badge: '💰',
    title: 'Documento\npronto.',
    line: 'Manda no WhatsApp do embarcador.',
  },
];

const SKIP_COUNTDOWN = 7;

// ── Visual install step ──────────────────────────────────────────────────────

function Step({
  num,
  icon,
  label,
  sub,
}: {
  num: number;
  icon: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      {/* Number badge */}
      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
        <span className="text-primary font-display font-bold text-lg leading-none">{num}</span>
      </div>
      {/* Icon */}
      <span className="text-4xl leading-none select-none shrink-0">{icon}</span>
      {/* Label */}
      <div className="flex flex-col min-w-0">
        <span className="font-bold text-base text-foreground leading-tight">{label}</span>
        {sub && <span className="text-sm text-muted-foreground mt-0.5 leading-tight">{sub}</span>}
      </div>
    </div>
  );
}

// ── Install slide ────────────────────────────────────────────────────────────

function InstallSlide({ onFinish }: { onFinish: () => void }) {
  const deferredPrompt = useBeforeInstallPrompt();
  const [countdown, setCountdown] = useState(SKIP_COUNTDOWN);
  const [installing, setInstalling] = useState(false);

  // Detect platform
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const hasOneTabInstall = !isIos && !!deferredPrompt;
  const isAndroidManual = !isIos && !deferredPrompt;

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setTimeout(onFinish, 800);
        return;
      }
    } finally {
      setInstalling(false);
    }
  }

  const canSkip = countdown <= 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col justify-center gap-7">

        {/* Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <span className="text-[80px] leading-none select-none">📲</span>
          <h1 className="text-3xl font-display uppercase tracking-tight leading-tight">
            Instala na<br />tela inicial
          </h1>
          <p className="text-base text-muted-foreground font-medium">
            Abre com um toque. Sem abrir navegador.
          </p>
        </div>

        {/* Step-by-step card */}
        <div className="flex flex-col gap-5 bg-card border border-card-border rounded-2xl px-5 py-6">

          {hasOneTabInstall && (
            /* Android with prompt — just point to the button */
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="text-5xl select-none">👇</span>
              <p className="font-bold text-lg">Aperta o botão verde aqui embaixo</p>
              <p className="text-sm text-muted-foreground">
                O celular vai confirmar — só aceita e pronto.
              </p>
            </div>
          )}

          {isAndroidManual && (
            /* Android Chrome — manual install */
            <>
              <Step
                num={1}
                icon="⋮"
                label="Toca nos três pontinhos"
                sub="canto superior direito do Chrome"
              />
              <div className="border-t border-border ml-14" />
              <Step
                num={2}
                icon="📲"
                label='"Instalar aplicativo"'
                sub='ou "Adicionar à tela inicial"'
              />
              <div className="border-t border-border ml-14" />
              <Step
                num={3}
                icon="✅"
                label="Pronto!"
                sub="o ESTADIA aparece na tela inicial"
              />
            </>
          )}

          {isIos && (
            /* iOS Safari */
            <>
              <Step
                num={1}
                icon="⬆️"
                label="Toca em Compartilhar"
                sub="barra inferior do Safari"
              />
              <div className="border-t border-border ml-14" />
              <Step
                num={2}
                icon="🏠"
                label='"Adicionar à Tela de Início"'
                sub="rola a lista pra encontrar"
              />
              <div className="border-t border-border ml-14" />
              <Step
                num={3}
                icon="✅"
                label="Pronto!"
                sub="o ESTADIA aparece na tela inicial"
              />
            </>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="pb-10 pt-6 flex flex-col gap-3">
        {hasOneTabInstall && (
          <Button
            size="lg"
            className="w-full h-16 text-xl font-bold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white gap-3 shadow-lg shadow-green-700/25 rounded-2xl"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? (
              <><Loader2 className="w-6 h-6 animate-spin" /> Instalando…</>
            ) : (
              <><Download className="w-6 h-6" /> INSTALAR AGORA</>
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          size="lg"
          className="w-full h-14 text-base text-muted-foreground"
          onClick={onFinish}
          disabled={!canSkip}
        >
          {canSkip
            ? 'Continuar sem instalar'
            : `Continuar sem instalar (${countdown}s)`}
        </Button>
      </div>
    </div>
  );
}

// ── Main Onboarding ──────────────────────────────────────────────────────────

export default function Onboarding() {
  const [slide, setSlide] = useState(0);
  const [, setLocation] = useLocation();
  const displayMode = useDisplayMode();

  const showInstallSlide = displayMode === 'browser';
  const totalDots = showInstallSlide ? INFO_SLIDES.length + 1 : INFO_SLIDES.length;
  const lastInfoSlide = INFO_SLIDES.length - 1;
  const installSlideIndex = INFO_SLIDES.length;

  const handleFinish = () => {
    localStorage.setItem('estadia_onboarding_seen', 'true');
    setLocation('/login');
  };

  const isInstallSlide = slide === installSlideIndex;

  const handleNext = () => {
    if (slide < lastInfoSlide) {
      setSlide((s) => s + 1);
    } else if (showInstallSlide) {
      setSlide(installSlideIndex);
    } else {
      handleFinish();
    }
  };

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] px-6 pt-4 pb-0 relative">

        {/* Skip — always visible */}
        <button
          onClick={handleFinish}
          className="absolute top-5 right-6 text-muted-foreground font-semibold text-sm z-10 py-2 px-1"
        >
          Pular
        </button>

        {/* Progress dots */}
        <div className="flex-shrink-0 flex justify-center pt-1 mb-8">
          <div className="flex gap-2 items-center">
            {Array.from({ length: totalDots }).map((_, i) => (
              <div
                key={i}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === slide ? 'w-10 bg-primary' : 'w-2.5 bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {isInstallSlide ? (
          <div className="flex-1 flex flex-col">
            <InstallSlide onFinish={handleFinish} />
          </div>
        ) : (
          <>
            {/* Info slide */}
            <div className="flex-1 flex flex-col justify-center items-center text-center">
              <div
                key={slide}
                className="animate-in fade-in zoom-in duration-300 flex flex-col items-center gap-8 w-full"
              >
                {/* Main visual — large emoji with accent badge */}
                <div className="relative inline-flex">
                  <span className="text-[100px] leading-none select-none drop-shadow-sm">
                    {INFO_SLIDES[slide].visual}
                  </span>
                  <span className="absolute -bottom-3 -right-5 text-[44px] leading-none select-none">
                    {INFO_SLIDES[slide].badge}
                  </span>
                </div>

                {/* Text block */}
                <div className="flex flex-col gap-3 mt-2">
                  <h1 className="text-[2.1rem] font-display uppercase tracking-tight leading-[1.1] whitespace-pre-line">
                    {INFO_SLIDES[slide].title}
                  </h1>
                  <p className="text-xl text-muted-foreground font-medium leading-snug">
                    {INFO_SLIDES[slide].line}
                  </p>
                </div>
              </div>
            </div>

            {/* CTA button */}
            <div className="pb-10 pt-6">
              <Button
                size="lg"
                className="w-full h-16 text-xl font-bold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-transform"
                onClick={handleNext}
              >
                {slide < lastInfoSlide || showInstallSlide ? (
                  <>Próximo <ChevronRight className="ml-1 w-6 h-6" /></>
                ) : (
                  'COMEÇAR AGORA'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
