import Link from 'next/link'
import { ArrowLeft, MessageCircle, Mail, BookOpen } from 'lucide-react'
import { ChatButton } from './client'

export const metadata = { title: 'Ajuda — Smart ERP' }

const FAQ = [
  {
    q: 'Como começar a usar o sistema?',
    a: 'Cadastre seus produtos em Estoque → Adicionar produto. Depois abra a Frente de Caixa, abra o caixa com o valor inicial, e comece a vender. Cada venda gera comprovante em PDF e atualiza estoque automaticamente.',
  },
  {
    q: 'Como cadastrar produtos em massa?',
    a: 'Em Estoque, importe via CSV. Use o formato do Bling (você baixa o template lá) ou monte seu próprio CSV com colunas nome, código, preço, custo, estoque. Tem botão "Importar" no topo.',
  },
  {
    q: 'Como funciona a meta mensal?',
    a: 'Em Configurações → Lojas, defina a meta mensal por loja. Em Relatórios, você vê o progresso em tempo real (vendas do mês ÷ meta) com cores indicando se tá no ritmo.',
  },
  {
    q: 'Como abrir e fechar o caixa?',
    a: 'No POS, clique "Abrir caixa" e informe o valor inicial em dinheiro. No fim do dia, clique "Fechar caixa" pra ver o relatório. Caixa abandonado fecha automático às 23:59.',
  },
  {
    q: 'O sistema emite NF-e?',
    a: 'NFC-e (cupom fiscal varejo) tá funcional via Focus NFe. NF-e padrão (regime Lucro Real) ainda não — em desenvolvimento. Configure em /configuracoes/fiscal com seu certificado A1.',
  },
  {
    q: 'Como funciona o comando de voz "Smart"?',
    a: 'Ative o ouvido no canto inferior direito do dashboard. Aceita permissão de microfone. Aí fala "Smart, vendi um iPhone..." e ele lança a venda automaticamente. Funciona com aba do SmartERP em foco.',
  },
  {
    q: 'Tenho mais de uma loja, como separar?',
    a: 'Configurações → Lojas → Adicionar loja. Vendas, despesas e caixas ficam separados por loja, mas produtos e clientes são compartilhados. Selecione a loja ativa no topo do dashboard.',
  },
  {
    q: 'Como cancelar minha assinatura?',
    a: 'Configurações → Assinatura → Cancelar. Você continua com acesso até o fim do período pago. Sem multa, sem fidelidade.',
  },
]

export default function AjudaPage() {
  const supportEmail = 'suporte@gestaosmarterp.online'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold" style={{ color: '#F8FAFC' }}>Central de Ajuda</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ChatButton />
        <a href={`mailto:${supportEmail}`}
          className="rounded-xl border p-3 hover:border-emerald-500/40 transition-colors"
          style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
          <Mail className="h-5 w-5 mb-2" style={{ color: '#10B981' }} />
          <p className="text-sm font-semibold mb-0.5" style={{ color: '#F8FAFC' }}>Email</p>
          <p className="text-[11px] break-all" style={{ color: '#94A3B8' }}>{supportEmail}</p>
        </a>
        <div className="rounded-xl border p-3 opacity-60"
          style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
          <BookOpen className="h-5 w-5 mb-2" style={{ color: '#475569' }} />
          <p className="text-sm font-semibold mb-0.5" style={{ color: '#64748B' }}>Documentação</p>
          <p className="text-[11px]" style={{ color: '#94A3B8' }}>Em breve</p>
        </div>
      </div>

      <h2 className="text-sm font-semibold mb-3" style={{ color: '#F8FAFC' }}>
        Perguntas frequentes
      </h2>
      <div className="space-y-2">
        {FAQ.map((item, i) => (
          <details key={i} className="rounded-xl border p-3 group"
            style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
            <summary className="cursor-pointer text-sm font-medium hover:opacity-80 list-none flex items-center justify-between"
              style={{ color: '#F8FAFC' }}>
              <span>{item.q}</span>
              <span className="text-zinc-500 group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="mt-2.5 pt-2.5 border-t text-sm leading-relaxed"
              style={{ color: '#CBD5E1', borderColor: 'rgba(255,255,255,.05)' }}>
              {item.a}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-8 rounded-xl border p-4 text-center text-sm"
        style={{ background: 'rgba(16,185,129,.05)', borderColor: 'rgba(16,185,129,.2)', color: '#86EFAC' }}>
        Não encontrou? Mande email para{' '}
        <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a>
      </div>
    </div>
  )
}
