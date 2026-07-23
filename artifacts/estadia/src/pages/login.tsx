import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRequestOtp, useVerifyOtp } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { setToken } from '@/lib/token';
import { Loader2 } from 'lucide-react';

// D5: demo button only when VITE_DEMO_MODE=true
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/** Formats raw digit string as (DD) DDDDD-DDDD or (DD) DDDD-DDDD */
function maskPhone(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Login() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  // Store only raw digits; display via maskPhone()
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [otp, setOtp] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  // Tick down the resend countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao entrar em modo demo');
      const data = await res.json();
      setToken(data.token);
      localStorage.setItem('estadia_onboarding_seen', '1');
      setLocation('/');
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível entrar em modo demo.', variant: 'destructive' });
    } finally {
      setDemoLoading(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
    setPhoneDigits(digits);
    if (phoneError) setPhoneError('');
  };

  const dispatchOtp = (digits: string) => {
    const formattedPhone = `+55${digits}`;
    requestOtp.mutate(
      { data: { telefone: formattedPhone } },
      {
        onSuccess: () => {
          setStep('otp');
          setCountdown(60);
          toast({ title: 'Código enviado', description: 'Verifique seu SMS ou WhatsApp.' });
        },
        onError: () => {
          toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
        },
      }
    );
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setPhoneError('Confira o número — deve ter DDD + 9 dígitos');
      return;
    }
    dispatchOtp(phoneDigits);
  };

  const handleResend = () => {
    dispatchOtp(phoneDigits);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) return;

    const formattedPhone = `+55${phoneDigits}`;

    verifyOtp.mutate(
      { data: { telefone: formattedPhone, codigo: otp } },
      {
        onSuccess: (data) => {
          setToken(data.token);
          setLocation('/');
        },
        onError: () => {
          toast({ title: 'Código inválido', description: 'Verifique o código e tente novamente.', variant: 'destructive' });
        },
      }
    );
  };

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] p-6 pt-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display uppercase tracking-tighter mb-2 text-primary">
            ESTADIA
          </h1>
          <p className="text-muted-foreground font-medium">
            Prove a estadia. Receba o que é seu.
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} className="flex-1 flex flex-col gap-6">
            <div>
              <label className="block text-sm font-semibold mb-2">Qual seu WhatsApp ou celular?</label>
              <Input
                type="tel"
                placeholder="(11) 99999-9999"
                className={`h-14 text-lg bg-card border-card-border ${phoneError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                value={maskPhone(phoneDigits)}
                onChange={handlePhoneChange}
                autoFocus
              />
              {phoneError && (
                <p className="mt-1.5 text-sm text-destructive">{phoneError}</p>
              )}
            </div>

            <div className="mt-auto pb-6">
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={requestOtp.isPending}
              >
                {requestOtp.isPending ? 'Enviando...' : 'Receber código'}
              </Button>

              {/* D5: demo button behind VITE_DEMO_MODE flag */}
              {DEMO_MODE && (
                <>
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground uppercase tracking-widest">ou</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full h-12 font-semibold border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-primary/60"
                    onClick={handleDemo}
                    disabled={demoLoading}
                    data-testid="button-demo"
                  >
                    {demoLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando demo...</>
                    ) : (
                      '🚛 Experimentar modo demo'
                    )}
                  </Button>
                </>
              )}

              {/* B2 / C3: terms links */}
              <p className="text-center text-[11px] text-muted-foreground mt-4 px-4 leading-tight">
                Ao continuar, você concorda com os{' '}
                <Link href="/termos" className="underline underline-offset-2 hover:text-foreground">
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link href="/privacidade" className="underline underline-offset-2 hover:text-foreground">
                  Política de Privacidade
                </Link>.
                Seus dados estão protegidos segundo a LGPD.
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="flex-1 flex flex-col gap-6 animate-in fade-in duration-300">
            <div>
              <label className="block text-sm font-semibold mb-2">Código recebido</label>
              <p className="text-sm text-muted-foreground mb-4">
                Enviamos um código para{' '}
                <span className="font-medium text-foreground">{maskPhone(phoneDigits)}</span>
                {' · '}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                  onClick={() => { setStep('phone'); setCountdown(0); }}
                >
                  trocar número
                </button>
              </p>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                className="h-16 text-3xl font-timer tracking-widest text-center bg-card border-card-border"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
            </div>

            <div className="mt-auto pb-6">
              <Button
                type="submit"
                size="lg"
                className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={verifyOtp.isPending || otp.length < 4}
              >
                {verifyOtp.isPending ? 'Verificando...' : 'Entrar'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full mt-2 text-muted-foreground disabled:opacity-50"
                onClick={handleResend}
                disabled={countdown > 0 || requestOtp.isPending}
              >
                {requestOtp.isPending
                  ? 'Enviando...'
                  : countdown > 0
                    ? `Reenviar em ${countdown}s`
                    : 'Reenviar código'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
