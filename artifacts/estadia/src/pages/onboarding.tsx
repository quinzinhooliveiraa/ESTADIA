import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Truck, MapPin, CheckCircle2, ChevronRight, Download, Share } from 'lucide-react';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useDisplayMode } from '@/hooks/useDisplayMode';
import { useBeforeInstallPrompt } from '@/hooks/useBeforeInstallPrompt';

// ── Info slides data ────────────────────────────────────────────────────────

const INFO_SLIDES = [
  {
    icon: <Truck className="w-16 h-16 text-primary mb-6" />,
    title: "Ficou parado mais de 5 horas?",
    subtitle: "Eles te devem.",
    description: "Passou de 5 horas esperando? O embarcador tem que pagar pela hora parada. É lei (13.103/2015).",
  },
  {
    icon: <MapPin className="w-16 h-16 text-primary mb-6" />,
    title: "O app é sua testemunha",
    subtitle: "GPS + registro imutável",
    description: "Chegou pra carregar ou descarregar? Aperte um botão. O app registra a hora e o local exato com GPS. Com prova de GPS, fica muito difícil negarem.",
  },
  {
    icon: <CheckCircle2 className="w-16 h-16 text-primary mb-6" />,
    title: "Cobrança pronta no WhatsApp",
    subtitle: "Fácil e rápido",
    description: "Geramos um PDF oficial com a cobrança com base na Lei 13.103, com a tarifa oficial por tonelada/hora (reajustada pelo INPC). É só mandar pro embarcador.",
  },
];

const SKIP_COUNTDOWN = 7; // seconds before "Continuar sem instalar" becomes active

// ── Install slide ───────────────────────────────────────────────────────────

function InstallSlide({ onFinish }: { onFinish: () => void }) {
  const deferredPrompt = useBeforeInstallPrompt();
  const [countdown, setCountdown] = useState(SKIP_COUNTDOWN);
  const [installing, setInstalling] = useState(false);

  // Detect iOS (no beforeinstallprompt support)
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Countdown timer
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
        // Give the browser a moment to process the install before navigating
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
      {/* Content */}
      <div className="flex-1 flex flex-col justify-center items-center text-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Download className="w-10 h-10 text-primary" />
        </div>

        <div>
          <h1 className="text-2xl font-display uppercase tracking-tight mb-2">
            Instala o ESTADIA
            <br />
            na tela inicial
          </h1>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p>📍 Abre com um toque no pátio, sem abrir o navegador</p>
            <p>📱 Funciona como um app de verdade</p>
          </div>
        </div>

        {/* iOS: share-sheet instruction */}
        {isIos && (
          <div className="w-full max-w-[280px] rounded-xl border border-border bg-muted/40 p-4 text-sm text-left space-y-2">
            <p className="font-semibold text-foreground flex items-center gap-2">
              <Share className="w-4 h-4" /> Como instalar no iOS:
            </p>
            <ol className="text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Toca em <span className="font-semibold">Compartilhar</span> <span className="font-bold">↑</span> na barra do Safari</li>
              <li>Escolhe <span className="font-semibold">"Adicionar à Tela de Início"</span></li>
            </ol>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="pb-8 space-y-3">
        {/* Install button — Android/Chrome only */}
        {!isIos && deferredPrompt && (
          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            onClick={handleInstall}
            disabled={installing}
          >
            <Download className="w-5 h-5" />
            {installing ? 'Instalando…' : 'INSTALAR APP'}
          </Button>
        )}

        {/* Skip button with countdown */}
        <Button
          variant="ghost"
          size="lg"
          className="w-full h-12 text-muted-foreground"
          onClick={onFinish}
          disabled={!canSkip}
        >
          {canSkip
            ? 'Continuar sem instalar'
            : `Continuar sem instalar (${countdown})`}
        </Button>
      </div>
    </div>
  );
}

// ── Main Onboarding component ───────────────────────────────────────────────

export default function Onboarding() {
  const [slide, setSlide] = useState(0);
  const [, setLocation] = useLocation();
  const displayMode = useDisplayMode();

  // Show the install slide only when running in a regular browser tab
  const showInstallSlide = displayMode === 'browser';
  const totalDots = showInstallSlide ? INFO_SLIDES.length + 1 : INFO_SLIDES.length;
  const lastInfoSlide = INFO_SLIDES.length - 1;
  const installSlideIndex = INFO_SLIDES.length;

  const handleFinish = () => {
    localStorage.setItem('estadia_onboarding_seen', 'true');
    setLocation('/login');
  };

  const isInstallSlide = slide === installSlideIndex;

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] p-6 relative">
        {/* Skip — always visible, including on install slide */}
        <button
          onClick={handleFinish}
          className="absolute top-6 right-6 text-muted-foreground font-medium text-sm"
        >
          Pular
        </button>

        {/* Dot indicators */}
        <div className="flex-shrink-0 flex justify-center pt-2 mb-8">
          <div className="flex gap-2">
            {Array.from({ length: totalDots }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === slide ? 'w-8 bg-primary' : 'w-2 bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {isInstallSlide ? (
          // Install slide takes full remaining space
          <div className="flex-1 flex flex-col">
            <InstallSlide onFinish={handleFinish} />
          </div>
        ) : (
          // Info slides
          <>
            <div className="flex-1 flex flex-col justify-center">
              <div className="text-center animate-in fade-in zoom-in duration-300 flex flex-col items-center">
                {INFO_SLIDES[slide].icon}
                <h1 className="text-3xl font-display uppercase tracking-tight mb-2">
                  {INFO_SLIDES[slide].title}
                </h1>
                <h2 className="text-xl font-semibold text-muted-foreground mb-4">
                  {INFO_SLIDES[slide].subtitle}
                </h2>
                <p className="text-foreground/80 leading-relaxed max-w-[280px]">
                  {INFO_SLIDES[slide].description}
                </p>
              </div>
            </div>

            <div className="pb-8">
              {slide < lastInfoSlide ? (
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setSlide((s) => s + 1)}
                >
                  Próximo
                  <ChevronRight className="ml-2 w-5 h-5" />
                </Button>
              ) : showInstallSlide ? (
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => setSlide(installSlideIndex)}
                >
                  Próximo
                  <ChevronRight className="ml-2 w-5 h-5" />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleFinish}
                >
                  Começar agora
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
