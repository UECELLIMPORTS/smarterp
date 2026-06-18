import { requireAuth } from '@/lib/supabase/server'
import { getTenantSubscriptions, canAccess } from '@/lib/subscription'
import { UpgradeBlock } from '@/components/upgrade-block'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Settings, TrendingUp } from 'lucide-react'
import {
  getMetaAdsCredentials,
  fetchMetaAdsInsights,
  fetchMetaAdsCampaigns,
  fetchAdAccountHealth,
  fetchInsightsMultiAccount,
  listAdAccounts,
  type MetaAdsPeriod,
  type MetaAdsInsights,
  type MetaAdsCampaign,
  type MetaAdsAdAccount,
  type MetaAdsAccountHealth,
} from '@/actions/meta-ads'
import { countUnreadAlerts } from '@/actions/meta-ads-alerts'
import { MetaAdsDashboard } from './meta-ads-dashboard'

export const metadata = { title: 'Meta Ads — Smart ERP' }

// Campanha com a conta de origem anexada (essencial no modo consolidado pra
// saber em qual conta pausar/ajustar e exibir o badge da conta).
export type DashboardCampaign = MetaAdsCampaign & {
  adAccountId: string
  accountName: string
}

// Detalhe por conta no modo consolidado.
export type AccountBreakdownItem = {
  adAccountId: string
  displayName: string
  insights:    MetaAdsInsights | null
  health:      MetaAdsAccountHealth | null
  error:       string | null
}

export type OriginTotals = {
  igPagoCents:   number
  igOrgCents:    number
  facebookCents: number
  txCount:       number
}

export type CampaignCodeTotal = {
  code:          string
  revenueCents:  number
  profitCents:   number
  customerCount: number
  txCount:       number
}

export type DirectCampaignTotal = {
  campaignId:   string
  campaignName: string
  revenueCents: number
  profitCents:  number
  txCount:      number
}

async function getIgFacebookRevenue(tenantId: string, sinceIso: string): Promise<OriginTotals> {
  const { supabase } = await requireAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [salesRes, osRes] = await Promise.all([
    sb.from('sales')
      .select('total_cents, customers!inner(origin)')
      .eq('tenant_id', tenantId)
      .gte('created_at', sinceIso)
      .neq('status', 'cancelled')
      .in('customers.origin', ['instagram_pago', 'instagram_organico', 'facebook'])
      .limit(5000),
    sb.from('service_orders')
      .select('total_price_cents, service_price_cents, parts_sale_cents, discount_cents, customers!inner(origin)')
      .eq('tenant_id', tenantId)
      .gte('received_at', sinceIso)
      .in('status', ['delivered', 'Entregue'])
      .in('customers.origin', ['instagram_pago', 'instagram_organico', 'facebook'])
      .limit(5000),
  ])

  const totals: OriginTotals = { igPagoCents: 0, igOrgCents: 0, facebookCents: 0, txCount: 0 }
  type SaleRow = { total_cents: number; customers: { origin: string } }
  type OsRow   = { total_price_cents: number|null; service_price_cents: number|null; parts_sale_cents: number|null; discount_cents: number|null; customers: { origin: string } }

  for (const s of (salesRes.data ?? []) as SaleRow[]) {
    const origin = s.customers?.origin
    const v = s.total_cents ?? 0
    if (origin === 'instagram_pago')     totals.igPagoCents   += v
    if (origin === 'instagram_organico') totals.igOrgCents    += v
    if (origin === 'facebook')           totals.facebookCents += v
    totals.txCount++
  }
  for (const o of (osRes.data ?? []) as OsRow[]) {
    const origin = o.customers?.origin
    const v = o.total_price_cents
      ?? Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
    if (origin === 'instagram_pago')     totals.igPagoCents   += v
    if (origin === 'instagram_organico') totals.igOrgCents    += v
    if (origin === 'facebook')           totals.facebookCents += v
    totals.txCount++
  }
  return totals
}

