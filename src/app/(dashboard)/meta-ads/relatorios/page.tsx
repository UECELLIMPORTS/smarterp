import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import {
  listAdAccounts,
  fetchMetaAdsInsights,
  fetchAccountTimeseries,
  fetchInsightsMultiAccount,
  combineTimeseries,
  type MetaAdsPeriod,
  type MetaAdsAdAccount,
  type MetaAdsTimeseriesPoint,
} from '@/actions/meta-ads'
import { RelatoriosClient } from './relatorios-client'
import { brDayRange } from '@/lib/br-day'
import { classifyAcquisition, serviceOrderValueCents } from '@/lib/customer-acquisition'

export const metadata = { title: 'Relatórios — Meta Ads' }

// ── Types exportados (usados pelo client) ──────────────────────────────────

export type ReportChannel = 'instagram_pago' | 'instagram_organico' | 'facebook'

export type ChannelMetrics = {
  channel:        ReportChannel
  label:          string
  color:          string
  newCustomers:          number   // 1ª compra paga da vida dentro do período
  recurringCustomers:    number   // compraram no período, 1ª compra antes dele
  txCount:               number   // vendas + OS atribuídas (novos + recorrentes)
  revenueCents:          number   // novos + recorrentes
  newRevenueCents:       number
  recurringRevenueCents: number
  newTxCount:            number   // transações dos clientes novos
  profitCents:    number     // lucro bruto = faturamento − custo do produto/peças
  avgTicketCents: number
}

export type RecurringPaidCustomer = {
  customerId:      string
  name:            string
  channel:         ReportChannel
  firstPurchaseAt: string
  lastPurchaseAt:  string      // última compra dentro do período
  txCount:         number      // compras no período
  revenueCents:    number      // receita no período
}

export type DailyCrossPoint = {
  date:         string   // YYYY-MM-DD
  spendCents:   number
  revenueCents: number
}

export type CacByChannel = {
  channel:      ReportChannel
  label:        string
  color:        string
  spendCents:   number     // 0 pra orgânico
  newCustomers: number
  cacCents:     number | null  // null se 0 clientes ou canal orgânico
  txCount:      number
  costPerTxCents: number | null  // gasto ÷ transações pagas (métrica separada do CAC)
}

export type FunnelMetrics = {
  impressions:       number
  clicks:            number
  conversations:     number   // lançamentos manuais de investimento no período
  newCustomers:      number   // só NOVOS com origem paga (IG Pago + Facebook)
  salesCount:        number   // vendas + OS dos clientes novos pagos
  salesRevenueCents: number   // receita dos clientes novos pagos
  totalPaidRevenueCents: number // novos + recorrentes dos canais pagos
}

export type RelatoriosData = {
  period:              MetaAdsPeriod
  selectedAccount:     MetaAdsAdAccount | null
  isAggregate:         boolean
  activeAccountCount:  number
  accounts:            MetaAdsAdAccount[]
  dailyCross:          DailyCrossPoint[]
  channels:            ChannelMetrics[]
  cac:                 CacByChannel[]
  funnel:              FunnelMetrics
  insightsSpendCents:  number
  loadError:           string | null
  spendEntries:        import('@/actions/meta-ads-spend-manual').SpendEntry[]
  dailyPaidCustomers:  { date: string; count: number }[]
  recurringPaid:       RecurringPaidCustomer[]   // clientes do tráfego pago que voltaram a comprar
  prevSpendCents:      number
  prevNewPaidCustomers: number
  customSince?:        string   // YYYY-MM-DD when custom range active
  customUntil?:        string   // YYYY-MM-DD when custom range active
}

// ── Helpers internos ───────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<ReportChannel, { label: string; color: string }> = {
  instagram_pago:     { label: 'Instagram Pago',     color: '#E4405F' },
  instagram_organico: { label: 'Instagram Orgânico', color: '#C13584' },
  facebook:           { label: 'Facebook',           color: '#1877F2' },
}

