import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { ErpClientesClient } from './erp-clientes-client'

export const metadata = { title: 'ERP Clientes — Smart ERP' }

type Period = '7d' | '30d' | '90d'

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === '7d')  start.setDate(start.getDate() - 6)
  else if (period === '30d') start.setDate(start.getDate() - 29)
  else start.setDate(start.getDate() - 89)
  return { start, end }
}

function classify(customerCreatedAt: string | null | undefined, periodStart: Date): 'novo' | 'recorrente' {
  if (!customerCreatedAt) return 'recorrente'
  return new Date(customerCreatedAt) >= periodStart ? 'novo' : 'recorrente'
}

function osTotal(o: { total_price_cents: number | null; service_price_cents: number | null; parts_sale_cents: number | null; discount_cents: number | null }): number {
  if (o.total_price_cents) return o.total_price_cents
  return Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
}

export type TopClient = {
  name: string
  type: 'novo' | 'recorrente'
  totalCents: number
  transactions: number
  ticketMedioCents: number
  lastDate: string
}

export type MonthPoint = { label: string; recorrentes: number; novos: number }

export type ChurnClient = {
  name: string
  daysSince: number
  totalCents: number
  transactions: number
}

export type WeekdayPoint = { label: string; totalCents: number; transactions: number }

export type DashboardData = {
  period: Period
  recorrentes: { totalCents: number; transactions: number; ticketMedioCents: number; avgProducts: string; sharePercent: number }
  novos:       { totalCents: number; transactions: number; ticketMedioCents: number; avgProducts: string; sharePercent: number }
  monthlyData: MonthPoint[]
  topClients:  TopClient[]
  insightText: string
  sources: {
    smarterp:   { totalCents: number; transactions: number; uniqueCustomers: number }
    checksmart: { totalCents: number; transactions: number; uniqueCustomers: number }
    overlap: number
  }
  churnRisk: ChurnClient[]
  rfmSegments: { campeoes: number; emRisco: number; novosPromissores: number; dormentes: number }
  weekdayHeatmap: WeekdayPoint[]
}

