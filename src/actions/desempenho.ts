'use server'

/**
 * Desempenho da equipe — Gestão Smart (PDV) + CheckSmart (OS).
 *
 * Os dois sistemas compartilham o mesmo banco, então somamos por colaborador:
 *
 *  - Vendas PDV: crédito de quem registrou a venda (sales.user_id).
 *  - OS (atendimento): crédito de quem ABRIU a OS (service_orders.created_by).
 *    Faturamento/lucro seguem a regra dos Relatórios: OS entregues, pela data
 *    de entrada.
 *  - OS (execução): crédito de quem FINALIZOU — técnico responsável
 *    (assigned_to) se preenchido, senão quem passou a OS para "Pronto"
 *    (order_status_logs.changed_by). Conta OS que ficaram prontas no período.
 *  - Horas de serviço: soma do tempo em que a OS ficou "Em diagnóstico" ou
 *    "Em reparo" até ficar pronta (fila e "Aguardando peças" não contam).
 *
 * Visibilidade: dono, gerente e quem tem a permissão 'equipe:relatorio' veem
 * todos. Os demais recebem só a própria linha ("Meu desempenho").
 */

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreId } from '@/lib/active-store'
import { canViewTeamReport } from '@/lib/permissions'
import { listTenantUsers, displayName } from '@/lib/tenant-users'

export type TeamMemberPerformance = {
  userId:   string | null          // null = sem colaborador registrado
  name:     string
  email:    string | null
  role:     string | null

  salesCount:        number
  salesRevenueCents: number
  salesProfitCents:  number

  osOpenedCount:     number        // OS abertas no período (exceto canceladas)
  osDeliveredCount:  number        // dessas, quantas já foram entregues
  osRevenueCents:    number        // faturamento das entregues
  osProfitCents:     number

  repairsCount:      number        // OS finalizadas (prontas) no período
  serviceMinutes:    number        // tempo em diagnóstico/reparo
  repairsWithTime:   number        // finalizadas que têm tempo registrado

  totalCount:        number        // vendas + OS entregues
  totalRevenueCents: number
  totalProfitCents:  number
}

export type TeamPerformanceData = {
  canViewAll: boolean
  members:    TeamMemberPerformance[]
  totals:     Omit<TeamMemberPerformance, 'userId' | 'name' | 'email' | 'role'>
}

const WORK_STATUSES = new Set(['diagnosing', 'in_repair'])
const CANCELLED     = ['cancelled', 'Cancelado', 'Cancelada']
const DELIVERED     = new Set(['delivered', 'Entregue'])
const PAGE          = 1000
const MAX_ROWS      = 20000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any

/** Busca todas as linhas de uma query paginando com .range() (limite MAX_ROWS). */
async function fetchAll<T>(build: () => Query): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function emptyRow(userId: string | null, name: string, email: string | null, role: string | null): TeamMemberPerformance {
  return {
    userId, name, email, role,
    salesCount: 0, salesRevenueCents: 0, salesProfitCents: 0,
    osOpenedCount: 0, osDeliveredCount: 0, osRevenueCents: 0, osProfitCents: 0,
    repairsCount: 0, serviceMinutes: 0, repairsWithTime: 0,
    totalCount: 0, totalRevenueCents: 0, totalProfitCents: 0,
  }
}

