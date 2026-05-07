/**
 * Comparativo entre lojas — agrega vendas e despesas do período por loja.
 * Usado em /relatorios quando user escolhe "Todas as lojas" pra ver
 * KPIs lado a lado.
 */

export type StoreCompareRow = {
  storeId:     string
  storeName:   string
  storeColor:  string
  storeCode:   string
  monthlyGoalCents: number
  // Período atual
  salesCount:    number
  salesTotalCents: number
  expensesTotalCents: number
  // Progresso da meta (mês corrente — sempre baseado no mês atual,
  // ignorando o filtro de período do relatório pra simplicidade)
  monthSalesCents: number
  goalProgressPct: number  // 0..100
}

export type StoreCompareInput = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any
  tenantId: string
  startISO: string
  endISO:   string
  stores:   { id: string; name: string; code: string; color: string; monthly_goal_cents: number }[]
}

export async function getStoreComparison(input: StoreCompareInput): Promise<StoreCompareRow[]> {
  const { sb, tenantId, startISO, endISO, stores } = input

  // Vendas no período por loja
  const { data: salesData } = await sb
    .from('sales')
    .select('store_id, total_cents')
    .eq('tenant_id', tenantId)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .neq('status', 'cancelled')
    .limit(20000)

  const salesByStore = new Map<string, { count: number; total: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (salesData ?? []) as any[]) {
    if (!s.store_id) continue
    const ex = salesByStore.get(s.store_id) ?? { count: 0, total: 0 }
    ex.count += 1
    ex.total += s.total_cents ?? 0
    salesByStore.set(s.store_id, ex)
  }

  // Despesas no período por loja
  const startDate = startISO.slice(0, 10)
  const endDate   = endISO.slice(0, 10)
  const { data: expData } = await sb
    .from('variable_expenses')
    .select('store_id, amount_cents')
    .eq('tenant_id', tenantId)
    .gte('occurred_at', startDate)
    .lte('occurred_at', endDate)
    .limit(20000)

  const expByStore = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of (expData ?? []) as any[]) {
    if (!e.store_id) continue
    expByStore.set(e.store_id, (expByStore.get(e.store_id) ?? 0) + (e.amount_cents ?? 0))
  }

  // Vendas do mês corrente por loja (pra meta — independente do período do relatório)
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data: monthSales } = await sb
    .from('sales')
    .select('store_id, total_cents')
    .eq('tenant_id', tenantId)
    .gte('created_at', monthStart.toISOString())
    .neq('status', 'cancelled')
    .limit(20000)

  const monthByStore = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (monthSales ?? []) as any[]) {
    if (!s.store_id) continue
    monthByStore.set(s.store_id, (monthByStore.get(s.store_id) ?? 0) + (s.total_cents ?? 0))
  }

  return stores.map(st => {
    const sales = salesByStore.get(st.id) ?? { count: 0, total: 0 }
    const monthSalesCents = monthByStore.get(st.id) ?? 0
    const goalProgressPct = st.monthly_goal_cents > 0
      ? Math.min(100, Math.round((monthSalesCents / st.monthly_goal_cents) * 100))
      : 0
    return {
      storeId:            st.id,
      storeName:          st.name,
      storeColor:         st.color,
      storeCode:          st.code,
      monthlyGoalCents:   st.monthly_goal_cents,
      salesCount:         sales.count,
      salesTotalCents:    sales.total,
      expensesTotalCents: expByStore.get(st.id) ?? 0,
      monthSalesCents,
      goalProgressPct,
    }
  }).sort((a, b) => b.salesTotalCents - a.salesTotalCents)
}