async function getRevenueByCampaignCode(tenantId: string, sinceIso: string): Promise<CampaignCodeTotal[]> {
  const { supabase } = await requireAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [salesRes, osRes] = await Promise.all([
    sb.from('sales')
      .select('customer_id, total_cents, customers!inner(campaign_code), sale_items(quantity, product_id, cost_snapshot_cents)')
      .eq('tenant_id', tenantId)
      .gte('created_at', sinceIso)
      .neq('status', 'cancelled')
      .not('customers.campaign_code', 'is', null)
      .limit(5000),
    sb.from('service_orders')
      .select('customer_id, total_price_cents, service_price_cents, parts_sale_cents, parts_cost_cents, discount_cents, customers!inner(campaign_code)')
      .eq('tenant_id', tenantId)
      .gte('received_at', sinceIso)
      .in('status', ['delivered', 'Entregue'])
      .not('customers.campaign_code', 'is', null)
      .limit(5000),
  ])

  type SaleItem = { quantity: number; product_id: string | null; cost_snapshot_cents: number | null }
  type SaleRow  = { customer_id: string; total_cents: number; customers: { campaign_code: string }; sale_items: SaleItem[] | null }
  type OsRow    = { customer_id: string; total_price_cents: number|null; service_price_cents: number|null; parts_sale_cents: number|null; parts_cost_cents: number|null; discount_cents: number|null; customers: { campaign_code: string } }

  // Busca custo atual dos produtos sem snapshot
  const productIdsToFetch = new Set<string>()
  for (const s of (salesRes.data ?? []) as SaleRow[]) {
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

  const byCode = new Map<string, { revenueCents: number; profitCents: number; customerIds: Set<string>; txCount: number }>()
  const bump = (code: string, customerId: string, revenue: number, profit: number) => {
    const bucket = byCode.get(code) ?? { revenueCents: 0, profitCents: 0, customerIds: new Set<string>(), txCount: 0 }
    bucket.revenueCents += revenue
    bucket.profitCents  += profit
    bucket.customerIds.add(customerId)
    bucket.txCount++
    byCode.set(code, bucket)
  }

  for (const s of (salesRes.data ?? []) as SaleRow[]) {
    const code = s.customers?.campaign_code
    if (!code) continue
    const revenue = s.total_cents ?? 0
    let cost = 0
    for (const it of (s.sale_items ?? [])) {
      const qty  = it.quantity ?? 0
      const unit = it.cost_snapshot_cents ?? (it.product_id ? (costMap.get(it.product_id) ?? 0) : 0)
      cost += qty * unit
    }
    bump(code, s.customer_id, revenue, revenue - cost)
  }
  for (const o of (osRes.data ?? []) as OsRow[]) {
    const code = o.customers?.campaign_code
    if (!code) continue
    const revenue = o.total_price_cents
      ?? Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
    const profit  = revenue - (o.parts_cost_cents ?? 0)
    bump(code, o.customer_id, revenue, profit)
  }

  return Array.from(byCode.entries())
    .map(([code, b]) => ({
      code,
      revenueCents:  b.revenueCents,
      profitCents:   b.profitCents,
      customerCount: b.customerIds.size,
      txCount:       b.txCount,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
}

async function getDirectCampaignAttribution(tenantId: string, sinceIso: string): Promise<DirectCampaignTotal[]> {
  const { supabase } = await requireAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [salesRes, osRes] = await Promise.all([
    sb.from('sales')
      .select('meta_campaign_id, meta_campaign_name, total_cents, sale_items(quantity, product_id, cost_snapshot_cents)')
      .eq('tenant_id', tenantId)
      .gte('created_at', sinceIso)
      .neq('status', 'cancelled')
      .not('meta_campaign_id', 'is', null)
      .limit(5000),
    sb.from('service_orders')
      .select('meta_campaign_id, meta_campaign_name, total_price_cents, service_price_cents, parts_sale_cents, parts_cost_cents, discount_cents')
      .eq('tenant_id', tenantId)
      .gte('received_at', sinceIso)
      .in('status', ['delivered', 'Entregue'])
      .not('meta_campaign_id', 'is', null)
      .limit(5000),
  ])

  type SaleItem   = { quantity: number; product_id: string | null; cost_snapshot_cents: number | null }
  type SaleRow    = { meta_campaign_id: string; meta_campaign_name: string | null; total_cents: number; sale_items: SaleItem[] | null }
  type OsRow      = { meta_campaign_id: string; meta_campaign_name: string | null; total_price_cents: number|null; service_price_cents: number|null; parts_sale_cents: number|null; parts_cost_cents: number|null; discount_cents: number|null }

  const productIdsToFetch = new Set<string>()
  for (const s of (salesRes.data ?? []) as SaleRow[]) {
    for (const it of (s.sale_items ?? [])) {
      if (it.cost_snapshot_cents == null && it.product_id) productIdsToFetch.add(it.product_id)
    }
  }
  const costMap = new Map<string, number>()
  if (productIdsToFetch.size > 0) {
    const { data: prodData } = await sb
      .from('products').select('id, cost_cents').eq('tenant_id', tenantId).in('id', Array.from(productIdsToFetch))
    for (const p of (prodData ?? []) as { id: string; cost_cents: number | null }[]) {
      costMap.set(p.id, p.cost_cents ?? 0)
    }
  }

  const byCampaign = new Map<string, { campaignName: string; revenueCents: number; profitCents: number; txCount: number }>()
  const bump = (id: string, name: string, revenue: number, profit: number) => {
    const b = byCampaign.get(id) ?? { campaignName: name, revenueCents: 0, profitCents: 0, txCount: 0 }
    b.revenueCents += revenue
    b.profitCents  += profit
    b.txCount++
    byCampaign.set(id, b)
  }

  for (const s of (salesRes.data ?? []) as SaleRow[]) {
    if (!s.meta_campaign_id) continue
    const revenue = s.total_cents ?? 0
    let cost = 0
    for (const it of (s.sale_items ?? [])) {
      const qty  = it.quantity ?? 0
      const unit = it.cost_snapshot_cents ?? (it.product_id ? (costMap.get(it.product_id) ?? 0) : 0)
      cost += qty * unit
    }
    bump(s.meta_campaign_id, s.meta_campaign_name ?? s.meta_campaign_id, revenue, revenue - cost)
  }
  for (const o of (osRes.data ?? []) as OsRow[]) {
    if (!o.meta_campaign_id) continue
    const revenue = o.total_price_cents
      ?? Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
    const profit  = revenue - (o.parts_cost_cents ?? 0)
    bump(o.meta_campaign_id, o.meta_campaign_name ?? o.meta_campaign_id, revenue, profit)
  }

  return Array.from(byCampaign.entries())
    .map(([campaignId, b]) => ({
      campaignId,
      campaignName: b.campaignName,
      revenueCents: b.revenueCents,
      profitCents:  b.profitCents,
      txCount:      b.txCount,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents)
}

function periodToIso(period: MetaAdsPeriod): string {
  const now = new Date()
  if (period === 'today') { now.setHours(0, 0, 0, 0); return now.toISOString() }
  if (period === 'yesterday') {
    const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  const days = period === '7d' ? 6 : period === '30d' ? 29 : 89
  now.setDate(now.getDate() - days); now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

function resolveSelectedAccount(
  accounts: MetaAdsAdAccount[],
  requested: string | undefined,
): MetaAdsAdAccount | null {
  if (accounts.length === 0) return null
  const active = accounts.filter(a => a.isActive)
  if (active.length === 0) return null
  if (requested) {
    const normalized = requested.startsWith('act_') ? requested : `act_${requested}`
    const match = active.find(a => a.adAccountId === normalized)
    if (match) return match
  }
  return active.find(a => a.isPrimary) ?? active[0]
}

export default async function MetaAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; account?: string }>
}) {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const { user } = auth

  // Gate: Meta Ads é Premium (ou subscription dedicada de meta_ads)
  const subs = await getTenantSubscriptions(user)
  if (!canAccess(subs, 'meta_ads')) {
    return <UpgradeBlock feature="meta_ads" pageTitle="Meta Ads" />
  }

  const tenantId = getTenantId(user)

  const { period: rawPeriod = '30d', account: rawAccount } = await searchParams
  const period = (['7d', '30d', '90d', 'today', 'yesterday'].includes(rawPeriod)
    ? rawPeriod
    : '30d') as MetaAdsPeriod

  const credentials = await getMetaAdsCredentials()

  if (!credentials) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#F8FAFC' }}>Meta Ads</h1>
          <p className="mt-1 text-sm" style={{ color: '#94A3B8' }}>
            Dashboard de campanhas do Meta (Facebook + Instagram)
          </p>
        </div>

        <div
          className="rounded-2xl border p-10 text-center"
          style={{ background: '#1B2638', borderColor: '#2A3650' }}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #E4405F22, #1877F222)', border: '1px solid #2A3650' }}>
            <TrendingUp className="h-8 w-8" style={{ color: '#E4405F' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: '#F8FAFC' }}>Configure o Meta Ads</h2>
          <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: '#CBD5E1' }}>
            Conecte sua conta Meta Business para ver gastos, métricas de campanha e calcular o ROAS real cruzado com as vendas do seu ERP.
          </p>
          <Link
            href="/meta-ads/configuracoes"
            className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #22C55E, #10B981)' }}
          >
            <Settings className="h-4 w-4" />
            Configurar credenciais
          </Link>
          <p className="mt-6 text-xs" style={{ color: '#94A3B8' }}>
            Leva ~15 minutos — a gente te guia passo a passo
          </p>
        </div>
      </div>
    )
  }

  const accounts = await listAdAccounts().catch(() => [] as MetaAdsAdAccount[])
  const activeAccounts = accounts.filter(a => a.isActive)

  // Modo consolidado: padrão quando há 2+ contas ativas e nenhuma específica
  // foi pedida (ou quando o usuário pede explicitamente `account=all`).
  const isAggregate = activeAccounts.length > 1 && (rawAccount === 'all' || rawAccount === undefined)
  const selectedAccount = isAggregate ? null : resolveSelectedAccount(accounts, rawAccount)

  let insights: MetaAdsInsights | null = null
  let campaigns: DashboardCampaign[] = []
  let loadError: string | null = null
  let accountHealth: MetaAdsAccountHealth | null = null
  let accountBreakdown: AccountBreakdownItem[] = []
  // Saúde por conta — usada pra bloquear mutações por campanha no consolidado.
  const healthByAccount: Record<string, MetaAdsAccountHealth | null> = {}

  if (isAggregate) {
    const ids = activeAccounts.map(a => a.adAccountId)
    const [insightsMulti, campaignsSettled, healthSettled] = await Promise.all([
      fetchInsightsMultiAccount(period, ids),
      Promise.allSettled(activeAccounts.map(a => fetchMetaAdsCampaigns(period, a.adAccountId))),
      Promise.allSettled(activeAccounts.map(a => fetchAdAccountHealth(a.adAccountId))),
    ])
    insights = insightsMulti.combined

    accountBreakdown = activeAccounts.map((acc, i) => {
      const camps  = campaignsSettled[i].status === 'fulfilled' ? campaignsSettled[i].value : []
      const health = healthSettled[i].status === 'fulfilled' ? healthSettled[i].value : null
      healthByAccount[acc.adAccountId] = health
      for (const c of camps) {
        campaigns.push({ ...c, adAccountId: acc.adAccountId, accountName: acc.displayName })
      }
      const per = insightsMulti.perAccount.find(p => p.adAccountId === acc.adAccountId)
      return {
        adAccountId: acc.adAccountId,
        displayName: acc.displayName,
        insights:    per?.insights ?? null,
        health,
        error:       per?.error ?? null,
      }
    })

    const firstErr = insightsMulti.perAccount.find(p => p.error)?.error
    if (firstErr) loadError = firstErr
  } else if (selectedAccount) {
    const acc = selectedAccount
    // Promise.allSettled: se uma falha, não derruba a outra.
    const [insightsRes, campaignsRes, healthRes] = await Promise.allSettled([
      fetchMetaAdsInsights(period, acc.adAccountId),
      fetchMetaAdsCampaigns(period, acc.adAccountId),
      fetchAdAccountHealth(acc.adAccountId),
    ])

    if (insightsRes.status === 'fulfilled') {
      insights = insightsRes.value
    } else {
      loadError = insightsRes.reason instanceof Error ? insightsRes.reason.message : 'Erro ao carregar insights'
    }

    if (campaignsRes.status === 'fulfilled') {
      campaigns = campaignsRes.value.map(c => ({ ...c, adAccountId: acc.adAccountId, accountName: acc.displayName }))
    } else if (!loadError) {
      loadError = campaignsRes.reason instanceof Error ? campaignsRes.reason.message : 'Erro ao carregar campanhas'
    }

    if (healthRes.status === 'fulfilled') {
      accountHealth = healthRes.value
    }
    healthByAccount[acc.adAccountId] = accountHealth
  } else {
    loadError = 'Nenhuma conta de anúncios ativa. Cadastre uma em Configurações.'
  }

  const sinceIso = periodToIso(period)
  const [origins, campaignCodeTotals, directCampaignTotals, unreadAlerts] = await Promise.all([
    getIgFacebookRevenue(tenantId, sinceIso),
    getRevenueByCampaignCode(tenantId, sinceIso),
    getDirectCampaignAttribution(tenantId, sinceIso),
    countUnreadAlerts().catch(() => 0),
  ])

  return (
    <MetaAdsDashboard
      period={period}
      accounts={accounts}
      selectedAccount={selectedAccount}
      isAggregate={isAggregate}
      accountBreakdown={accountBreakdown}
      healthByAccount={healthByAccount}
      accountHealth={accountHealth}
      insights={insights}
      campaigns={campaigns}
      loadError={loadError}
      originRevenue={origins}
      campaignCodeTotals={campaignCodeTotals}
      directCampaignTotals={directCampaignTotals}
      unreadAlertsCount={unreadAlerts}
    />
  )
}