export async function getTeamPerformance(filters: {
  start:    string                  // ISO
  end:      string                  // ISO
  storeId?: string | 'all'          // só afeta vendas do PDV (OS não têm loja)
}): Promise<TeamPerformanceData> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (!tenantId) throw new Error('Tenant não autorizado')

  const canViewAll = await canViewTeamReport(user)

  const admin = createAdminClient()
  const sb = admin as Query

  let storeId: string | null = null
  if (filters.storeId && filters.storeId !== 'all') storeId = filters.storeId
  else if (filters.storeId !== 'all') storeId = await resolveActiveStoreId(sb, tenantId)

  // ── 1. Vendas do PDV ────────────────────────────────────────────────────
  type SaleRow = {
    user_id: string | null
    total_cents: number | null
    sale_items: { quantity: number; product_id: string | null; cost_snapshot_cents: number | null }[] | null
  }
  const salesP = fetchAll<SaleRow>(() => {
    let q = sb.from('sales')
      .select('user_id, total_cents, sale_items(quantity, product_id, cost_snapshot_cents)')
      .eq('tenant_id', tenantId)
      .gte('created_at', filters.start)
      .lte('created_at', filters.end)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
    if (storeId) q = q.eq('store_id', storeId)
    return q
  })

  // ── 2. OS abertas no período ────────────────────────────────────────────
  type OsRow = {
    id: string; status: string; created_by: string | null
    total_price_cents: number | null; service_price_cents: number | null
    parts_sale_cents: number | null; discount_cents: number | null; parts_cost_cents: number | null
  }
  const osP = fetchAll<OsRow>(() => sb.from('service_orders')
    .select('id, status, created_by, total_price_cents, service_price_cents, parts_sale_cents, discount_cents, parts_cost_cents')
    .eq('tenant_id', tenantId)
    .gte('received_at', filters.start)
    .lte('received_at', filters.end)
    .not('status', 'in', `(${CANCELLED.map(s => `"${s}"`).join(',')})`)
    .order('received_at', { ascending: true }))

  // ── 3. OS que ficaram prontas no período (execução) ─────────────────────
  type ReadyLog = { order_id: string; changed_by: string | null; created_at: string }
  const readyP = fetchAll<ReadyLog>(() => sb.from('order_status_logs')
    .select('order_id, changed_by, created_at')
    .eq('tenant_id', tenantId)
    .eq('to_status', 'ready')
    .gte('created_at', filters.start)
    .lte('created_at', filters.end)
    .order('created_at', { ascending: true }))

  const [sales, orders, readyLogs, users] = await Promise.all([
    salesP, osP, readyP, listTenantUsers(admin, tenantId),
  ])

  // Custo atual como fallback quando a venda não tem snapshot de custo
  const missingCost = new Set<string>()
  for (const s of sales) for (const i of s.sale_items ?? []) {
    if (i.cost_snapshot_cents === null && i.product_id) missingCost.add(i.product_id)
  }
  const costMap = new Map<string, number>()
  for (const ids of chunk([...missingCost], 200)) {
    const [prodRes, partRes] = await Promise.all([
      sb.from('products').select('id, cost_cents').eq('tenant_id', tenantId).in('id', ids),
      sb.from('parts_catalog').select('id, cost_cents').eq('tenant_id', tenantId).in('id', ids),
    ])
    for (const p of (prodRes.data ?? []) as { id: string; cost_cents: number | null }[]) costMap.set(p.id, p.cost_cents ?? 0)
    for (const p of (partRes.data ?? []) as { id: string; cost_cents: number | null }[]) costMap.set(p.id, p.cost_cents ?? 0)
  }

  // Última vez que cada OS ficou pronta dentro do período
  const readyByOrder = new Map<string, ReadyLog>()
  for (const l of readyLogs) readyByOrder.set(l.order_id, l)

  // Histórico completo + técnico responsável das OS finalizadas
  type LogRow    = { order_id: string; from_status: string | null; to_status: string; created_at: string }
  type FinalRow  = { id: string; assigned_to: string | null; received_at: string }
  const finishedIds = [...readyByOrder.keys()]
  const allLogs: LogRow[] = []
  const finalOrders = new Map<string, FinalRow>()
  for (const ids of chunk(finishedIds, 200)) {
    const [logsRes, ordRes] = await Promise.all([
      fetchAll<LogRow>(() => sb.from('order_status_logs')
        .select('order_id, from_status, to_status, created_at')
        .eq('tenant_id', tenantId)
        .in('order_id', ids)
        .order('created_at', { ascending: true })),
      sb.from('service_orders')
        .select('id, assigned_to, received_at')
        .eq('tenant_id', tenantId)
        .in('id', ids),
    ])
    allLogs.push(...logsRes)
    for (const o of (ordRes.data ?? []) as FinalRow[]) finalOrders.set(o.id, o)
  }
  const logsByOrder = new Map<string, LogRow[]>()
  for (const l of allLogs) {
    const list = logsByOrder.get(l.order_id)
    if (list) list.push(l)
    else logsByOrder.set(l.order_id, [l])
  }

  // ── Agregação por colaborador ───────────────────────────────────────────
  const userById = new Map(users.map(u => [u.id, u]))
  const rows = new Map<string, TeamMemberPerformance>()
  const NONE = '__none__'

  function rowFor(userId: string | null): TeamMemberPerformance {
    const key = userId ?? NONE
    let r = rows.get(key)
    if (!r) {
      const u = userId ? userById.get(userId) : undefined
      r = u
        ? emptyRow(u.id, displayName(u), u.email ?? null, (u.app_metadata?.tenant_role as string) ?? null)
        : emptyRow(userId, userId ? 'Ex-colaborador' : 'Sem colaborador', null, null)
      rows.set(key, r)
    }
    return r
  }

  // Todo membro aparece, mesmo zerado
  for (const u of users) rowFor(u.id)

  for (const s of sales) {
    const total = s.total_cents ?? 0
    const cost = (s.sale_items ?? []).reduce((sum, i) => {
      const c = i.cost_snapshot_cents ?? (i.product_id ? (costMap.get(i.product_id) ?? 0) : 0)
      return sum + (i.quantity ?? 0) * c
    }, 0)
    const r = rowFor(s.user_id)
    r.salesCount++
    r.salesRevenueCents += total
    r.salesProfitCents  += total - cost
  }

  for (const o of orders) {
    const r = rowFor(o.created_by)
    r.osOpenedCount++
    if (DELIVERED.has(o.status)) {
      const total = o.total_price_cents
        || Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
      r.osDeliveredCount++
      r.osRevenueCents += total
      r.osProfitCents  += total - (o.parts_cost_cents ?? 0)
    }
  }

  for (const [orderId, ready] of readyByOrder) {
    const order = finalOrders.get(orderId)
    if (!order) continue   // OS excluída
    const r = rowFor(order.assigned_to ?? ready.changed_by)
    r.repairsCount++

    // Soma o tempo em diagnóstico/reparo até o "Pronto" considerado
    const readyAt = new Date(ready.created_at).getTime()
    const logs = logsByOrder.get(orderId) ?? []
    let status = logs[0]?.from_status ?? 'received'
    let since  = new Date(order.received_at).getTime()
    let ms = 0
    for (const l of logs) {
      const t = new Date(l.created_at).getTime()
      if (t > readyAt) break
      if (WORK_STATUSES.has(status)) ms += Math.max(0, t - since)
      status = l.to_status
      since  = t
    }
    const minutes = Math.round(ms / 60000)
    if (minutes > 0) {
      r.serviceMinutes += minutes
      r.repairsWithTime++
    }
  }

  let members = [...rows.values()].map(r => ({
    ...r,
    totalCount:        r.salesCount + r.osDeliveredCount,
    totalRevenueCents: r.salesRevenueCents + r.osRevenueCents,
    totalProfitCents:  r.salesProfitCents + r.osProfitCents,
  }))

  // Remove linhas "sem colaborador" / ex-colaborador zeradas
  members = members.filter(m =>
    (m.userId && userById.has(m.userId)) ||
    m.salesCount + m.osOpenedCount + m.repairsCount > 0,
  )

  if (!canViewAll) members = members.filter(m => m.userId === user.id)

  members.sort((a, b) =>
    b.totalRevenueCents - a.totalRevenueCents ||
    b.repairsCount - a.repairsCount ||
    a.name.localeCompare(b.name, 'pt-BR'),
  )

  const totals = members.reduce((t, m) => ({
    salesCount:        t.salesCount        + m.salesCount,
    salesRevenueCents: t.salesRevenueCents + m.salesRevenueCents,
    salesProfitCents:  t.salesProfitCents  + m.salesProfitCents,
    osOpenedCount:     t.osOpenedCount     + m.osOpenedCount,
    osDeliveredCount:  t.osDeliveredCount  + m.osDeliveredCount,
    osRevenueCents:    t.osRevenueCents    + m.osRevenueCents,
    osProfitCents:     t.osProfitCents     + m.osProfitCents,
    repairsCount:      t.repairsCount      + m.repairsCount,
    serviceMinutes:    t.serviceMinutes    + m.serviceMinutes,
    repairsWithTime:   t.repairsWithTime   + m.repairsWithTime,
    totalCount:        t.totalCount        + m.totalCount,
    totalRevenueCents: t.totalRevenueCents + m.totalRevenueCents,
    totalProfitCents:  t.totalProfitCents  + m.totalProfitCents,
  }), {
    salesCount: 0, salesRevenueCents: 0, salesProfitCents: 0,
    osOpenedCount: 0, osDeliveredCount: 0, osRevenueCents: 0, osProfitCents: 0,
    repairsCount: 0, serviceMinutes: 0, repairsWithTime: 0,
    totalCount: 0, totalRevenueCents: 0, totalProfitCents: 0,
  })

  return { canViewAll, members, totals }
}
