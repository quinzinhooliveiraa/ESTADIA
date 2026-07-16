import React from 'react';
import { useLocation, useParams } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useGetCobranca, getGetCobrancaQueryKey } from '@workspace/api-client-react';
import { ArrowLeft, Send, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Cobranca() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: cobranca, isLoading } = useGetCobranca(id, { query: { enabled: !!id, queryKey: getGetCobrancaQueryKey(id) } });

  if (isLoading || !cobranca) {
    return (
      <AppLayout showNav={false}>
        <div className="flex-1 flex items-center justify-center h-[100dvh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const handleWhatsApp = () => {
    const text = `Notificação de Cobrança - Estadia\n\nPlaca: ${cobranca.espera?.veiculo?.placa}\nValor devido: ${cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\nVerifique a autenticidade deste documento em: ${cobranca.url_verificacao}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleDownload = () => {
    window.print();
    toast({ title: 'Imprimindo documento...' });
  };

  const chegada = new Date(cobranca.espera!.chegada_ts);
  const saida = cobranca.espera!.saida_ts ? new Date(cobranca.espera!.saida_ts) : new Date();
  
  const diffMs = saida.getTime() - chegada.getTime();
  const horasTotais = diffMs / (1000 * 60 * 60);

  return (
    <AppLayout showNav={false}>
      <div className="flex flex-col h-[100dvh] bg-background">
        <div className="p-4 flex items-center gap-3 border-b border-border/50 print:hidden shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/historico')} className="-ml-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="font-bold">Visualizar Cobrança</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center print:p-0 print:overflow-visible">
          {/* THE DOCUMENT */}
          <div className="bg-white text-black w-full max-w-[400px] p-6 rounded-md shadow-xl shrink-0 print:shadow-none print:max-w-none print:w-full print:m-0 print:p-0">
            <div className="border-b-2 border-black pb-4 mb-4 text-center">
              <h1 className="font-display text-xl uppercase tracking-tighter">NOTIFICAÇÃO DE COBRANÇA</h1>
              <h2 className="font-bold text-lg">ESTADIA</h2>
              <p className="text-[10px] mt-1 text-gray-600">Lei 13.103/2015, art. 11, §5º da Lei 11.442/07</p>
            </div>
            
            <div className="space-y-3 text-sm mb-6 font-medium">
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Documento Nº:</span>
                <span className="font-mono">{cobranca.id.slice(0,8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Placa:</span>
                <span>{cobranca.espera?.veiculo?.placa}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Capacidade:</span>
                <span>{cobranca.espera?.veiculo?.capacidade_ton} ton</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Chegada:</span>
                <span>{format(chegada, "dd/MM/yyyy HH:mm")}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Saída:</span>
                <span>{cobranca.espera?.saida_ts ? format(saida, "dd/MM/yyyy HH:mm") : '-'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Tempo Total:</span>
                <span>{horasTotais.toFixed(1)}h</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Tarifa Vigente:</span>
                <span>{cobranca.espera?.tarifa_ton_hora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/ton/h</span>
              </div>
            </div>

            <div className="bg-gray-100 p-4 rounded mb-6 text-center">
              <p className="text-xs text-gray-500 uppercase font-bold mb-1">VALOR DEVIDO</p>
              <p className="text-3xl font-display text-green-700">
                {cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>

            <div className="text-[10px] text-justify text-gray-600 mb-6 leading-relaxed">
              O tempo máximo para carga e descarga é de 5 (cinco) horas contadas da chegada do veículo ao endereço de destino.
              Ultrapassado este prazo, será devido ao TAC ou ETC o valor de {cobranca.espera?.tarifa_ton_hora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por tonelada/hora ou fração.
            </div>

            {cobranca.espera?.fotos && cobranca.espera.fotos.length > 0 && (
              <div className="flex flex-col items-center gap-2 pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500 font-bold mb-2">Comprovantes anexos:</div>
                <div className="flex gap-2 justify-center flex-wrap">
                  {cobranca.espera.fotos.map((f, i) => (
                    <img key={i} src={f} className="w-16 h-16 object-cover border border-gray-300" alt="Foto" />
                  ))}
                </div>
              </div>
            )}
            
            <div className="mt-8 pt-4 border-t border-dashed border-gray-400 flex flex-col items-center">
                <div className="text-[9px] text-gray-400 text-center mb-2">Verifique a autenticidade no site:</div>
                <div className="text-xs font-mono text-center font-bold break-all w-full">{cobranca.url_verificacao}</div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-card border-t border-border flex gap-3 print:hidden shrink-0">
          <Button 
            className="flex-1 h-14 bg-green-600 hover:bg-green-700 text-white font-bold text-sm shadow-[0_0_20px_-5px_rgba(39,196,107,0.4)] border-0"
            onClick={handleWhatsApp}
          >
            <Send className="w-4 h-4 mr-2" />
            WhatsApp
          </Button>
          <Button 
            variant="outline"
            className="flex-1 h-14 font-bold text-sm"
            onClick={handleDownload}
          >
            <Download className="w-4 h-4 mr-2" />
            Baixar PDF
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