export default async function ErpClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const { supabase, user } = auth
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { period: rawPeriod = '30d' } = await searchParams
  const period = (['7d', '30d', '90d'].includes(rawPeriod) ? rawPeriod : '30d') as Period
  const { start, end } = getPeriodRange(period)

  const sixAgo = new Date()
  sixAgo.setMonth(sixAgo.getMonth() - 5)
  sixAgo.setDate(1)
  sixAgo.setHours(0, 0, 0, 0)

  const [salesPeriodRes, osPeriodRes, salesMonthRes, osMonthRes] = await Promise.all([
    sb.from('sales')
      .select('customer_id, total_cents, created_at, sale_items(quantity), customers(full_name, created_at)')
      .eq('tenant_id', tenantId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .neq('status', 'cancelled')
      .limit(1000),

    sb.from('service_orders')
      .select('customer_id, total_price_cents, service_price_cents, parts_sale_cents, discount_cents, received_at, customers(full_name, created_at)')
      .eq('tenant_id', tenantId)
      .gte('received_at', start.toISOString())
      .lte('received_at', end.toISOString())
      .neq('status', 'Cancelado')
      .limit(1000),

    sb.from('sales')
      .select('customer_id, total_cents, created_at, customers(full_name, created_at)')
      .eq('tenant_id', tenantId)
      .gte('created_at', sixAgo.toISOString())
      .neq('status', 'cancelled')
      .limit(2000),

    sb.from('service_orders')
      .select('customer_id, total_price_cents, service_price_cents, parts_sale_cents, discount_cents, received_at, customers(full_name, created_at)')
      .eq('tenant_id', tenantId)
      .gte('received_at', sixAgo.toISOString())
      .neq('status', 'Cancelado')
      .limit(2000),
  ])

  // ── Process period data ─────────────────────────────────────────────────
  type SalePeriod = { customer_id: string|null; total_cents: number; created_at: string; sale_items: {quantity:number}[]|null; customers: {full_name:string; created_at:string}|null }
  type OsPeriod   = { customer_id: string|null; total_price_cents: number|null; service_price_cents: number|null; parts_sale_cents: number|null; discount_cents: number|null; received_at: string; customers: {full_name:string; created_at:string}|null }

  const salesPeriodData = (salesPeriodRes.data ?? []) as SalePeriod[]
  const osPeriodData    = (osPeriodRes.data   ?? []) as OsPeriod[]

  type Tx = { customerId: string | null; name: string; createdAt: string | null; totalCents: number; products: number; date: Date }

  const periodTxs: Tx[] = [
    ...salesPeriodData.map(s => ({
      customerId: s.customer_id,
      name: s.customers?.full_name ?? 'Sem cliente',
      createdAt: s.customers?.created_at ?? null,
      totalCents: s.total_cents ?? 0,
      products: (s.sale_items ?? []).reduce((sum, i) => sum + (i.quantity ?? 1), 0) || 1,
      date: new Date(s.created_at),
    })),
    ...osPeriodData.map(o => ({
      customerId: o.customer_id,
      name: o.customers?.full_name ?? 'Sem cliente',
      createdAt: o.customers?.created_at ?? null,
      totalCents: osTotal(o),
      products: 1,
      date: new Date(o.received_at),
    })),
  ]

  let recTot = 0, recTx = 0, recProd = 0
  let novTot = 0, novTx = 0, novProd = 0

  const customerMap = new Map<string, { name: string; type: 'novo'|'recorrente'; totalCents: number; tx: number; lastDate: Date }>()

  for (const t of periodTxs) {
    const type = classify(t.createdAt, start)
    if (type === 'recorrente') { recTot += t.totalCents; recTx++; recProd += t.products }
    else                       { novTot += t.totalCents; novTx++; novProd += t.products }

    if (t.customerId) {
      const ex = customerMap.get(t.customerId)
      if (ex) { ex.totalCents += t.totalCents; ex.tx++; if (t.date > ex.lastDate) ex.lastDate = t.date }
      else customerMap.set(t.customerId, { name: t.name, type, totalCents: t.totalCents, tx: 1, lastDate: t.date })
    }
  }

  const totalCents = recTot + novTot
  const recShare = totalCents > 0 ? Math.round(recTot / totalCents * 100) : 0

  const fmtLastDate = (d: Date) => {
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
    if (diffDays === 0) return 'Hoje'
    if (diffDays === 1) return 'Ontem'
    return `${diffDays} dias`
  }

  const topClients: TopClient[] = [...customerMap.values()]
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 10)
    .map(c => ({
      name: c.name,
      type: c.type,
      totalCents: c.totalCents,
      transactions: c.tx,
      ticketMedioCents: Math.round(c.totalCents / c.tx),
      lastDate: fmtLastDate(c.lastDate),
    }))

  // ── Sources: SmartERP vs CheckSmart ─────────────────────────────────────
  const saleCustomerIds = new Set(salesPeriodData.filter(s => s.customer_id).map(s => s.customer_id as string))
  const osCustomerIds   = new Set(osPeriodData.filter(o => o.customer_id).map(o => o.customer_id as string))
  const overlap = [...saleCustomerIds].filter(id => osCustomerIds.has(id)).length

  const sources = {
    smarterp: {
      totalCents: salesPeriodData.reduce((sum, s) => sum + (s.total_cents ?? 0), 0),
      transactions: salesPeriodData.length,
      uniqueCustomers: saleCustomerIds.size,
    },
    checksmart: {
      totalCents: osPeriodData.reduce((sum, o) => sum + osTotal(o), 0),
      transactions: osPeriodData.length,
      uniqueCustomers: osCustomerIds.size,
    },
    overlap,
  }

  // ── Weekday heatmap ──────────────────────────────────────────────────────
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const dowMap = DAYS.map(label => ({ label, totalCents: 0, transactions: 0 }))
  for (const t of periodTxs) {
    const dow = t.date.getDay()
    dowMap[dow].totalCents += t.totalCents
    dowMap[dow].transactions++
  }
  const weekdayHeatmap: WeekdayPoint[] = dowMap

  // ── Monthly evolution ────────────────────────────────────────────────────
  const months: { label: string; start: Date; end: Date }[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const y = d.getFullYear(), m = d.getMonth()
    return {
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      start: new Date(y, m, 1),
      end:   new Date(y, m + 1, 0, 23, 59, 59),
    }
  })

  type MonthTx = { customerId: string|null; name: string; createdAt: string|null; totalCents: number; date: Date }
  const monthTxs: MonthTx[] = [
    ...((salesMonthRes.data ?? []) as { customer_id: string|null; total_cents: number; created_at: string; customers: {full_name: string; created_at: string}|null }[])
      .map(s => ({ customerId: s.customer_id, name: s.customers?.full_name ?? 'Sem cliente', createdAt: s.customers?.created_at ?? null, totalCents: s.total_cents ?? 0, date: new Date(s.created_at) })),
    ...((osMonthRes.data ?? []) as { customer_id: string|null; total_price_cents: number|null; service_price_cents: number|null; parts_sale_cents: number|null; discount_cents: number|null; received_at: string; customers: {full_name: string; created_at: string}|null }[])
      .map(o => ({ customerId: o.customer_id, name: o.customers?.full_name ?? 'Sem cliente', createdAt: o.customers?.created_at ?? null, totalCents: osTotal(o), date: new Date(o.received_at) })),
  ]

  const monthlyData: MonthPoint[] = months.map(m => {
    let rec = 0, nov = 0
    for (const t of monthTxs) {
      if (t.date < m.start || t.date > m.end) continue
      if (classify(t.createdAt, m.start) === 'recorrente') rec += t.totalCents
      else nov += t.totalCents
    }
    return { label: m.label, recorrentes: rec, novos: nov }
  })

  // ── Activity map (6 months) → Churn + RFM ───────────────────────────────
  const activityMap = new Map<string, { name: string; lastDate: Date; totalCents: number; tx: number }>()
  for (const t of monthTxs) {
    if (!t.customerId) continue
    const ex = activityMap.get(t.customerId)
    if (ex) {
      ex.totalCents += t.totalCents
      ex.tx++
      if (t.date > ex.lastDate) ex.lastDate = t.date
    } else {
      activityMap.set(t.customerId, { name: t.name, lastDate: t.date, totalCents: t.totalCents, tx: 1 })
    }
  }

  const now = Date.now()
  const MS_DAY = 86400000

  const churnRisk: ChurnClient[] = [...activityMap.values()]
    .map(c => ({ ...c, daysSince: Math.floor((now - c.lastDate.getTime()) / MS_DAY) }))
    .filter(c => c.daysSince >= 60)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 10)
    .map(({ name, daysSince, totalCents, tx }) => ({ name, daysSince, totalCents, transactions: tx }))

  let campeoes = 0, emRisco = 0, novosPromissores = 0, dormentes = 0
  for (const [, c] of activityMap) {
    const days = Math.floor((now - c.lastDate.getTime()) / MS_DAY)
    const isRecent    = days <= 30
    const isFrequent  = c.tx >= 3
    const isHighValue = c.totalCents >= 50000

    if (isRecent && isFrequent && isHighValue)          campeoes++
    else if (!isRecent && (isFrequent || isHighValue))  emRisco++
    else if (isRecent && !isFrequent)                   novosPromissores++
    else                                                dormentes++
  }
  const rfmSegments = { campeoes, emRisco, novosPromissores, dormentes }

  // ── Insight text ─────────────────────────────────────────────────────────
  const recTicket  = recTx > 0 ? recTot / recTx : 0
  const novTicket  = novTx > 0 ? novTot / novTx : 0
  const ticketRatio = novTicket > 0 ? (recTicket / novTicket).toFixed(1) : null
  const insightText = ticketRatio && parseFloat(ticketRatio) > 1
    ? `Clientes recorrentes gastam em média ${ticketRatio}× mais por pedido do que clientes novos. Invista em fidelização.`
    : recTx === 0 && novTx === 0
    ? 'Nenhuma venda encontrada no período selecionado.'
    : `${recShare}% do faturamento vem de clientes recorrentes. Mantenha o atendimento de qualidade para retê-los.`

  const data: DashboardData = {
    period,
    recorrentes: {
      totalCents:       recTot,
      transactions:     recTx,
      ticketMedioCents: recTx > 0 ? Math.round(recTot / recTx) : 0,
      avgProducts:      recTx > 0 ? (recProd / recTx).toFixed(1) : '0.0',
      sharePercent:     recShare,
    },
    novos: {
      totalCents:       novTot,
      transactions:     novTx,
      ticketMedioCents: novTx > 0 ? Math.round(novTot / novTx) : 0,
      avgProducts:      novTx > 0 ? (novProd / novTx).toFixed(1) : '0.0',
      sharePercent:     100 - recShare,
    },
    monthlyData,
    topClients,
    insightText,
    sources,
    churnRisk,
    rfmSegments,
    weekdayHeatmap,
  }

  return <ErpClientesClient data={data} />
}
