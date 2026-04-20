import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { Receipt, TrendingUp, ShoppingCart, CreditCard } from 'lucide-react'

export const metadata = { title: 'Financeiro — Smart ERP' }

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', card: 'Cartão', mixed: 'Misto',
}

const METHOD_COLOR: Record<string, string> = {
  cash: '#00FF94', pix: '#00E5FF', card: '#FFB800', mixed: '#FF5C5C',
}

export default async function FinanceiroPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const { supabase, user } = auth
  const tenantId = getTenantId(user)

  const { data: sales } = await supabase
    .from('sales')
    .select(`
      id, total_cents, subtotal_cents, discount_cents, shipping_cents,
      payment_method, payment_details, status, created_at,
      customers ( full_name, cpf_cnpj ),
      sale_items ( name, quantity, unit_price_cents )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = (sales ?? []) as unknown as {
    id: string
    total_cents: number
    subtotal_cents: number
    discount_cents: number
    shipping_cents: number
    payment_method: string
    status: string
    created_at: string
    customers: { full_name: string; cpf_cnpj: string | null } | null
    sale_items: { name: string; quantity: number; unit_price_cents: number }[]
  }[]

  const totalFaturado = rows.reduce((s, r) => s + r.total_cents, 0)
  const totalVendas   = rows.length
  const ticketMedio   = totalVendas > 0 ? Math.round(totalFaturado / totalVendas) : 0
  const totalDesconto = rows.reduce((s, r) => s + (r.discount_cents ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Financeiro</h1>
        <p className="mt-1 text-sm text-muted">Histórico de vendas do Frente de Caixa</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: 'Total Faturado',  value: BRL(totalFaturado), icon: TrendingUp,   color: '#00FF94' },
          { label: 'Vendas Realizadas', value: String(totalVendas),  icon: ShoppingCart, color: '#00E5FF' },
          { label: 'Ticket Médio',    value: BRL(ticketMedio),   icon: CreditCard,   color: '#FFB800' },
          { label: 'Total Descontos', value: BRL(totalDesconto), icon: Receipt,      color: '#FF5C5C' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border p-5" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
                <p className="mt-2 text-xl font-bold text-text">{value}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sales table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-sm font-semibold text-text">Vendas Realizadas</h2>
          <span className="text-xs text-muted">{totalVendas} {totalVendas === 1 ? 'venda' : 'vendas'}</span>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Receipt className="h-10 w-10" style={{ color: '#1E2D45' }} />
            <p className="text-sm text-muted">Nenhuma venda registrada ainda</p>
            <p className="text-xs" style={{ color: '#1E2D45' }}>As vendas feitas no Frente de Caixa aparecerão aqui</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="grid gap-4 px-5 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
              style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 160px 120px 100px 100px' }}
            >
              <span>Cliente / Itens</span>
              <span>Data</span>
              <span>Pagamento</span>
              <span className="text-right">Desconto</span>
              <span className="text-right">Total</span>
            </div>

            {rows.map(sale => {
              const date = new Date(sale.created_at).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })
              const color = METHOD_COLOR[sale.payment_method] ?? '#64748B'
              const itemsSummary = sale.sale_items
                .map(i => `${i.quantity}× ${i.name}`)
                .join(', ')

              return (
                <div
                  key={sale.id}
                  className="grid gap-4 px-5 py-3.5 border-b items-center"
                  style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 160px 120px 100px 100px' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      {sale.customers?.full_name ?? 'Sem cliente'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted truncate">{itemsSummary}</p>
                  </div>
                  <p className="text-xs text-muted">{date}</p>
                  <span
                    className="inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-semibold"
                    style={{ background: `${color}18`, color }}
                  >
                    {METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
                  </span>
                  <p className="text-sm text-right" style={{ color: sale.discount_cents > 0 ? '#FF5C5C' : '#64748B' }}>
                    {sale.discount_cents > 0 ? `- ${BRL(sale.discount_cents)}` : '—'}
                  </p>
                  <p className="text-sm font-bold text-right text-green">{BRL(sale.total_cents)}</p>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