function periodToRange(period: MetaAdsPeriod): { since: Date; until: Date } {
  const until = new Date()
  const since = new Date(until)
  // Hoje/Ontem no fuso de Brasília (servidor em UTC); Ontem termina às 23:59 de ontem
  if (period === 'today')     return { since: brDayRange(0).start, until }
  if (period === 'yesterday') { const y = brDayRange(1); return { since: y.start, until: y.end } }
  const days = period === '7d' ? 6 : period === '30d' ? 29 : 89
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)
  return { since, until }
}

function resolveSelectedAccount(
  accounts: MetaAdsAdAccount[],
  requested: string | undefined,
): MetaAdsAdAccount | null {
  const active = accounts.filter(a => a.isActive)
  if (active.length === 0) return null
  if (requested) {
    const normalized = requested.startsWith('act_') ? requested : `act_${requested}`
    const match = active.find(a => a.adAccountId === normalized)
    if (match) return match
  }
  return active.find(a => a.isPrimary) ?? active[0]
}

// ── Query: clientes novos por canal + vendas/OS atribuídas por canal ───────

async function getChannelMetrics(tenantId: string, sinceIso: string, untilIso?: string): Promise<{
  channels: ChannelMetrics[]
  recurringPaid: RecurringPaidCustomer[]
  bySales:  Map<string, number>     // customer_id -> revenue
  bySalesCount: Map<string, number>
}> {
  const { supabase } = await requireAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const salesQ = sb.from('sales')
    .select('customer_id, created_at, total_cents, customers!inner(origin, first_purchase_at, full_name), sale_items(quantity, product_id, cost_snapshot_cents)')
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso)
    .neq('status', 'cancelled')
    .in('customers.origin', ['instagram_pago', 'instagram_organico', 'facebook'])
    .limit(5000)
  if (untilIso) salesQ.lte('created_at', untilIso)

  const osQ = sb.from('service_orders')
    .select('customer_id, received_at, total_price_cents, service_price_cents, parts_sale_cents, parts_cost_cents, discount_cents, customers!inner(origin, first_purchase_at, full_name)')
    .eq('tenant_id', tenantId)
    .gte('received_at', sinceIso)
    .in('status', ['delivered', 'Entregue'])
    .in('customers.origin', ['instagram_pago', 'instagram_organico', 'facebook'])
    .limit(5000)
  if (untilIso) osQ.lte('received_at', untilIso)

  const [salesRes, osRes] = await Promise.all([salesQ, osQ])

  type SaleItem    = { quantity: number; product_id: string | null; cost_snapshot_cents: number | null }
  type CustRef     = { origin: ReportChannel; first_purchase_at: string | null; full_name: string }
  type SaleRow     = { customer_id: string; created_at: string; total_cents: number; customers: CustRef; sale_items: SaleItem[] | null }
  type OsRow       = { customer_id: string; received_at: string; total_price_cents: number|null; service_price_cents: number|null; parts_sale_cents: number|null; parts_cost_cents: number|null; discount_cents: number|null; customers: CustRef }

  const salesData = (salesRes.data ?? []) as SaleRow[]
  const osData    = (osRes.data ?? [])    as OsRow[]

  // Fallback de custo: itens sem snapshot usam o custo atual em products.
  const productIdsToFetch = new Set<string>()
  for (const s of salesData) {
    for (const it of (s.sale_items ?? [])) {
      if (it.cost_snapshot_cents == null && it.product_id) productIdsToFetch.add(it.product_id)
    }
  }
  const costMap = new Map<string, number>()
  if (productIdsToFetch.size > 0) {
    const { data: prodData } = await sb
      .from('products')
      .select('id, cost_cents')
      .eq('tenant_id', tenantId)
      .in('id', Array.from(productIdsToFetch))
    for (const p of (prodData ?? []) as { id: string; cost_cents: number | null }[]) {
      costMap.set(p.id, p.cost_cents ?? 0)
    }
  }

  // Novos vs recorrentes por canal: novo = 1ª compra paga da vida no período
  const acquisition = classifyAcquisition([
    ...salesData.map(s => ({
      customerId: s.customer_id, channel: s.customers?.origin ?? null,
      firstPurchaseAt: s.customers?.first_purchase_at ?? null,
      at: s.created_at, valueCents: s.total_cents ?? 0,
    })),
    ...osData.map(o => ({
      customerId: o.customer_id, channel: o.customers?.origin ?? null,
      firstPurchaseAt: o.customers?.first_purchase_at ?? null,
      at: o.received_at, valueCents: serviceOrderValueCents(o),
    })),
  ], sinceIso, untilIso ?? new Date().toISOString())

  // Faturamento + lucro bruto + contagem de transações por canal
  const revByChannel = new Map<ReportChannel, { revenue: number; profit: number; txCount: number }>()
  const bump = (ch: ReportChannel, revenue: number, profit: number) => {
    const b = revByChannel.get(ch) ?? { revenue: 0, profit: 0, txCount: 0 }
    b.revenue += revenue
    b.profit  += profit
    b.txCount += 1
    revByChannel.set(ch, b)
  }
  const bySales      = new Map<string, number>()
  const bySalesCount = new Map<string, number>()

  for (const s of salesData) {
    const ch = s.customers?.origin
    const v  = s.total_cents ?? 0
    if (!ch || v <= 0) continue
    let cost = 0
    for (const it of (s.sale_items ?? [])) {
      const qty  = it.quantity ?? 0
      const unit = it.cost_snapshot_cents ?? (it.product_id ? (costMap.get(it.product_id) ?? 0) : 0)
      cost += qty * unit
    }
    bump(ch, v, v - cost)
    bySales.set(s.customer_id, (bySales.get(s.customer_id) ?? 0) + v)
    bySalesCount.set(s.customer_id, (bySalesCount.get(s.customer_id) ?? 0) + 1)
  }
  for (const o of osData) {
    const ch = o.customers?.origin
    const v  = serviceOrderValueCents(o)
    if (!ch || v <= 0) continue
    bump(ch, v, v - (o.parts_cost_cents ?? 0))
    bySales.set(o.customer_id, (bySales.get(o.customer_id) ?? 0) + v)
    bySalesCount.set(o.customer_id, (bySalesCount.get(o.customer_id) ?? 0) + 1)
  }

  const channels: ChannelMetrics[] = (['instagram_pago', 'instagram_organico', 'facebook'] as ReportChannel[]).map(ch => {
    const cfg = CHANNEL_CONFIG[ch]
    const rev = revByChannel.get(ch) ?? { revenue: 0, profit: 0, txCount: 0 }
    const acq = acquisition.get(ch)
    const avgTicket = rev.txCount > 0 ? Math.round(rev.revenue / rev.txCount) : 0
    return {
      channel:               ch,
      label:                 cfg.label,
      color:                 cfg.color,
      newCustomers:          acq?.newCustomers ?? 0,
      recurringCustomers:    acq?.recurringCustomers ?? 0,
      txCount:               rev.txCount,
      revenueCents:          rev.revenue,
      newRevenueCents:       acq?.newRevenueCents ?? 0,
      recurringRevenueCents: acq?.recurringRevenueCents ?? 0,
      newTxCount:            acq?.newTxCount ?? 0,
      profitCents:    rev.profit,
      avgTicketCents: avgTicket,
    }
  })

  // Recorrentes do tráfego pago: origem paga + 1ª compra antes do período
  const recurringMap = new Map<string, RecurringPaidCustomer>()
  const addRecurring = (customerId: string, c: CustRef | undefined, at: string, value: number) => {
    if (!c || value <= 0 || !c.first_purchase_at) return
    if (c.origin !== 'instagram_pago' && c.origin !== 'facebook') return
    if (Date.parse(c.first_purchase_at) >= Date.parse(sinceIso)) return
    const r = recurringMap.get(customerId) ?? {
      customerId, name: c.full_name, channel: c.origin,
      firstPurchaseAt: c.first_purchase_at, lastPurchaseAt: at, txCount: 0, revenueCents: 0,
    }
    r.txCount      += 1
    r.revenueCents += value
    if (at > r.lastPurchaseAt) r.lastPurchaseAt = at
    recurringMap.set(customerId, r)
  }
  for (const s of salesData) addRecurring(s.customer_id, s.customers, s.created_at, s.total_cents ?? 0)
  for (const o of osData)    addRecurring(o.customer_id, o.customers, o.received_at, serviceOrderValueCents(o))
  const recurringPaid = [...recurringMap.values()].sort((a, b) => b.lastPurchaseAt.localeCompare(a.lastPurchaseAt))

  return { channels, recurringPaid, bySales, bySalesCount }
}

