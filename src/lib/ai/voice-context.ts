/**
 * Contexto operacional do dia — feed pra IA antes de processar comando.
 * Server-side, queries leves no Supabase. Roda em todo processConversation.
 */

export type OperationalContext = {
  todayStats: {
    salesCount:   number
    salesTotalCents: number
    expensesCount: number
    expensesTotalCents: number
  }
  topProductsToday: Array<{ name: string; qty: number }>
  lowStockProducts: Array<{ name: string; stock_qty: number }>
  recentCustomers:  Array<{ id: string; name: string; lastSaleAt: string }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOperationalContext(sb: any, tenantId: string): Promise<OperationalContext> {
  const today = new Date().toISOString().slice(0, 10)
  const todayStart = `${today}T00:00:00.000Z`

  // Sales hoje (count + total)
  const { data: salesData } = await sb
    .from('sales')
    .select('total_cents, customer_id, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', todayStart)
    .neq('status', 'cancelled')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sales = (salesData ?? []) as any[]
  const salesCount = sales.length
  const salesTotalCents = sales.reduce((s, r) => s + (r.total_cents ?? 0), 0)

  // Despesas hoje
  const { data: expensesData } = await sb
    .from('variable_expenses')
    .select('amount_cents')
    .eq('tenant_id', tenantId)
    .eq('occurred_at', today)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenses = (expensesData ?? []) as any[]
  const expensesCount = expenses.length
  const expensesTotalCents = expenses.reduce((s, r) => s + (r.amount_cents ?? 0), 0)

  // Top produtos hoje (via sale_items)
  let topProductsToday: Array<{ name: string; qty: number }> = []
  if (sales.length > 0) {
    const saleIds = sales.map(s => s.created_at).slice(0, 1) // workaround: usa filtro por created_at
    const { data: itemsData } = await sb
      .from('sale_items')
      .select('name, quantity, sale:sales!inner ( tenant_id, created_at, status )')
      .eq('sale.tenant_id', tenantId)
      .gte('sale.created_at', todayStart)
      .neq('sale.status', 'cancelled')
      .limit(200)
    const counts = new Map<string, number>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    for (const it of (itemsData ?? []) as any[]) {
      const name: string = it.name ?? 'Item'
      counts.set(name, (counts.get(name) ?? 0) + Number(it.quantity ?? 0))
    }
    topProductsToday = Array.from(counts.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
    // saleIds não é usado mas mantido pra clareza
    void saleIds
  }

  // Estoque baixo
  const { data: lowStockData } = await sb
    .from('products')
    .select('name, stock_qty, min_stock_qty')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .gt('min_stock_qty', 0)
    .order('stock_qty', { ascending: true })
    .limit(5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lowStockProducts = ((lowStockData ?? []) as any[])
    .filter(p => p.stock_qty <= (p.min_stock_qty ?? 0))
    .map(p => ({ name: p.name, stock_qty: p.stock_qty ?? 0 }))

  // Últimos clientes atendidos (via sales recentes)
  const recentCustomerIds = Array.from(new Set(sales.map(s => s.customer_id).filter(Boolean))).slice(0, 3)
  let recentCustomers: Array<{ id: string; name: string; lastSaleAt: string }> = []
  if (recentCustomerIds.length > 0) {
    const { data: custData } = await sb
      .from('customers')
      .select('id, full_name')
      .in('id', recentCustomerIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameMap = new Map<string, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (custData ?? []) as any[]) nameMap.set(c.id, c.full_name)
    recentCustomers = recentCustomerIds.map(id => {
      const sale = sales.find(s => s.customer_id === id)
      return {
        id,
        name:       nameMap.get(id) ?? 'Cliente',
        lastSaleAt: sale?.created_at ?? '',
      }
    })
  }

  return {
    todayStats: { salesCount, salesTotalCents, expensesCount, expensesTotalCents },
    topProductsToday,
    lowStockProducts,
    recentCustomers,
  }
}

export function formatContextForPrompt(ctx: OperationalContext): string {
  const lines: string[] = []
  lines.push('CONTEXTO OPERACIONAL DE HOJE:')
  lines.push(`- Vendas hoje: ${ctx.todayStats.salesCount} (total R$ ${(ctx.todayStats.salesTotalCents / 100).toFixed(2)})`)
  lines.push(`- Despesas hoje: ${ctx.todayStats.expensesCount} (total R$ ${(ctx.todayStats.expensesTotalCents / 100).toFixed(2)})`)
  if (ctx.topProductsToday.length > 0) {
    lines.push(`- Top produtos vendidos hoje: ${ctx.topProductsToday.map(p => `${p.name} (${p.qty}x)`).join(', ')}`)
  }
  if (ctx.recentCustomers.length > 0) {
    lines.push(`- Últimos clientes atendidos hoje: ${ctx.recentCustomers.map(c => c.name).join(', ')}`)
  }
  if (ctx.lowStockProducts.length > 0) {
    lines.push(`- Atenção: estoque baixo em ${ctx.lowStockProducts.map(p => `${p.name} (${p.stock_qty})`).join(', ')}`)
  }
  return lines.join('\n')
}
