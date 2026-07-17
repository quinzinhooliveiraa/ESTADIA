import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function Termos() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="sticky top-0 bg-background/90 backdrop-blur border-b border-border/50 p-4 flex items-center gap-3 z-10">
        <Button variant="ghost" size="icon" onClick={() => history.length > 1 ? history.back() : setLocation('/')} className="-ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-bold">Termos de Uso</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div>
          <p className="text-xs text-muted-foreground/60 mb-6">Versão 2026-07 · Vigente a partir de julho de 2026</p>
          <p>
            Bem-vindo à <strong className="text-foreground">ESTADIA</strong>. Leia estes Termos com atenção antes de usar o aplicativo.
            Ao criar uma conta ou utilizar qualquer funcionalidade, você concorda integralmente com estas condições.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">1. O que o ESTADIA faz</h2>
          <p>
            O ESTADIA é uma plataforma que permite ao motorista autônomo (TAC) ou transportador (ETC) <strong className="text-foreground">documentar o horário e o local de chegada</strong> a um ponto de carga ou descarga, calcular automaticamente o tempo de espera e gerar documentos de cobrança de estadia com base na <strong className="text-foreground">Lei 13.103/2015</strong> e no art. 11, §5º da Lei 11.442/2007.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">2. O que o ESTADIA NÃO faz</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Não garantimos o recebimento da estadia — o documento gerado é um elemento de prova, não uma sentença judicial.</li>
            <li>Não prestamos assessoria jurídica. Consulte um advogado para casos específicos.</li>
            <li>Os registros georreferenciados têm valor probatório, mas sem garantia de resultado em disputas.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">3. Planos e preços</h2>
          <p>
            O ESTADIA oferece um <strong className="text-foreground">Plano Grátis</strong> (até 1 cobrança por mês) e o <strong className="text-foreground">Plano PRO</strong> (cobranças ilimitadas), disponível nas modalidades mensal (R$ 19,90/mês) e anual (R$ 199,00/ano).
          </p>
          <p>
            O PRO é renovado automaticamente ao fim de cada período. Você será informado antes de qualquer cobrança recorrente e pode cancelar a qualquer momento.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">4. Cancelamento e reembolso</h2>
          <p>
            Você pode cancelar sua assinatura a qualquer momento pelo Perfil. Ao cancelar, o acesso PRO permanece ativo até o fim do período já pago — não há cobrança adicional.
          </p>
          <p>
            Nos termos do <strong className="text-foreground">art. 49 do Código de Defesa do Consumidor</strong>, você tem direito ao arrependimento e reembolso integral em até <strong className="text-foreground">7 dias corridos</strong> após a primeira assinatura, sem necessidade de justificativa. Entre em contato pelo e-mail abaixo.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">5. Responsabilidades do usuário</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Fornecer dados verdadeiros (telefone, placa, capacidade do veículo).</li>
            <li>Não utilizar o aplicativo para gerar documentos falsos ou fraudulentos.</li>
            <li>Manter o celular com localização ativa no momento do registro de chegada.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">6. Foro e contato</h2>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Qualquer controvérsia será resolvida no foro da comarca de São Paulo/SP.
          </p>
          <p>
            Dúvidas, cancelamentos ou pedidos de reembolso: <strong className="text-foreground">contato@estadia.app</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