// ── Query: faturamento atribuído por dia (pra linha cruzada com gasto) ─────

async function getDailyRevenueByDay(tenantId: string, sinceIso: string, untilIso?: string): Promise<Map<string, number>> {
  const { supabase } = await requireAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const sQ = sb.from('sales')
    .select('created_at, total_cents, customers!inner(origin)')
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso)
    .neq('status', 'cancelled')
    .in('customers.origin', ['instagram_pago', 'facebook'])
    .limit(10000)
  if (untilIso) sQ.lte('created_at', untilIso)

  const oQ = sb.from('service_orders')
    .select('received_at, total_price_cents, service_price_cents, parts_sale_cents, discount_cents, customers!inner(origin)')
    .eq('tenant_id', tenantId)
    .gte('received_at', sinceIso)
    .in('status', ['delivered', 'Entregue'])
    .in('customers.origin', ['instagram_pago', 'facebook'])
    .limit(10000)
  if (untilIso) oQ.lte('received_at', untilIso)

  const [salesRes, osRes] = await Promise.all([sQ, oQ])

  type SRow = { created_at: string; total_cents: number }
  type ORow = { received_at: string; total_price_cents: number|null; service_price_cents: number|null; parts_sale_cents: number|null; discount_cents: number|null }

  const byDay = new Map<string, number>()
  const addDay = (date: string, v: number) => byDay.set(date, (byDay.get(date) ?? 0) + v)

  for (const s of (salesRes.data ?? []) as SRow[]) {
    addDay(s.created_at.slice(0, 10), s.total_cents ?? 0)
  }
  for (const o of (osRes.data ?? []) as ORow[]) {
    const v = o.total_price_cents
      ?? Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
    addDay(o.received_at.slice(0, 10), v)
  }

  return byDay
}

