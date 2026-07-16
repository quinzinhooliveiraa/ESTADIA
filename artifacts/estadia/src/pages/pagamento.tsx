import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useGetAssinatura, getGetAssinaturaQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Loader2, ArrowLeft } from 'lucide-react';

export default function Pagamento() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  
  const checkoutDataStr = localStorage.getItem('checkout_result');
  const checkout = checkoutDataStr ? JSON.parse(checkoutDataStr) : null;
  
  const { data: assinatura } = useGetAssinatura();

  useEffect(() => {
    if (!checkout) {
      setLocation('/paywall');
    }
  }, [checkout, setLocation]);

  useEffect(() => {
    const timer = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getGetAssinaturaQueryKey() });
    }, 3000);
    return () => clearInterval(timer);
  }, [queryClient]);

  useEffect(() => {
    if (assinatura?.status === 'ativo') {
      toast({ title: 'Pagamento confirmado!', description: 'Você agora é PRO.' });
      setLocation('/');
    }
  }, [assinatura, setLocation, toast]);

  if (!checkout) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(checkout.pix_copia_cola);
    setCopied(true);
    toast({ title: 'Código PIX copiado' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background p-6">
        <div className="mb-6 flex items-center">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/paywall')} className="-ml-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold ml-2">Pagamento PIX</h1>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <p className="text-muted-foreground text-center mb-6">
            Escaneie o QR Code ou copie o código para pagar no app do seu banco.
          </p>

          <div className="bg-white p-4 rounded-2xl mb-8 w-64 h-64 flex items-center justify-center">
            <img src={`data:image/png;base64,${checkout.pix_qr_code}`} alt="QR Code PIX" className="w-full h-full object-contain" />
          </div>

          <div className="w-full bg-card border border-border rounded-xl p-4 mb-8">
            <p className="text-xs text-muted-foreground font-bold mb-2 uppercase tracking-wider">PIX Copia e Cola</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-background rounded-lg px-3 py-3 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-mono text-muted-foreground">
                {checkout.pix_copia_cola}
              </div>
              <Button size="icon" variant="secondary" onClick={handleCopy} className="h-auto shrink-0 bg-primary/20 text-primary hover:bg-primary/30 hover:text-primary border-0">
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground font-medium animate-pulse mt-auto pb-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            Aguardando confirmação...
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
