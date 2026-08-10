import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Check, ChevronRight, Clock3, FileText, MapPin, ShieldCheck, Truck } from 'lucide-react';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { getToken } from '@/lib/token';
import { hasSeenSimulacao, markSimulacaoSeen } from '@/lib/simulacao';

const SKIP_COUNTDOWN = 8;

function SimulationBadge() {
  return (
    <span className="absolute right-3 top-3 rounded-full bg-black/35 px-2 py-1 text-[10px] font-bold tracking-widest text-white">
      SIMULAÇÃO
    </span>
  );
}

function SimulationButton() {
  return (
    <div className="relative w-full">
      <SimulationBadge />
      <Button
        size="lg"
        className="pointer-events-none h-24 w-full overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-[0_0_40px_-10px_rgba(255,196,0,0.4)]"
      >
        <span className="font-display text-4xl tracking-tight leading-none">CHEGUEI</span>
        <span className="absolute bottom-3 text-xs font-bold opacity-75">
          <MapPin className="mr-1 inline-block h-3 w-3" /> REGISTRAR CHEGADA COM GPS
        </span>
      </Button>
    </div>
  );
}

function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function StepOne() {
  return (
    <div className="flex w-full flex-col items-center gap-7 text-center">
      <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-primary/10">
        <Truck className="h-16 w-16 text-primary" />
        <span className="absolute -bottom-2 rounded-full bg-success px-3 py-1 text-[10px] font-bold tracking-wider text-success-foreground">
          CHEGADA REGISTRADA
        </span>
      </div>
      <div className="space-y-3">
        <h2 className="text-2xl font-display uppercase leading-tight">Você chegou no pátio</h2>
        <p className="text-base font-medium leading-relaxed text-muted-foreground">
          Aperta CHEGUEI quando chegar. O GPS registra a hora. Ninguém apaga depois.
        </p>
      </div>
      <SimulationButton />
    </div>
  );
}

function StepTwo() {
  const [elapsed, setElapsed] = useState(6 * 60 * 60 + 30 * 60);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-7 text-center">
      <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border-4 border-primary/30 bg-primary/10">
        <Clock3 className="mb-1 h-7 w-7 text-primary" />
        <span className="font-timer text-2xl font-bold text-primary">{formatTimer(elapsed)}</span>
      </div>
      <div className="space-y-3">
        <h2 className="text-2xl font-display uppercase leading-tight">O relógio corre</h2>
        <p className="text-base font-medium leading-relaxed text-muted-foreground">
          Passou das 5h, o valor aparece na tela. Você vê quanto te devem ao vivo.
        </p>
      </div>
      <div className="w-full rounded-2xl border border-success/30 bg-success/10 p-5">
        <span className="block text-xs font-bold uppercase tracking-wider text-success">Eles te devem</span>
        <span className="mt-1 block text-3xl font-display text-success">R$ 123,50</span>
      </div>
    </div>
  );
}

function StepThree() {
  return (
    <div className="flex w-full flex-col items-center gap-5 text-center">
      <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-lg">
        <SimulationBadge />
        <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-display text-sm">DOCUMENTO DE ESTADIA</p>
            <p className="text-xs text-muted-foreground">Simulação — sem validade</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Chegada</span>
            <strong>10/08/2026 · 07:30</strong>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Saída</span>
            <strong>10/08/2026 · 14:00</strong>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-3">
            <span className="text-muted-foreground">Valor</span>
            <strong className="text-success">R$ 123,50</strong>
          </div>
          <div className="flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>Lei 13.103/2015 — tempo de espera do motorista</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-2xl font-display uppercase leading-tight">Documento pronto</h2>
        <p className="text-base font-medium leading-relaxed text-muted-foreground">
          Gera o documento e manda no WhatsApp. É sua prova.
        </p>
      </div>
    </div>
  );
}

export default function Simulacao() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [skipReady, setSkipReady] = useState(false);
  const motoristaId = (() => {
    try {
      return JSON.parse(localStorage.getItem('estadia_last_motorista') ?? 'null')?.id as string | undefined;
    } catch {
      return undefined;
    }
  })();

  useEffect(() => {
    if (!getToken()) {
      setLocation('/login');
      return;
    }
    const id = motoristaId;
    if (!id || hasSeenSimulacao(id)) {
      setLocation('/');
      return;
    }
    const timer = window.setTimeout(() => setSkipReady(true), SKIP_COUNTDOWN * 1000);
    return () => window.clearTimeout(timer);
  }, [motoristaId, setLocation]);

  const finish = () => {
    if (motoristaId) markSimulacaoSeen(motoristaId);
    setLocation('/');
  };

  return (
    <AppLayout showNav={false}>
      <div className="relative flex h-[100dvh] flex-col px-6 pb-0 pt-4">
        <button
          onClick={skipReady ? finish : undefined}
          disabled={!skipReady}
          className={`absolute right-6 top-5 z-10 px-1 py-2 text-sm font-semibold transition-opacity ${
            skipReady ? 'text-muted-foreground' : 'cursor-default text-muted-foreground/30'
          }`}
        >
          {skipReady ? 'Pular' : `Pular (${SKIP_COUNTDOWN}s)`}
        </button>

        <div className="mb-8 flex flex-shrink-0 justify-center pt-1">
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  item === step ? 'w-10 bg-primary' : 'w-2.5 bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        <div key={step} className="flex flex-1 animate-in flex-col items-center justify-center gap-6 fade-in zoom-in duration-300">
          <div className="text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-primary">Veja como funciona</p>
            <p className="text-sm font-semibold text-muted-foreground">Passo {step + 1} de 3</p>
          </div>
          {step === 0 && <StepOne />}
          {step === 1 && <StepTwo />}
          {step === 2 && <StepThree />}
        </div>

        <div className="flex flex-col gap-3 pb-10 pt-6">
          {step < 2 ? (
            <Button
              size="lg"
              className="h-16 w-full rounded-2xl bg-primary text-xl font-bold text-primary-foreground transition-transform active:scale-95"
              onClick={() => setStep((value) => value + 1)}
            >
              Próximo <ChevronRight className="ml-1 h-6 w-6" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-16 w-full rounded-2xl bg-green-600 text-base font-bold text-white hover:bg-green-700 active:scale-95"
              onClick={finish}
            >
              <Check className="h-5 w-5" /> ENTENDI — QUERO USAR DE VERDADE
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}