// ── Página ─────────────────────────────────────────────────────────────────

export default async function MetaAdsRelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; account?: string; since?: string; until?: string }>
}) {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const { user } = auth
  const tenantId = getTenantId(user)

  const { period: rawPeriod = '30d', account: rawAccount, since: rawSince, until: rawUntil } = await searchParams
  const period = (['7d', '30d', '90d', 'today', 'yesterday'].includes(rawPeriod)
    ? rawPeriod
    : '30d') as MetaAdsPeriod

  // Intervalo personalizado tem prioridade sobre o preset
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  const isCustomRange = !!(rawSince && rawUntil && dateRegex.test(rawSince) && dateRegex.test(rawUntil))

  const accounts = await listAdAccounts().catch(() => [] as MetaAdsAdAccount[])
  const activeAccounts = accounts.filter(a => a.isActive)

  // Mesmo critério do dashboard: consolida todas as contas por padrão quando
  // há 2+ ativas. Assim o gasto somado bate com TODO o faturamento atribuído
  // (cruzar gasto de 1 conta com faturamento de todas inflaria o ROAS/CAC).
  const isAggregate = activeAccounts.length > 1 && (rawAccount === 'all' || rawAccount === undefined)
  const selectedAccount = isAggregate ? null : resolveSelectedAccount(accounts, rawAccount)

  // Intervalo de datas
  const sinceIso: string = isCustomRange
    ? new Date(rawSince! + 'T00:00:00-03:00').toISOString()
    : periodToRange(period).since.toISOString()
  const untilIso: string = isCustomRange
    ? new Date(rawUntil! + 'T23:59:59.999-03:00').toISOString()
    : periodToRange(period).until.toISOString()
  const since = new Date(sinceIso)

  let insightsSpendCents = 0
  let insightsImpressions = 0
  let insightsClicks = 0
  let dailyMetaTs: { date: string; spendCents: number }[] = []
  let loadError: string | null = null

  if (isAggregate) {
    try {
      const ids = activeAccounts.map(a => a.adAccountId)
      const [{ combined, perAccount }, tsSettled] = await Promise.all([
        fetchInsightsMultiAccount(period, ids),
        Promise.allSettled(ids.map(id => fetchAccountTimeseries(period, id))),
      ])
      if (combined) {
        insightsSpendCents  = combined.spendCents
        insightsImpressions = combined.impressions
        insightsClicks      = combined.clicks
      }
      const tsLists = tsSettled
        .filter((r): r is PromiseFulfilledResult<MetaAdsTimeseriesPoint[]> => r.status === 'fulfilled')
        .map(r => r.value)
      dailyMetaTs = (await combineTimeseries(tsLists)).map(t => ({ date: t.date, spendCents: t.spendCents }))
      loadError = perAccount.find(p => p.error)?.error ?? null
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Erro ao carregar dados do Meta'
    }
  } else if (selectedAccount) {
    try {
      const [insights, ts] = await Promise.all([
        fetchMetaAdsInsights(period, selectedAccount.adAccountId),
        fetchAccountTimeseries(period, selectedAccount.adAccountId),
      ])
      if (insights) {
        insightsSpendCents  = insights.spendCents
        insightsImpressions = insights.impressions
        insightsClicks      = insights.clicks
      }
      dailyMetaTs = ts.map(t => ({ date: t.date, spendCents: t.spendCents }))
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Erro ao carregar dados do Meta'
    }
  }

  const { supabase: sb2 } = await requireAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb2a = sb2 as any

  const sinceDateStr = since.toISOString().slice(0, 10)
  const untilDateStr = new Date(untilIso).toISOString().slice(0, 10)

  // Período anterior só faz sentido para presets; custom não calcula delta
  const periodDays = isCustomRange ? 0 : (period === '7d' ? 7 : period === '30d' ? 30 : 90)
  const prevSinceDate = new Date(since)
  if (!isCustomRange) prevSinceDate.setDate(prevSinceDate.getDate() - periodDays)
  const prevSinceIso = prevSinceDate.toISOString()
  const prevSinceDateStr = prevSinceIso.slice(0, 10)

  const spendQuery = sb2a
    .from('meta_ads_spend_entries')
    .select('id, spend_date, amount_cents, currency, original_amount_cents, exchange_rate, impressions, clicks, conversations, objective, notes, created_at')
    .eq('tenant_id', tenantId)
    .gte('spend_date', sinceDateStr)
    .order('spend_date', { ascending: false })
  if (isCustomRange) spendQuery.lte('spend_date', untilDateStr)

  // Novos pagos por dia = data da 1ª compra paga (não a data de cadastro)
  const custQuery = sb2a
    .from('customers')
    .select('id, first_purchase_at, origin')
    .eq('tenant_id', tenantId)
    .gte('first_purchase_at', sinceIso)
    .lte('first_purchase_at', untilIso)
    .in('origin', ['instagram_pago', 'facebook'])
    .limit(5000)

  const [spendRes, dailyCustRes, prevSpendRes, prevCustRes] = await Promise.all([
    spendQuery,
    custQuery,
    isCustomRange
      ? Promise.resolve({ data: [] })
      : sb2a
          .from('meta_ads_spend_entries')
          .select('amount_cents')
          .eq('tenant_id', tenantId)
          .gte('spend_date', prevSinceDateStr)
          .lt('spend_date', sinceDateStr),
    isCustomRange
      ? Promise.resolve({ data: [] })
      : sb2a
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .gte('first_purchase_at', prevSinceIso)
          .lt('first_purchase_at', sinceIso)
          .in('origin', ['instagram_pago', 'facebook'])
          .limit(5000),
  ])

  // Agrupa clientes pagos por dia
  const custByDay = new Map<string, number>()
  for (const c of (dailyCustRes.data ?? []) as { first_purchase_at: string }[]) {
    const d = c.first_purchase_at.slice(0, 10)
    custByDay.set(d, (custByDay.get(d) ?? 0) + 1)
  }
  const dailyPaidCustomers = [...custByDay.entries()].map(([date, count]) => ({ date, count }))

  const prevSpendCents = ((prevSpendRes.data ?? []) as { amount_cents: number }[])
    .reduce((s, e) => s + e.amount_cents, 0)
  const prevNewPaidCustomers = (prevCustRes.data ?? []).length

  const untilParam = isCustomRange ? untilIso : undefined
  const [{ channels, recurringPaid }, dailyRevenue] = await Promise.all([
    getChannelMetrics(tenantId, sinceIso, untilParam),
    getDailyRevenueByDay(tenantId, sinceIso, untilParam),
  ])

  // Merge das duas séries em dailyCross
  const dailySet = new Set<string>([
    ...dailyMetaTs.map(t => t.date),
    ...dailyRevenue.keys(),
  ])
  const dailyCross: DailyCrossPoint[] = [...dailySet].sort().map(date => ({
    date,
    spendCents:   dailyMetaTs.find(t => t.date === date)?.spendCents ?? 0,
    revenueCents: dailyRevenue.get(date) ?? 0,
  }))

  // CAC por canal
  const cac: CacByChannel[] = channels.map(c => {
    const isPaid = c.channel === 'instagram_pago' || c.channel === 'facebook'
    // Divide o gasto total do Meta proporcionalmente entre os canais pagos?
    // Opção mais honesta: atribui o gasto total às duas (ig_pago + facebook) combinadas.
    // Como a API do Meta não separa gasto IG vs FB por canal aqui, usamos o total.
    const totalNewPaid = (channels.find(x => x.channel === 'instagram_pago')?.newCustomers ?? 0)
                       + (channels.find(x => x.channel === 'facebook')?.newCustomers ?? 0)
    const shareSpend   = isPaid && totalNewPaid > 0
      ? Math.round(insightsSpendCents * (c.newCustomers / totalNewPaid))
      : 0
    const cacVal       = isPaid && c.newCustomers > 0
      ? Math.round(shareSpend / c.newCustomers)
      : null
    return {
      channel:        c.channel,
      label:          c.label,
      color:          c.color,
      spendCents:     shareSpend,
      newCustomers:   c.newCustomers,
      cacCents:       cacVal,
      txCount:        c.txCount,
      costPerTxCents: isPaid && c.txCount > 0 ? Math.round(shareSpend / c.txCount) : null,
    }
  })

  // Funil Meta → ERP: só canais pagos e só clientes NOVOS
  const paidChannels = channels.filter(c => c.channel === 'instagram_pago' || c.channel === 'facebook')
  const periodConversations = ((spendRes.data ?? []) as { conversations: number | null }[])
    .reduce((s, e) => s + (e.conversations ?? 0), 0)
  const funnel: FunnelMetrics = {
    impressions:           insightsImpressions,
    clicks:                insightsClicks,
    conversations:         periodConversations,
    newCustomers:          paidChannels.reduce((s, c) => s + c.newCustomers, 0),
    salesCount:            paidChannels.reduce((s, c) => s + c.newTxCount, 0),
    salesRevenueCents:     paidChannels.reduce((s, c) => s + c.newRevenueCents, 0),
    totalPaidRevenueCents: paidChannels.reduce((s, c) => s + c.revenueCents, 0),
  }

  const data: RelatoriosData = {
    period,
    selectedAccount,
    isAggregate,
    activeAccountCount: activeAccounts.length,
    accounts,
    dailyCross,
    channels,
    cac,
    funnel,
    insightsSpendCents,
    loadError,
    spendEntries: spendRes.data ?? [],
    dailyPaidCustomers,
    recurringPaid,
    prevSpendCents,
    prevNewPaidCustomers,
    ...(isCustomRange ? { customSince: rawSince!, customUntil: rawUntil! } : {}),
  }

  return <RelatoriosClient data={data} />
}
