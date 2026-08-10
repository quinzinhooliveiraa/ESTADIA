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

const SKIP_COUNTDOWN = 8;

const INSTALL_SEEN_KEY = 'onboarding_install_visto';

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

// ── Browser/platform detection ───────────────────────────────────────────────

function detectPlatform() {
  const ua = navigator.userAgent;

  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIos) {
    const isIosSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    return { platform: 'ios', isIosSafari } as const;
  }

  if (/Android/.test(ua)) return { platform: 'android', isIosSafari: false } as const;
  return { platform: 'other', isIosSafari: false } as const;
}

// ── Manual install steps per browser ────────────────────────────────────────

type ManualSteps = { icon: string; label: string; sub?: string }[];

function manualSteps(platform: ReturnType<typeof detectPlatform>['platform']): ManualSteps {
  switch (platform) {
    case 'ios':
      return [
        { icon: '□↑', label: 'Toca no botão compartilhar □↑', sub: 'na barra do Safari' },
        { icon: '＋', label: "Escolhe 'Adicionar à Tela de Início'" },
      ];
    case 'android':
      return [
        { icon: '⋮', label: 'Toca nos 3 pontinhos', sub: 'no canto superior direito' },
        { icon: '＋', label: "Escolhe 'Adicionar à tela inicial'" },
      ];
    default:
      return [
        { icon: '⌂', label: 'Abre o menu do navegador', sub: 'procura "Adicionar à tela inicial"' },
        { icon: '＋', label: 'Confirma para instalar o app' },
      ];
  }
}

// ── Install slide ────────────────────────────────────────────────────────────

function InstallSlide({ onFinish }: { onFinish: () => void }) {
  const deferredPrompt = useBeforeInstallPrompt();
  const [countdown, setCountdown] = useState(SKIP_COUNTDOWN);
  const [installing, setInstalling] = useState(false);

  const detected = detectPlatform();
  const hasOneTapInstall = detected.platform === 'android' && !!deferredPrompt;
  const steps = manualSteps(detected.platform);

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
  const isIosOtherBrowser = detected.platform === 'ios' && !detected.isIosSafari;

  return (
    <div className="flex h-full flex-col rounded-3xl bg-[#0E1114] px-5 text-[#F5F6F7]">
      <div className="flex flex-1 flex-col justify-center gap-6">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#FFC400]/15 text-5xl text-[#FFC400] shadow-[0_0_35px_-10px_rgba(255,196,0,0.7)]">
            {detected.platform === 'ios' ? '□↑' : detected.platform === 'android' ? '⋮' : '＋'}
          </div>
          <h1 className="text-3xl font-display uppercase tracking-tight leading-tight">
            Instala o app primeiro
          </h1>
          <p className="max-w-xs text-base font-medium leading-snug text-[#F5F6F7]/70">
            É rápido. Funciona sem internet e registra o GPS certinho.
          </p>
        </div>

        {/* Platform-specific install instructions */}
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5">
          {hasOneTapInstall ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="text-5xl text-[#FFC400]">👇</span>
              <p className="text-lg font-bold">Instala com um toque</p>
              <p className="text-sm text-[#F5F6F7]/65">O Chrome vai confirmar — só aceita e pronto.</p>
            </div>
          ) : (
            <>
              {steps.map((s, i) => (
                <React.Fragment key={i}>
                  <Step num={i + 1} icon={s.icon} label={s.label} sub={s.sub} />
                  {i < steps.length - 1 && <div className="flex justify-center text-2xl leading-none text-[#FFC400]">↓</div>}
                </React.Fragment>
              ))}
            </>
          )}
        </div>

        {isIosOtherBrowser && (
          <p className="rounded-xl border border-[#FFC400]/25 bg-[#FFC400]/10 px-4 py-3 text-center text-xs leading-relaxed text-[#F5F6F7]/80">
            Só funciona no Safari. Se estiver em outro navegador, abre esse link no Safari primeiro.
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 pb-10 pt-6">
        {hasOneTapInstall && (
          <Button
            size="lg"
            className="h-16 w-full rounded-2xl bg-[#FFC400] text-xl font-bold text-[#0E1114] shadow-lg shadow-[#FFC400]/20 hover:bg-[#e6b000] active:bg-[#d9a900]"
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
          className="h-12 w-full text-sm text-[#F5F6F7]/55 hover:text-[#F5F6F7]/80"
          onClick={onFinish}
          disabled={!canSkip}
        >
          {canSkip
            ? 'Pular por agora (não recomendado)'
            : `Pular por agora (não recomendado) · ${countdown}s`}
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

  const [installSeen] = useState(
    () => localStorage.getItem(INSTALL_SEEN_KEY) === 'true',
  );
  const showInstallSlide = displayMode === 'browser' && !installSeen;
  const totalDots = showInstallSlide ? INFO_SLIDES.length + 1 : INFO_SLIDES.length;
  const lastInfoSlide = INFO_SLIDES.length - 1;
  const installSlideIndex = INFO_SLIDES.length;

  const handleFinish = () => {
    localStorage.setItem('estadia_onboarding_seen', 'true');
    setLocation('/login');
  };

  const handleInstallFinish = () => {
    localStorage.setItem(INSTALL_SEEN_KEY, 'true');
    handleFinish();
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

        {/* Skip is handled inside the install card, after the 8-second delay. */}
        {!isInstallSlide && (
          <button
            onClick={handleFinish}
            className="absolute right-6 top-5 z-10 px-1 py-2 text-sm font-semibold text-muted-foreground"
          >
            Pular
          </button>
        )}

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
            <InstallSlide onFinish={handleInstallFinish} />
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
