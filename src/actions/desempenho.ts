'use server'

/**
 * Desempenho da equipe — base para comissão de técnicos e atendentes.
 * Gestão Smart (PDV) + CheckSmart (OS) compartilham o mesmo banco.
 *
 *  - Serviços (técnico): OS ENTREGUES no período (delivered_at), crédito do
 *    técnico responsável (service_orders.assigned_to). OS antigas sem técnico
 *    caem em "Sem técnico" para o dono corrigir no CheckSmart antes de pagar.
 *  - Atendimento: crédito de quem ABRIU a OS (service_orders.created_by).
 *    "Abertas" = OS com entrada no período; faturamento/lucro = OS abertas por
 *    ele que foram ENTREGUES no período (mesma base dos técnicos).
 *  - Vendas PDV: crédito de quem registrou a venda (sales.user_id).
 *  - Retornos: OS de retorno abertas no período, creditadas ao técnico do
 *    serviço original (parent_order_id → assigned_to). A OS de retorno não
 *    conta como serviço nem atendimento novo — só o valor, se cobrado.
 *  - Horas de serviço: tempo em "Em diagnóstico"/"Em reparo" pelo histórico de
 *    status (order_status_logs). Só existe para OS movimentadas a partir de
 *    16/11/2026 — antes o histórico não era gravado.
 *
 * Visibilidade: dono, gerente e quem tem 'equipe:relatorio' veem todos. Os
 * demais recebem só a própria linha e as OS em que são atendente ou técnico.
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

  // Vendas do PDV
  salesCount:        number
  salesRevenueCents: number
  salesProfitCents:  number

  // Atendimento (abriu a OS)
  osOpenedCount:     number        // OS com entrada no período (exceto canceladas)
  osDeliveredCount:  number        // OS abertas por ele e entregues no período
  osRevenueCents:    number
  osProfitCents:     number

  // Execução (técnico responsável)
  repairsCount:        number      // serviços entregues no período
  repairsRevenueCents: number
  repairsProfitCents:  number
  serviceMinutes:      number
  repairsWithTime:     number
  returnsCount:        number      // retornos abertos no período de serviços feitos por ele

  // Atendimento + PDV (o que o colaborador vendeu)
  totalCount:        number
  totalRevenueCents: number
  totalProfitCents:  number
}

/** Uma OS entregue no período — linha da lista detalhada (base da comissão). */
export type ServiceLine = {
  orderId:      string
  orderNumber:  string
  receivedAt:   string
  deliveredAt:  string
  customer:     string | null
  device:       string
  totalCents:   number
  profitCents:  number
  attendantId:  string | null
  technicianId: string | null
  minutes:      number
  isReturn:     boolean
}

/** OS de retorno aberta no período — creditada ao técnico do serviço original. */
export type ReturnLine = {
  orderId:          string
  orderNumber:      string
  receivedAt:       string
  status:           string
  customer:         string | null
  device:           string
  reason:           string | null
  parentId:         string | null
  parentNumber:     string | null
  parentDeliveredAt: string | null
  technicianId:     string | null   // técnico do serviço original
}

export type TeamPerformanceData = {
  canViewAll: boolean
  members:    TeamMemberPerformance[]
  totals:     Omit<TeamMemberPerformance, 'userId' | 'name' | 'email' | 'role'>
  services:   ServiceLine[]
  returns:    ReturnLine[]
  /** id → nome, para atendente/técnico da lista detalhada */
  people:     Record<string, string>
  checksmartUrl: string
}

const WORK_STATUSES = new Set(['diagnosing', 'in_repair'])
const CANCELLED     = ['cancelled', 'Cancelado', 'Cancelada']
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
    repairsCount: 0, repairsRevenueCents: 0, repairsProfitCents: 0, serviceMinutes: 0, repairsWithTime: 0, returnsCount: 0,
    totalCount: 0, totalRevenueCents: 0, totalProfitCents: 0,
  }
}

