import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = { title: 'Regras do programa de afiliados — Gestão Smart' }

export default function TermosAfiliadoPage() {
  return (
    <div className="min-h-screen px-4 py-10 md:py-16" style={{ background: '#0F172A' }}>
      <div className="max-w-2xl mx-auto">
        <Link href="/seja-afiliado"
          className="inline-flex items-center gap-1.5 text-xs hover:underline mb-4"
          style={{ color: '#94A3B8' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>

        <h1 className="text-2xl font-bold mb-6" style={{ color: '#F8FAFC' }}>
          Regras do Programa de Afiliados
        </h1>

        <div className="space-y-5 text-sm leading-relaxed" style={{ color: '#CBD5E1' }}>
          <Section title="1. Comissões">
            <p>Você recebe <strong>40%</strong> sobre o valor do <strong>primeiro pagamento</strong> de
              cada cliente que assinar o Gestão Smart pelo seu link de afiliado.</p>
            <p>Nos meses seguintes, você recebe uma <strong>comissão recorrente</strong> sobre cada
              pagamento mensal do mesmo cliente, enquanto a assinatura permanecer ativa.</p>
          </Section>

          <Section title="2. Atribuição">
            <p>A indicação é registrada via cookie no navegador do lead, válido por <strong>60 dias</strong>
              a partir do clique no seu link.</p>
            <p>Caso o lead chegue por mais de um afiliado, vale o <strong>último clique</strong> antes
              do cadastro.</p>
          </Section>

          <Section title="3. Hold de 30 dias">
            <p>Toda comissão fica em status &quot;pendente&quot; por <strong>30 dias</strong> após a venda.
              Esse prazo serve pra cobrir cancelamentos, estornos e fraudes.</p>
            <p>Após esse período, a comissão vira &quot;a pagar&quot; automaticamente.</p>
          </Section>

          <Section title="4. Pagamento">
            <p>Pagamentos são feitos via <strong>PIX</strong>, no <strong>dia 5 de cada mês</strong>,
              referente ao saldo &quot;a pagar&quot; até o último dia do mês anterior.</p>
            <p>Pagamento mínimo de <strong>R$ 30,00</strong>. Saldo abaixo disso acumula pro mês seguinte.</p>
          </Section>

          <Section title="5. Conduta proibida">
            <p>É proibido:</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>Auto-indicação (cadastrar a si mesmo com seu próprio link)</li>
              <li>Spam (envio massivo não solicitado)</li>
              <li>Anúncios pagos usando a marca &quot;Gestão Smart&quot; sem autorização</li>
              <li>Tráfego incentivado (oferecer dinheiro/produtos pelo cadastro)</li>
              <li>Fingir ser representante oficial do Gestão Smart</li>
            </ul>
            <p className="mt-2">Violações resultam em <strong>banimento da conta</strong> e
              perda de comissões pendentes.</p>
          </Section>

          <Section title="6. Anti-fraude automática">
            <p>O sistema identifica automaticamente padrões suspeitos:</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>Mesmo email/CPF/WhatsApp do afiliado no cadastro do indicado</li>
              <li>Múltiplas conversões do mesmo IP em 24h</li>
              <li>Volume anormal de conversões nos primeiros dias da conta</li>
            </ul>
            <p className="mt-2">Conversões suspeitas ficam em revisão manual antes de gerar comissão.</p>
          </Section>

          <Section title="7. Encerramento">
            <p>Você pode encerrar sua conta a qualquer momento. O Gestão Smart também pode encerrar
              o programa ou mudar as regras com aviso prévio de 30 dias.</p>
            <p>Comissões já pagas não são revertidas. Comissões pendentes seguem o cronograma normal.</p>
          </Section>

          <p className="text-xs pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,.08)', color: '#94A3B8' }}>
            Atualizado em {new Date().toLocaleDateString('pt-BR')}.
            Dúvidas: <a href="mailto:contato@gestaosmarterp.online" className="underline" style={{ color: '#10B981' }}>contato@gestaosmarterp.online</a>
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold mb-2" style={{ color: '#F8FAFC' }}>{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}
