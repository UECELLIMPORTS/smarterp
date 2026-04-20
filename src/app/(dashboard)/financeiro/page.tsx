import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { Receipt, TrendingUp, ShoppingCart, CreditCard, Wrench } from 'lucide-react'

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

  const [salesRes, ordersRes] = await Promise.all([
    supabase
      .from('sales')
      .select(`
        id, total_cents, subtotal_cents, discount_cents, shipping_cents,
        payment_method, status, created_at,
        customers ( full_name, cpf_cnpj ),
        sale_items ( name, quantity, unit_price_cents )
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(150),

    supabase
      .from('service_orders')
      .select(`
        id, total_price_cents, discount_cents, status, received_at,
        customers ( full_name, cpf_cnpj )
      `)
      .eq('tenant_id', tenantId)
      .order('received_at', { ascending: false })
      .limit(150),
  ])

  type SaleRow = {
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
  }

  type OrderRow = {
    id: string
    total_price_cents: number
    discount_cents: number
    status: string
    received_at: string
    customers: { full_name: string; cpf_cnpj: string | null } | null
  }

  const sales  = (salesRes.data  ?? []) as unknown as SaleRow[]
  const orders = (ordersRes.data ?? []) as unknown as OrderRow[]

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const totalFaturado =
    sales.reduce((s, r) => s + r.total_cents, 0) +
    orders.reduce((s, r) => s + (r.total_price_cents ?? 0), 0)

  const totalVendas = sales.length
  const totalOS     = orders.length
  const txCount     = totalVendas + totalOS
  const ticketMedio = txCount > 0 ? Math.round(totalFaturado / txCount) : 0

  const totalDesconto =
    sales.reduce((s, r) => s + (r.discount_cents ?? 0), 0) +
    orders.reduce((s, r) => s + (r.discount_cents ?? 0), 0)

  // ── Merge & sort ──────────────────────────────────────────────────────────

  type Row = {
    id: string
    source: 'erp' | 'checksmart'
    date: Date
    dateStr: string
    customerName: string
    description: string
    payment: string | null
    discount: number
    total: number
  }

  const allRows: Row[] = [
    ...sales.map(s => ({
      id:           `sale-${s.id}`,
      source:       'erp' as const,
      date:         new Date(s.created_at),
      dateStr:      new Date(s.created_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }),
      customerName: s.customers?.full_name ?? 'Sem cliente',
      description:  s.sale_items.map(i => `${i.quantity}× ${i.name}`).join(', ') || '—',
      payment:      s.payment_method,
      discount:     s.discount_cents ?? 0,
      total:        s.total_cents,
    })),
    ...orders.map(o => ({
      id:           `os-${o.id}`,
      source:       'checksmart' as const,
      date:         new Date(o.received_at),
      dateStr:      new Date(o.received_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }),
      customerName: o.customers?.full_name ?? 'Sem cliente',
      description:  `OS — ${o.status ?? ''}`,
      payment:      null,
      discount:     o.discount_cents ?? 0,
      total:        o.total_price_cents ?? 0,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Financeiro</h1>
        <p className="mt-1 text-sm text-muted">Vendas (Smart ERP) + Ordens de Serviço (CheckSmart)</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: 'Total Faturado',    value: BRL(totalFaturado), icon: TrendingUp,   color: '#00FF94' },
          { label: 'Vendas ERP',        value: String(totalVendas), icon: ShoppingCart, color: '#00E5FF' },
          { label: 'OS CheckSmart',     value: String(totalOS),    icon: Wrench,       color: '#FFB800' },
          { label: 'Ticket Médio',      value: BRL(ticketMedio),   icon: CreditCard,   color: '#00E5FF' },
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

      {/* Descontos resumo */}
      {totalDesconto > 0 && (
        <div className="flex items-center gap-3 rounded-xl border px-5 py-3" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <Receipt className="h-4 w-4 shrink-0" style={{ color: '#FF5C5C' }} />
          <p className="text-sm text-muted">
            Total de descontos concedidos: <span className="font-semibold" style={{ color: '#FF5C5C' }}>{BRL(totalDesconto)}</span>
          </p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-sm font-semibold text-text">Todas as Transações</h2>
          <span className="text-xs text-muted">{allRows.length} {allRows.length === 1 ? 'registro' : 'registros'}</span>
        </div>

        {allRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Receipt className="h-10 w-10" style={{ color: '#1E2D45' }} />
            <p className="text-sm text-muted">Nenhuma transação registrada ainda</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="grid gap-4 px-5 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
              style={{ borderColor: '#1E2D45', gridTemplateColumns: '90px 1fr 150px 110px 100px 100px' }}
            >
              <span>Origem</span>
              <span>Cliente / Descrição</span>
              <span>Data</span>
              <span>Pagamento</span>
              <span className="text-right">Desconto</span>
              <span className="text-right">Total</span>
            </div>

            {allRows.map(row => {
              const isERP     = row.source === 'erp'
              const srcColor  = isERP ? '#00FF94' : '#00E5FF'
              const srcLabel  = isERP ? 'ERP' : 'CheckSmart'
              const pmColor   = row.payment ? (METHOD_COLOR[row.payment] ?? '#64748B') : '#64748B'

              return (
                <div
                  key={row.id}
                  className="grid gap-4 px-5 py-3.5 border-b items-center last:border-0"
                  style={{ borderColor: '#1E2D45', gridTemplateColumns: '90px 1fr 150px 110px 100px 100px' }}
                >
                  {/* Source badge */}
                  <span
                    className="inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-semibold"
                    style={{ background: `${srcColor}18`, color: srcColor }}
                  >
                    {srcLabel}
                  </span>

                  {/* Customer + description */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{row.customerName}</p>
                    <p className="mt-0.5 text-xs text-muted truncate">{row.description}</p>
                  </div>

                  {/* Date */}
                  <p className="text-xs text-muted">{row.dateStr}</p>

                  {/* Payment */}
                  {row.payment ? (
                    <span
                      className="inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-semibold"
                      style={{ background: `${pmColor}18`, color: pmColor }}
                    >
                      {METHOD_LABEL[row.payment] ?? row.payment}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}

                  {/* Discount */}
                  <p className="text-sm text-right" style={{ color: row.discount > 0 ? '#FF5C5C' : '#64748B' }}>
                    {row.discount > 0 ? `- ${BRL(row.discount)}` : '—'}
                  </p>

                  {/* Total */}
                  <p className="text-sm font-bold text-right text-green">{BRL(row.total)}</p>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