function orderTotal(o: {
  total_price_cents: number | null; service_price_cents: number | null
  parts_sale_cents: number | null; discount_cents: number | null
}): number {
  return o.total_price_cents
    || Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
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

  // ── 2. OS abertas no período (só contagem por atendente) ────────────────
  type OpenedRow = { created_by: string | null; is_return: boolean | null }
  const openedP = fetchAll<OpenedRow>(() => sb.from('service_orders')
    .select('created_by, is_return')
    .eq('tenant_id', tenantId)
    .gte('received_at', filters.start)
    .lte('received_at', filters.end)
    .not('status', 'in', `(${CANCELLED.map(s => `"${s}"`).join(',')})`)
    .order('received_at', { ascending: true }))

  // ── 3. OS entregues no período (base da comissão) ───────────────────────
  type DeliveredRow = {
    id: string; order_number: string; received_at: string; delivered_at: string
    created_by: string | null; assigned_to: string | null; is_return: boolean | null
    brand_name: string | null; model_name: string | null
    total_price_cents: number | null; service_price_cents: number | null
    parts_sale_cents: number | null; discount_cents: number | null; parts_cost_cents: number | null
    customers: { full_name: string | null } | null
  }
  const deliveredP = fetchAll<DeliveredRow>(() => sb.from('service_orders')
    .select(`id, order_number, received_at, delivered_at, created_by, assigned_to, is_return,
      brand_name, model_name, total_price_cents, service_price_cents, parts_sale_cents,
      discount_cents, parts_cost_cents, customers(full_name)`)
    .eq('tenant_id', tenantId)
    .eq('status', 'delivered')
    .gte('delivered_at', filters.start)
    .lte('delivered_at', filters.end)
    .order('delivered_at', { ascending: true }))

  // ── 4. OS de retorno abertas no período ────────────────────────────────
  type ReturnRow = {
    id: string; order_number: string; received_at: string; status: string
    reported_issue: string | null; parent_order_id: string | null
    brand_name: string | null; model_name: string | null
    customers: { full_name: string | null } | null
  }
  const returnsP = fetchAll<ReturnRow>(() => sb.from('service_orders')
    .select('id, order_number, received_at, status, reported_issue, parent_order_id, brand_name, model_name, customers(full_name)')
    .eq('tenant_id', tenantId)
    .eq('is_return', true)
    .gte('received_at', filters.start)
    .lte('received_at', filters.end)
    .not('status', 'in', `(${CANCELLED.map(s => `"${s}"`).join(',')})`)
    .order('received_at', { ascending: true }))

  const [sales, opened, delivered, returnRows, users] = await Promise.all([
    salesP, openedP, deliveredP, returnsP, listTenantUsers(admin, tenantId),
  ])

  // OS originais dos retornos (técnico que fez o serviço)
  type ParentRow = { id: string; order_number: string; assigned_to: string | null; delivered_at: string | null }
  const parents = new Map<string, ParentRow>()
  for (const ids of chunk([...new Set(returnRows.map(r => r.parent_order_id).filter(Boolean))] as string[], 200)) {
    const { data } = await sb.from('service_orders')
      .select('id, order_number, assigned_to, delivered_at')
      .eq('tenant_id', tenantId)
      .in('id', ids)
    for (const p of (data ?? []) as ParentRow[]) parents.set(p.id, p)
  }

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

  // Histórico de status das OS entregues (horas + fallback de técnico)
  type LogRow = { order_id: string; from_status: string | null; to_status: string; changed_by: string | null; created_at: string }
  const logsByOrder = new Map<string, LogRow[]>()
  for (const ids of chunk(delivered.map(o => o.id), 200)) {
    const logs = await fetchAll<LogRow>(() => sb.from('order_status_logs')
      .select('order_id, from_status, to_status, changed_by, created_at')
      .eq('tenant_id', tenantId)
      .in('order_id', ids)
      .order('created_at', { ascending: true }))
    for (const l of logs) {
      const list = logsByOrder.get(l.order_id)
      if (list) list.push(l)
      else logsByOrder.set(l.order_id, [l])
    }
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

  // Retorno não é atendimento novo
  for (const o of opened) if (!o.is_return) rowFor(o.created_by).osOpenedCount++

  const services: ServiceLine[] = []
  for (const o of delivered) {
    const total  = orderTotal(o)
    const profit = total - (o.parts_cost_cents ?? 0)
    const logs   = logsByOrder.get(o.id) ?? []

    // Técnico: responsável da OS; senão quem marcou "Pronto" (histórico novo)
    const lastReady  = [...logs].reverse().find(l => l.to_status === 'ready')
    const technician = o.assigned_to ?? lastReady?.changed_by ?? null

    // Horas: tempo em diagnóstico/reparo até o último "Pronto" (ou entrega)
    const endAt = new Date(lastReady?.created_at ?? o.delivered_at).getTime()
    let status = logs[0]?.from_status ?? 'received'
    let since  = new Date(o.received_at).getTime()
    let ms = 0
    for (const l of logs) {
      const t = new Date(l.created_at).getTime()
      if (t > endAt) break
      if (WORK_STATUSES.has(status)) ms += Math.max(0, t - since)
      status = l.to_status
      since  = t
    }
    const minutes = Math.round(ms / 60000)

    // Retorno não conta como serviço/atendimento novo (só o valor, se cobrado)
    const isReturn = !!o.is_return
    const att = rowFor(o.created_by)
    if (!isReturn) att.osDeliveredCount++
    att.osRevenueCents += total
    att.osProfitCents  += profit

    const tech = technician ? rowFor(technician) : rowFor(null)
    if (!isReturn) tech.repairsCount++
    tech.repairsRevenueCents += total
    tech.repairsProfitCents  += profit
    if (minutes > 0) {
      tech.serviceMinutes += minutes
      tech.repairsWithTime++
    }

    services.push({
      orderId:      o.id,
      orderNumber:  o.order_number,
      receivedAt:   o.received_at,
      deliveredAt:  o.delivered_at,
      customer:     o.customers?.full_name ?? null,
      device:       [o.brand_name, o.model_name].filter(Boolean).join(' ') || '—',
      totalCents:   total,
      profitCents:  profit,
      attendantId:  o.created_by,
      technicianId: technician,
      minutes,
      isReturn,
    })
  }

  const returns: ReturnLine[] = returnRows.map(r => {
    const parent = r.parent_order_id ? parents.get(r.parent_order_id) : undefined
    const technicianId = parent?.assigned_to ?? null
    rowFor(technicianId).returnsCount++
    return {
      orderId:           r.id,
      orderNumber:       r.order_number,
      receivedAt:        r.received_at,
      status:            r.status,
      customer:          r.customers?.full_name ?? null,
      device:            [r.brand_name, r.model_name].filter(Boolean).join(' ') || '—',
      reason:            r.reported_issue,
      parentId:          parent?.id ?? null,
      parentNumber:      parent?.order_number ?? null,
      parentDeliveredAt: parent?.delivered_at ?? null,
      technicianId,
    }
  })

  let members = [...rows.values()].map(r => ({
    ...r,
    totalCount:        r.salesCount + r.osDeliveredCount,
    totalRevenueCents: r.salesRevenueCents + r.osRevenueCents,
    totalProfitCents:  r.salesProfitCents + r.osProfitCents,
  }))

  // Remove linhas "sem colaborador" / ex-colaborador zeradas
  members = members.filter(m =>
    (m.userId && userById.has(m.userId)) ||
    m.salesCount + m.osOpenedCount + m.osDeliveredCount + m.repairsCount + m.returnsCount > 0,
  )

  let visibleServices = services
  let visibleReturns  = returns
  if (!canViewAll) {
    members = members.filter(m => m.userId === user.id)
    visibleServices = services.filter(s => s.attendantId === user.id || s.technicianId === user.id)
    visibleReturns  = returns.filter(r => r.technicianId === user.id)
  }

  members.sort((a, b) =>
    b.totalRevenueCents + b.repairsRevenueCents - (a.totalRevenueCents + a.repairsRevenueCents) ||
    a.name.localeCompare(b.name, 'pt-BR'),
  )

  const totals = {
    salesCount: 0, salesRevenueCents: 0, salesProfitCents: 0,
    osOpenedCount: 0, osDeliveredCount: 0, osRevenueCents: 0, osProfitCents: 0,
    repairsCount: 0, repairsRevenueCents: 0, repairsProfitCents: 0, serviceMinutes: 0, repairsWithTime: 0, returnsCount: 0,
    totalCount: 0, totalRevenueCents: 0, totalProfitCents: 0,
  }
  for (const m of members) {
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += m[k]
  }

  const people: Record<string, string> = {}
  for (const u of users) people[u.id] = displayName(u)

  return {
    canViewAll,
    members,
    totals,
    services: visibleServices,
    returns:  visibleReturns,
    people,
    checksmartUrl: 'https://checksmart.gestaosmarterp.online',
  }
}
