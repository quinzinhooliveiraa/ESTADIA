import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useGetEspera,
  useEncerrarEspera,
  useUploadFoto,
  useGerarCobranca,
  useGetTarifaVigente,
  getGetEsperaQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ShieldCheck, MapPin, StopCircle, Receipt, ArrowLeft, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Espera() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: espera, isLoading } = useGetEspera(id, { query: { enabled: !!id, queryKey: getGetEsperaQueryKey(id) } });
  const { data: tarifa } = useGetTarifaVigente();

  const encerrar = useEncerrarEspera();
  const gerar = useGerarCobranca();
  const uploadFoto = useUploadFoto();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading || !espera) {
    return (
      <AppLayout showNav={false}>
        <div className="flex-1 flex items-center justify-center h-[100dvh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (espera.status === 'cobranca_gerada') {
    setLocation(`/cobranca/${espera.id}`);
    return null;
  }

  const chegadaTs = new Date(espera.chegada_ts).getTime();
  const isEncerrada = espera.status === 'encerrada';
  const endTime = isEncerrada && espera.saida_ts ? new Date(espera.saida_ts).getTime() : now;

  const diffMs = Math.max(0, endTime - chegadaTs);
  const diffHoras = diffMs / (1000 * 60 * 60);

  const horas = Math.floor(diffMs / (1000 * 60 * 60));
  const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const segundos = Math.floor((diffMs % (1000 * 60)) / 1000);

  const format2 = (n: number) => n.toString().padStart(2, '0');
  const isOverdue = diffHoras >= 5;
  const progressPercent = Math.min(100, (diffHoras / 5) * 100);

  const capacidade = espera.veiculo?.capacidade_ton || 0;
  const tarifaVigente = espera.tarifa_ton_hora || tarifa?.valor_ton_hora || 0;
  const currentValor = capacidade * tarifaVigente * diffHoras;

  const handleEncerrar = () => {
    encerrar.mutate({ id, data: { saida_ts: new Date().toISOString() } }, {
      onSuccess: () => {
        toast({ title: 'Espera encerrada' });
        queryClient.invalidateQueries({ queryKey: getGetEsperaQueryKey(id) });
      }
    });
  };

  const handleGerar = () => {
    gerar.mutate({ id, data: {} }, {
      onSuccess: () => {
        setLocation(`/cobranca/${id}`);
      },
      onError: (err: any) => {
        if (err?.status === 402) {
          const val = err?.data?.valor_em_jogo || currentValor;
          sessionStorage.setItem('paywall_valor', val.toString());
          setLocation(`/paywall`);
        } else {
          toast({ title: 'Erro ao gerar', description: 'Tente novamente', variant: 'destructive' });
        }
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      uploadFoto.mutate({ id, data: { foto_base64: base64, mime_type: file.type } }, {
        onSuccess: () => {
          toast({ title: 'Foto enviada com sucesso!' });
          queryClient.invalidateQueries({ queryKey: getGetEsperaQueryKey(id) });
        },
        onError: () => {
          toast({ title: 'Erro ao enviar foto', variant: 'destructive' });
        }
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background">
        <div className="p-4 flex items-center gap-3 border-b border-border/50">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/')} className="-ml-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              {isEncerrada ? 'ESPERA ENCERRADA' : 'ESPERA ATIVA'}
            </span>
            <span className="text-sm font-medium">
              Chegada: {format(new Date(espera.chegada_ts), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div className="bg-card border border-card-border rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 flex gap-2">
              <div className="bg-success/10 text-success px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> IMUTÁVEL
              </div>
            </div>

            <div className="flex items-start gap-3 mb-6 pr-24">
              <MapPin className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium leading-tight">
                  {espera.chegada_endereco || 'Buscando endereço...'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  GPS: {espera.chegada_lat?.toFixed(5)}, {espera.chegada_lng?.toFixed(5)}
                  {espera.chegada_precisao_m && ` (precisão ${Math.round(espera.chegada_precisao_m)}m)`}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center py-6">
              <div className="text-[72px] leading-none font-timer font-bold tracking-wider mb-4 tabular-nums">
                {format2(horas)}:{format2(minutos)}:{format2(segundos)}
              </div>

              <div className="w-full max-w-[240px] mb-2">
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${isOverdue ? 'bg-destructive' : 'bg-primary'}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {isOverdue ? (
                <div className="text-destructive text-sm font-bold animate-pulse">
                  PRAZO ESTOURADO — diária correndo
                </div>
              ) : (
                (() => {
                  const remainingMs = Math.max(0, 5 * 60 * 60 * 1000 - diffMs);
                  const remH = Math.floor(remainingMs / (1000 * 60 * 60));
                  const remM = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                  const remS = Math.floor((remainingMs % (1000 * 60)) / 1000);
                  return (
                    <div className="text-muted-foreground text-sm font-medium">
                      Prazo de 5h: <span className="font-timer">{format2(remH)}:{format2(remM)}:{format2(remS)}</span> restantes
                    </div>
                  );
                })()
              )}
            </div>

            {isOverdue && (
              <div className="border-t border-border pt-4 mt-2 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-2">
                <span className="text-xs text-muted-foreground font-bold uppercase mb-1">Valor que te devem</span>
                <span className="text-3xl font-display text-success">
                  {currentValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            )}
          </div>

          {/* B5: portaria tip */}
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/15 rounded-xl p-3">
            <FileText className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">📄 Peça o protocolo de entrada na portaria</span> — o embarcador é obrigado a fornecer. Guarda junto com o registro do app: duas provas valem mais que uma.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">Fotos de prova</h3>

            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {espera.fotos?.map((fotoUrl, i) => (
                <img key={i} src={fotoUrl} alt="Comprovante" className="w-20 h-20 rounded-xl object-cover border border-border shrink-0" />
              ))}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-xl border border-dashed border-muted-foreground bg-secondary flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary/80 transition-colors shrink-0"
                disabled={uploadFoto.isPending}
              >
                {uploadFoto.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin mb-1" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 mb-1" />
                    <span className="text-[10px] font-bold">FOTO</span>
                  </>
                )}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-card border-t border-border flex flex-col gap-3 shrink-0">
          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_rgba(255,196,0,0.3)]"
            disabled={!isOverdue || isEncerrada || gerar.isPending}
            onClick={handleGerar}
          >
            {gerar.isPending ? 'GERANDO...' : 'GERAR DOCUMENTO'}
            <Receipt className="ml-2 w-5 h-5" />
          </Button>

          {!isEncerrada && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground hover:text-destructive transition-colors"
              onClick={handleEncerrar}
              disabled={encerrar.isPending}
            >
              <StopCircle className="w-4 h-4 mr-2" />
              Encerrar sem cobrança
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
