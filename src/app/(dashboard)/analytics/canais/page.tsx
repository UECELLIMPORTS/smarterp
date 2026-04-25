import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getChannelAnalytics, getOriginAnalytics, getInferredOriginAnalytics,
  getOriginChannelMatrix, getCacByChannel,
  type ChannelAnalyticsPeriod,
} from '@/actions/sales-channels'
import { getSettings } from '@/actions/settings'
import { CanaisClient } from './canais-client'

export const metadata = { title: 'Canais — Smart ERP' }

const VALID_PERIODS: ChannelAnalyticsPeriod[] = ['7d', '30d', '90d', '180d', '365d', 'all']

export default async function CanaisPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  try { await requireAuth() } catch { redirect('/login') }

  const { period: rawPeriod = '30d' } = await searchParams
  const period = (VALID_PERIODS as string[]).includes(rawPeriod)
    ? (rawPeriod as ChannelAnalyticsPeriod)
    : '30d'

  const [data, settings, origins, inferredOrigins, originChannelMatrix, cac] = await Promise.all([
    getChannelAnalytics(period),
    getSettings(),
    getOriginAnalytics(period),
    getInferredOriginAnalytics(period),
    getOriginChannelMatrix(period),
    getCacByChannel(period),
  ])

  return (
    <CanaisClient
      data={data}
      origins={origins}
      inferredOrigins={inferredOrigins}
      originChannelMatrix={originChannelMatrix}
      cac={cac}
      fixedCostMonthlyCents={settings.fisica_fixed_cost_cents}
    />
  )
}
