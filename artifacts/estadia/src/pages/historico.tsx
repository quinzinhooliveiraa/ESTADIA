import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout';
import { 
  useListEsperas, 
  useGetEsperasResumo, 
  useListCobrancas,
  useMarcarCobrancaPaga, 
  getListEsperasQueryKey, 
  getGetEsperasResumoQueryKey,
  getListCobrancasQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DollarSign, MapPin, Clock, ArrowRight, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Historico() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: esperasList, isLoading: loadingList } = useListEsperas();
  const { data: cobrancasList } = useListCobrancas();
  const { data: resumo, isLoading: loadingResumo } = useGetEsperasResumo();
  
  const marcarPaga = useMarcarCobrancaPaga();

  const cobrancasMap = useMemo(() => {
    const map = new Map();
    cobrancasList?.forEach(c => {
      map.set(c.espera_id, c);
    });
    return map;
  }, [cobrancasList]);

  const handleMarcarPaga = (cobrancaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    marcarPaga.mutate({ id: cobrancaId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEsperasQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListCobrancasQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEsperasResumoQueryKey() });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background p-4">
        <h1 className="text-2xl font-display text-primary mb-6">HISTÓRICO</h1>

        {loadingResumo ? (
           <div className="h-24 bg-card rounded-2xl animate-pulse mb-6" />
        ) : (
          <div className="bg-success/10 border border-success/30 rounded-2xl p-5 mb-8 text-center flex flex-col items-center justify-center relative overflow-hidden">
            <DollarSign className="absolute -right-4 -bottom-4 w-24 h-24 text-success/10" />
            <span className="text-sm font-bold text-success uppercase tracking-wider mb-1">Total Recuperado</span>
            <span className="text-4xl font-display text-success">
              {resumo?.total_recuperado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
        )}

        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 px-1">Suas estadias (diárias)</h2>

        {loadingList ? (
          <div className="flex-1 flex justify-center items-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : esperasList?.items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-center p-6">
            <Clock className="w-12 h-12 mb-4 opacity-20" />
            <p>Nenhum registro ainda. Aperta CHEGUEI quando chegar num pátio.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-6">
            {esperasList?.items.map(espera => {
              const cobranca = cobrancasMap.get(espera.id);
              const isEncerrada = espera.status === 'encerrada';
              
              return (
                <div 
                  key={espera.id}
                  onClick={() => setLocation(cobranca ? `/cobranca/${cobranca.id}` : `/espera/${espera.id}`)}
                  className="bg-card border border-card-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors relative"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-muted-foreground">
                        {format(new Date(espera.chegada_ts), "dd MMM, yyyy", { locale: ptBR })}
                      </span>
                      <span className="text-sm font-medium mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-primary shrink-0" />
                        <span className="truncate max-w-[150px]">{espera.chegada_endereco?.split('-')[0] || 'Endereço GPS'}</span>
                      </span>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {cobranca ? (
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${cobranca.status_pagamento === 'pago' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                          {cobranca.status_pagamento === 'pago' ? 'PAGO' : 'PENDENTE'}
                        </div>
                      ) : isEncerrada ? (
                        <div className="bg-secondary text-muted-foreground px-2 py-0.5 rounded text-[10px] font-bold">ENCERRADA</div>
                      ) : (
                        <div className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">ATIVA</div>
                      )}
                    </div>
                  </div>
                  
                  {cobranca && (
                    <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
                      <span className={`text-lg font-bold ${cobranca.status_pagamento === 'pago' ? 'text-success' : 'text-foreground'}`}>
                        {cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                      
                      {cobranca.status_pagamento === 'pendente' && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 text-xs font-bold border-success/50 text-success hover:bg-success hover:text-success-foreground z-10"
                          onClick={(e) => handleMarcarPaga(cobranca.id, e)}
                          disabled={marcarPaga.isPending}
                        >
                          {marcarPaga.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                          MARCAR PAGO
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
