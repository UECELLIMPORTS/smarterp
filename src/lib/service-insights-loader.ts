/**
 * Busca as OS do período (exceto canceladas) com bairro do cliente e peças,
 * no formato que buildServiceInsights espera. Server-only.
 */
import { buildServiceInsights, type InsightOrder, type ServiceInsights } from './service-insights'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any

const PAGE = 1000
const MAX_ROWS = 20000

export async function loadServiceInsights(
  sb: Client,
  tenantId: string,
  startISO: string,
  endISO?: string,
): Promise<ServiceInsights> {
  type Row = {
    id: string
    brand_name: string | null
    model_name: string | null
    reported_issue: string | null
    diagnosis: string | null
    repair_description: string | null
    customers: { address_district: string | null } | null
  }

  const rows: Row[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = sb.from('service_orders')
      .select('id, brand_name, model_name, reported_issue, diagnosis, repair_description, customers(address_district)')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .gte('received_at', startISO)
    if (endISO) q = q.lte('received_at', endISO)
    const { data, error } = await q.order('received_at', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as Row[]
    rows.push(...page)
    if (page.length < PAGE) break
  }

  const partsByOrder = new Map<string, string[]>()
  const ids = rows.map(r => r.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('order_parts')
      .select('order_id, name')
      .eq('tenant_id', tenantId)
      .in('order_id', ids.slice(i, i + 200))
    for (const p of (data ?? []) as { order_id: string; name: string | null }[]) {
      if (!p.name) continue
      const list = partsByOrder.get(p.order_id)
      if (list) list.push(p.name)
      else partsByOrder.set(p.order_id, [p.name])
    }
  }

  const orders: InsightOrder[] = rows.map(r => ({
    brand_name:         r.brand_name,
    model_name:         r.model_name,
    reported_issue:     r.reported_issue,
    diagnosis:          r.diagnosis,
    repair_description: r.repair_description,
    district:           r.customers?.address_district ?? null,
    parts:              partsByOrder.get(r.id) ?? [],
  }))
  return buildServiceInsights(orders)
}
