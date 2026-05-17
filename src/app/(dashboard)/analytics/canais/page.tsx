import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getChannelAnalytics, getOriginAnalytics, getInferredOriginAnalytics,
  getOriginChannelMatrix, getCacByChannel,
  type ChannelAnalyticsPeriod,
} from '@/actions/sales-channels'
import { getMonthlyFixedCostCents } from '@/actions/recurring-expenses'
import { listStores } from '@/actions/stores'
import { CanaisClient } from './canais-client'
import { getTenantSubscriptions, canAccess } from '@/lib/subscription'
import { UpgradeBlock } from '@/components/upgrade-block'

export const metadata = { title: 'Canais — Smart ERP' }
export const dynamic = 'force-dynamic'

const VALID_PERIODS: ChannelAnalyticsPeriod[] = ['7d', '30d', '90d', '180d', '365d', 'all']

export default async function CanaisPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; store?: string }>
}) {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  // Gate: Canais é Pro+
  const subs = await getTenantSubscriptions(auth.user)
  if (!canAccess(subs, 'canais')) {
    return <UpgradeBlock feature="canais" pageTitle="Análise de Canais" />
  }

  const { period: rawPeriod = '30d', store: storeParam } = await searchParams
  const period = (VALID_PERIODS as string[]).includes(rawPeriod)
    ? (rawPeriod as ChannelAnalyticsPeriod)
    : '30d'

  const stores = await listStores()
  const activeStoreId = (storeParam && storeParam !== 'all' && stores.find(s => s.id === storeParam))
    ? storeParam
    : null

  const [data, monthlyFixedCostCents, origins, inferredOrigins, originChannelMatrix, cac] = await Promise.all([
    getChannelAnalytics(period, activeStoreId),
    getMonthlyFixedCostCents(),  // soma despesas detalhadas (fallback pro campo antigo)
    getOriginAnalytics(period, activeStoreId),
    getInferredOriginAnalytics(period, activeStoreId),
    getOriginChannelMatrix(period, activeStoreId),
    getCacByChannel(period, activeStoreId),
  ])

  return (
    <CanaisClient
      data={data}
      origins={origins}
      inferredOrigins={inferredOrigins}
      originChannelMatrix={originChannelMatrix}
      cac={cac}
      fixedCostMonthlyCents={monthlyFixedCostCents > 0 ? monthlyFixedCostCents : null}
      stores={stores}
      activeStoreId={activeStoreId}
    />
  )
}
