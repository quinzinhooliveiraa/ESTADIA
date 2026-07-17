import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function Privacidade() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="sticky top-0 bg-background/90 backdrop-blur border-b border-border/50 p-4 flex items-center gap-3 z-10">
        <Button variant="ghost" size="icon" onClick={() => history.length > 1 ? history.back() : setLocation('/')} className="-ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-bold">Política de Privacidade</h1>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div>
          <p className="text-xs text-muted-foreground/60 mb-6">Versão 2026-07 · Vigente a partir de julho de 2026</p>
          <p>
            A <strong className="text-foreground">ESTADIA</strong> respeita sua privacidade e cumpre integralmente a <strong className="text-foreground">Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)</strong>. Esta Política explica quais dados coletamos, por que e como são usados.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">1. Dados que coletamos</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Telefone celular</strong> — usado para autenticação via OTP.</li>
            <li><strong className="text-foreground">Nome</strong> — opcional, informado pelo usuário no perfil.</li>
            <li><strong className="text-foreground">Dados do veículo</strong> — placa e capacidade em toneladas.</li>
            <li><strong className="text-foreground">Localização (GPS)</strong> — capturada <em>somente no momento do CHEGUEI</em>, nunca em segundo plano.</li>
            <li><strong className="text-foreground">Fotos</strong> — anexadas voluntariamente como comprovante de chegada.</li>
            <li><strong className="text-foreground">Dados de pagamento</strong> — processados pelo gateway AbacatePay; não armazenamos números de cartão.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">2. Para que usamos os dados</h2>
          <p>
            Os dados são usados exclusivamente para <strong className="text-foreground">gerar o registro probatório de chegada</strong> e os documentos de cobrança de estadia. Não vendemos nem compartilhamos seus dados com terceiros para fins publicitários.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">3. Base legal</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Execução de contrato</strong> (LGPD, art. 7º, V) — para a prestação do serviço de documentação e geração de cobranças.</li>
            <li><strong className="text-foreground">Consentimento</strong> (LGPD, art. 7º, I) — para o acesso à localização GPS no momento do registro.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">4. Compartilhamento</h2>
          <p>
            O documento de cobrança gerado <strong className="text-foreground">só é enviado a terceiros pelo próprio usuário</strong> (ex.: via WhatsApp para o embarcador). Não transmitimos documentos a ninguém sem ação explícita do motorista.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">5. Retenção de dados</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Dados da conta</strong> — mantidos enquanto a conta estiver ativa. Ao excluir a conta, esperas, fotos, veículos e histórico são apagados.</li>
            <li><strong className="text-foreground">Registros financeiros (assinaturas e pagamentos)</strong> — retidos por <strong className="text-foreground">5 anos</strong> após o encerramento da conta, conforme obrigação legal (Lei 9.613/1998 e Código Tributário Nacional). Os dados ficam anonimizados — sem nome ou telefone original.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">6. Seus direitos (LGPD)</h2>
          <p>Você tem direito a:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Acesso</strong> — ver todos os dados que temos sobre você (Perfil → Exportar meus dados).</li>
            <li><strong className="text-foreground">Portabilidade</strong> — exportar seus dados em formato estruturado (JSON).</li>
            <li><strong className="text-foreground">Exclusão</strong> — encerrar a conta e anonimizar seus dados (Perfil → Excluir minha conta).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">7. Controlador dos dados</h2>
          <p>
            Responsável pelo tratamento dos dados pessoais: <strong className="text-foreground">ESTADIA TECNOLOGIA LTDA</strong><br />
            Contato do encarregado (DPO): <strong className="text-foreground">privacidade@estadia.app</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
