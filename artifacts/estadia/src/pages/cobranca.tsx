import React from 'react';
import { useLocation, useParams } from 'wouter';
import { AppLayout } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useGetCobranca, useGetTarifaVigente, getGetCobrancaQueryKey } from '@workspace/api-client-react';
import { ArrowLeft, Send, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Cobranca() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: cobranca, isLoading } = useGetCobranca(id, { query: { enabled: !!id, queryKey: getGetCobrancaQueryKey(id) } });
  const { data: tarifa } = useGetTarifaVigente();

  if (isLoading || !cobranca) {
    return (
      <AppLayout showNav={false}>
        <div className="flex-1 flex items-center justify-center h-[100dvh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const chegada = new Date(cobranca.espera!.chegada_ts);
  const saida = cobranca.espera!.saida_ts ? new Date(cobranca.espera!.saida_ts) : new Date();
  const diffMs = saida.getTime() - chegada.getTime();
  const horasTotais = diffMs / (1000 * 60 * 60);
  const horasInt = Math.floor(horasTotais);
  const minutosInt = Math.floor((horasTotais - horasInt) * 60);

  // B4: tariff date
  const tarifaData = tarifa?.vigente_desde
    ? format(new Date(tarifa.vigente_desde), "dd/MM/yyyy")
    : null;

  // B3: identification footer text
  const rodapeTexto = `Documento gerado eletronicamente pelo transportador por meio da plataforma ESTADIA, com registro georreferenciado de chegada. Verifique a autenticidade em ${cobranca.url_verificacao}`;

  // Guard: require motorista name before generating any document
  const guardNome = (): boolean => {
    if (!cobranca.motorista_nome) {
      toast({
        title: 'Informe seu nome antes de continuar',
        description: 'Acesse seu Perfil, preencha o nome completo e volte aqui.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  // D2: complete WhatsApp message
  const handleWhatsApp = () => {
    if (!guardNome()) return;
    const placa = cobranca.espera?.veiculo?.placa || '-';
    const capacidade = cobranca.espera?.veiculo?.capacidade_ton ?? '-';
    const tarifaVal = cobranca.espera?.tarifa_ton_hora ?? 0;
    const tempoStr = `${horasInt}h ${minutosInt}min`;
    const valorStr = cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const tarifaStr = tarifaVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const text = [
      `NOTIFICAÇÃO DE COBRANÇA — ESTADIA (Lei 13.103/15)`,
      ``,
      `Veículo: ${placa} (${capacidade} ton)`,
      `Chegada: ${format(chegada, "dd/MM/yyyy 'às' HH:mm")} (registro GPS)`,
      `Tempo total de espera: ${tempoStr}`,
      `Cálculo: ${capacidade} × ${tarifaStr}/ton/h × ${horasTotais.toFixed(2)}h`,
      `VALOR DEVIDO: ${valorStr}`,
      ``,
      `Documento e verificação de autenticidade:`,
      cobranca.url_verificacao,
    ].join('\n');

    // Bug 3 / PWA: window.open with _blank is blocked in standalone mode.
    // Detect standalone and navigate in the same window instead.
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (isStandalone) {
      window.location.href = waUrl;
    } else {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // D1: generate PDF with jsPDF + QR code
  // Bug 3: use Web Share API in PWA standalone (doc.save triggers a download
  // dialog that is suppressed in standalone mode on iOS/Android).
  const handleDownload = async () => {
    if (!guardNome()) return;
    try {
      const { jsPDF } = await import('jspdf');
      const QRCode = await import('qrcode');

      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = 210;
      const margin = 18;
      const cw = pageW - 2 * margin;
      let y = 18;

      // ── Header ──────────────────────────────────────────────────────────────
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('NOTIFICAÇÃO DE COBRANÇA — ESTADIA', pageW / 2, y, { align: 'center' });
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Lei 13.103/2015, art. 11, §5º da Lei 11.442/07', pageW / 2, y, { align: 'center' });
      y += 3;
      doc.setDrawColor(0, 0, 0);
      doc.line(margin, y, pageW - margin, y);
      y += 7;

      // ── Data rows ───────────────────────────────────────────────────────────
      const rows: [string, string][] = [
        ['Documento Nº', cobranca.id.slice(0, 8).toUpperCase()],
        ['Motorista', cobranca.motorista_nome || '-'],
        ['Placa', cobranca.espera?.veiculo?.placa || '-'],
        ['Capacidade', `${cobranca.espera?.veiculo?.capacidade_ton ?? '-'} ton`],
        ['Chegada', format(chegada, "dd/MM/yyyy HH:mm")],
        ['Saída', cobranca.espera?.saida_ts ? format(saida, "dd/MM/yyyy HH:mm") : '-'],
        ['Tempo Total', `${horasInt}h ${minutosInt}min`],
        [
          'Tarifa Vigente',
          tarifaData
            ? `${(cobranca.espera?.tarifa_ton_hora ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/ton/h — vigente em ${tarifaData} · Lei 13.103/2015, reajuste anual pelo INPC`
            : `${(cobranca.espera?.tarifa_ton_hora ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/ton/h`,
        ],
      ];

      for (const [label, value] of rows) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(label + ':', margin, y);
        doc.setFont('helvetica', 'normal');
        const splitVal = doc.splitTextToSize(value, cw - 42);
        doc.text(splitVal, margin + 42, y);
        y += splitVal.length * 5 + 1;
        doc.setDrawColor(210, 210, 210);
        doc.line(margin, y, pageW - margin, y);
        y += 4;
      }

      y += 3;

      // ── Valor em destaque ────────────────────────────────────────────────────
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(margin, y, cw, 20, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(80, 80, 80);
      doc.text('VALOR DEVIDO', pageW / 2, y + 7, { align: 'center' });
      doc.setFontSize(20);
      doc.setTextColor(20, 120, 50);
      doc.text(
        cobranca.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        pageW / 2, y + 16, { align: 'center' }
      );
      doc.setTextColor(0, 0, 0);
      y += 26;

      // ── Legal text ───────────────────────────────────────────────────────────
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const legalText = `O tempo máximo para carga e descarga é de 5 (cinco) horas contadas da chegada do veículo ao endereço de destino. Ultrapassado este prazo, será devido ao TAC ou ETC o valor de ${(cobranca.espera?.tarifa_ton_hora ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por tonelada/hora ou fração.`;
      const splitLegal = doc.splitTextToSize(legalText, cw);
      doc.text(splitLegal, margin, y);
      y += splitLegal.length * 4 + 6;

      // ── Photo thumbnails ─────────────────────────────────────────────────────
      if (cobranca.espera?.fotos && cobranca.espera.fotos.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Comprovantes anexos:', margin, y);
        y += 5;
        const thumbSize = 36;
        const thumbGap = 4;
        for (let i = 0; i < Math.min(cobranca.espera.fotos.length, 4); i++) {
          try {
            const mimeMatch = cobranca.espera.fotos[i].match(/^data:(image\/\w+);/);
            const fmt = mimeMatch?.[1] === 'image/png' ? 'PNG' : 'JPEG';
            doc.addImage(cobranca.espera.fotos[i], fmt, margin + i * (thumbSize + thumbGap), y, thumbSize, thumbSize);
          } catch { /* skip bad image */ }
        }
        y += thumbSize + 6;
      }

      // ── QR Code + verification ───────────────────────────────────────────────
      try {
        const verUrl = cobranca.url_verificacao ?? '';
        // Force the string→Promise<string> overload explicitly
        const toDataURL = QRCode.toDataURL as (text: string, opts?: Record<string, unknown>) => Promise<string>;
        const qrDataUrl = await toDataURL(verUrl, { width: 150, margin: 1 });
        const qrSize = 32;
        doc.addImage(qrDataUrl, 'PNG', margin, y, qrSize, qrSize);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('Escaneie para verificar\nautenticidade', margin, y + qrSize + 4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        const urlLines = doc.splitTextToSize(verUrl, cw - qrSize - 8);
        doc.text(urlLines, margin + qrSize + 5, y + 10);
      } catch { /* skip qr on error */ }

      // ── B3: footer de identificação ──────────────────────────────────────────
      const footerY = 278;
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, footerY - 3, pageW - margin, footerY - 3);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      const splitFooter = doc.splitTextToSize(rodapeTexto, cw);
      doc.text(splitFooter, margin, footerY);

      const dateStr = format(new Date(), 'ddMMyyyy');
      const fileName = `cobranca-estadia-${dateStr}.pdf`;
      const pdfBlob = doc.output('blob');

      // Try Web Share API first (works in PWA standalone on iOS/Android)
      if (
        navigator.canShare &&
        navigator.canShare({ files: [new File([pdfBlob], fileName, { type: 'application/pdf' })] })
      ) {
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        await navigator.share({ files: [file], title: 'Cobrança ESTADIA' });
        toast({ title: 'PDF compartilhado com sucesso!' });
      } else {
        // Fallback: standard browser download
        doc.save(fileName);
        toast({ title: 'PDF gerado com sucesso!' });
      }
    } catch (err: any) {
      // navigator.share throws AbortError if user dismisses — treat as success
      if (err?.name === 'AbortError') return;
      console.error('PDF generation error:', err);
      toast({ title: 'Erro ao gerar PDF', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

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
                <span className="text-gray-500">Motorista:</span>
                <span>{cobranca.motorista_nome || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-1">
                <span className="text-gray-500">Placa:</span>
                <span>{cobranca.espera?.veiculo?.placa || '-'}</span>
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
                <span>{horasInt}h {minutosInt}min</span>
              </div>
              {/* B4: tariff date */}
              <div className="flex flex-col border-b border-gray-200 pb-1 gap-0.5">
                <span className="text-gray-500">Tarifa Vigente:</span>
                <span className="text-right text-[11px]">
                  {(cobranca.espera?.tarifa_ton_hora ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/ton/h
                  {tarifaData && (
                    <> · vigente em {tarifaData}<br />
                    <span className="text-gray-400">Lei 13.103/2015, reajuste anual pelo INPC</span></>
                  )}
                </span>
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
              Ultrapassado este prazo, será devido ao TAC ou ETC o valor de {(cobranca.espera?.tarifa_ton_hora ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por tonelada/hora ou fração.
            </div>

            {cobranca.espera?.fotos && cobranca.espera.fotos.length > 0 && (
              <div className="flex flex-col items-center gap-2 pt-4 border-t border-gray-200 mb-4">
                <div className="text-xs text-gray-500 font-bold mb-2">Comprovantes anexos:</div>
                <div className="flex gap-2 justify-center flex-wrap">
                  {cobranca.espera.fotos.map((f, i) => (
                    <img key={i} src={f} className="w-16 h-16 object-cover border border-gray-300" alt="Foto" />
                  ))}
                </div>
              </div>
            )}

            {/* B3: identification footer */}
            <div className="mt-6 pt-4 border-t border-dashed border-gray-400">
              <div className="text-[9px] text-gray-400 text-center leading-tight">
                {rodapeTexto}
              </div>
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
