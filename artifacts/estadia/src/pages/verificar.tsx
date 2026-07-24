import React from 'react';
import { useParams } from 'wouter';
import { useVerificarCobranca, getVerificarCobrancaQueryKey } from '@workspace/api-client-react';
import { ShieldCheck, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Verificar() {
  const { token } = useParams<{ token: string }>();
  
  const { data: cobranca, isLoading, error } = useVerificarCobranca(token, { 
    query: { enabled: !!token, queryKey: getVerificarCobrancaQueryKey(token) } 
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-primary">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <p className="font-bold animate-pulse">Verificando autenticidade...</p>
      </div>
    );
  }

  if (error || !cobranca) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-destructive/20 rounded-full flex items-center justify-center mb-6">
          <ShieldCheck className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-display text-destructive mb-2 uppercase">Documento Inválido</h1>
        <p className="text-muted-foreground">Este documento não foi encontrado ou foi adulterado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center p-6 text-center">
      <div className="w-full max-w-md pt-12">
        <div className="flex justify-center mb-6">
          <div className="w-24 h-24 bg-success/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-success" />
          </div>
        </div>
        
        <h1 className="text-2xl font-display text-success mb-2 uppercase tracking-tight">Registro Autêntico</h1>
        <p className="text-sm text-success/80 font-bold px-4 mb-8">
          Este documento foi registrado na blockchain e não pode ser alterado.
        </p>

        <div className="bg-card border border-border rounded-2xl p-6 text-left shadow-lg">
          <div className="space-y-4 font-medium text-sm">
            <div>
              <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1">Motorista</span>
              <span className="text-lg font-bold">{cobranca.motorista_nome}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div>
                <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1">Veículo</span>
                <span>{cobranca.capacidade_ton} ton</span>
              </div>
              <div>
                <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1">Tarifa Legal</span>
                <span>{cobranca.tarifa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/h</span>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1">Tempo de Espera</span>
              <div className="flex flex-col gap-1">
                <span>Chegada: {format(new Date(cobranca.chegada_ts), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                <span>Saída: {cobranca.saida_ts ? format(new Date(cobranca.saida_ts), "dd/MM/yyyy HH:mm", { locale: ptBR }) : 'Em andamento'}</span>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Localização GPS
              </span>
              <span className="text-xs text-muted-foreground">{cobranca.local}</span>
              <span className="block mt-1 font-mono text-xs opacity-70">
                Lat: {cobranca.lat?.toFixed(6)} | Lng: {cobranca.lng?.toFixed(6)}
              </span>
            </div>

            <div className="border-t border-border pt-4 mt-2">
              <span className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1">Valor Devido</span>
              <span className="text-3xl font-display text-primary">
                {cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>
        </div>
        
        <div className="mt-8 opacity-60">
          <img src="/logo-light.png" alt="ESTADIA" className="h-8" />
        </div>
      </div>
    </div>
  );
}
