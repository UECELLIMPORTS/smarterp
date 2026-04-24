import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Settings, TrendingUp } from 'lucide-react'
import {
  getMetaAdsCredentials,
  fetchMetaAdsInsights,
  fetchMetaAdsCampaigns,
  type MetaAdsPeriod,
  type MetaAdsInsights,
  type MetaAdsCampaign,
} from '@/actions/meta-ads'
import { MetaAdsDashboard } from './meta-ads-dashboard'

export const metadata = { title: 'Meta Ads — Smart ERP' }

export type OriginTotals = {
  igPagoCents:   number
  igOrgCents:    number
  facebookCents: number
  txCount:       number
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

export default async function MetaAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const { user } = auth
  const tenantId = getTenantId(user)

  const { period: rawPeriod = '30d' } = await searchParams
  const period = (['7d', '30d', '90d', 'today', 'yesterday'].includes(rawPeriod)
    ? rawPeriod
    : '30d') as MetaAdsPeriod

  const credentials = await getMetaAdsCredentials()

  if (!credentials) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#E8F0FE' }}>Meta Ads</h1>
          <p className="mt-1 text-sm" style={{ color: '#5A7A9A' }}>
            Dashboard de campanhas do Meta (Facebook + Instagram)
          </p>
        </div>

        <div
          className="rounded-2xl border p-10 text-center"
          style={{ background: '#111827', borderColor: '#1E2D45' }}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #E4405F22, #1877F222)', border: '1px solid #1E2D45' }}>
            <TrendingUp className="h-8 w-8" style={{ color: '#E4405F' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: '#E8F0FE' }}>Configure o Meta Ads</h2>
          <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: '#8AA8C8' }}>
            Conecte sua conta Meta Business para ver gastos, métricas de campanha e calcular o ROAS real cruzado com as vendas do seu ERP.
          </p>
          <Link
            href="/meta-ads/configuracoes"
            className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)' }}
          >
            <Settings className="h-4 w-4" />
            Configurar credenciais
          </Link>
          <p className="mt-6 text-xs" style={{ color: '#5A7A9A' }}>
            Leva ~15 minutos — a gente te guia passo a passo
          </p>
        </div>
      </div>
    )
  }

  let insights: MetaAdsInsights | null = null
  let campaigns: MetaAdsCampaign[] = []
  let loadError: string | null = null

  try {
    ;[insights, campaigns] = await Promise.all([
      fetchMetaAdsInsights(period),
      fetchMetaAdsCampaigns(period),
    ])
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Erro ao carregar dados do Meta'
  }

  const origins = await getIgFacebookRevenue(tenantId, periodToIso(period))

  return (
    <MetaAdsDashboard
      period={period}
      credentials={credentials}
      insights={insights}
      campaigns={campaigns}
      loadError={loadError}
      originRevenue={origins}
    />
  )
}
