import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRequestOtp, useVerifyOtp } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { setAuthTokenGetter } from '@workspace/api-client-react';

export default function Login() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      toast({ title: 'Telefone inválido', description: 'Digite um número válido com DDD.', variant: 'destructive' });
      return;
    }
    
    // Auto-prefix with +55 if not present
    const formattedPhone = phone.startsWith('+') ? phone : `+55${phone.replace(/\D/g, '')}`;
    
    requestOtp.mutate(
      { data: { telefone: formattedPhone } },
      {
        onSuccess: () => {
          setStep('otp');
          toast({ title: 'Código enviado', description: 'Verifique seu SMS ou WhatsApp.' });
        },
        onError: () => {
          toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
        }
      }
    );
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) return;

    const formattedPhone = phone.startsWith('+') ? phone : `+55${phone.replace(/\D/g, '')}`;

    verifyOtp.mutate(
      { data: { telefone: formattedPhone, codigo: otp } },
      {
        onSuccess: (data) => {
          localStorage.setItem('estadia_token', data.token);
          // Update the custom-fetch auth getter immediately
          setAuthTokenGetter(() => localStorage.getItem('estadia_token'));
          setLocation('/');
        },
        onError: () => {
          toast({ title: 'Código inválido', description: 'Verifique o código e tente novamente.', variant: 'destructive' });
        }
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
            Seu tempo vale dinheiro.
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} className="flex-1 flex flex-col gap-6">
            <div>
              <label className="block text-sm font-semibold mb-2">Qual seu WhatsApp ou celular?</label>
              <Input
                type="tel"
                placeholder="(11) 99999-9999"
                className="h-14 text-lg bg-card border-card-border"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
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
              <p className="text-center text-[11px] text-muted-foreground mt-4 px-4 leading-tight">
                Ao continuar, você concorda com nossos Termos de Uso e Política de Privacidade.
                Seus dados estão protegidos segundo a LGPD.
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="flex-1 flex flex-col gap-6 animate-in fade-in duration-300">
            <div>
              <label className="block text-sm font-semibold mb-2">Código recebido</label>
              <p className="text-sm text-muted-foreground mb-4">
                Enviamos um código para {phone}
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
                className="w-full mt-2 text-muted-foreground"
                onClick={() => setStep('phone')}
              >
                Mudar número
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
