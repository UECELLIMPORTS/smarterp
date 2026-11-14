import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/supabase/server'
import { getTeamPerformance } from '@/actions/desempenho'
import { listStores } from '@/actions/stores'
import { DesempenhoClient } from './desempenho-client'

export const metadata = { title: 'Desempenho da equipe — Smart ERP' }

export type Period = 'hoje' | '7d' | '30d' | 'mes' | '90d' | 'custom'

function getPeriodRange(period: Period, from?: string, to?: string): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (period === 'custom' && from && to) {
    const f = new Date(from + 'T00:00:00')
    const t = new Date(to + 'T23:59:59.999')
    if (!isNaN(f.getTime()) && !isNaN(t.getTime())) return { start: f, end: t }
  }
  if (period === '7d')       start.setDate(start.getDate() - 6)
  else if (period === '30d') start.setDate(start.getDate() - 29)
  else if (period === '90d') start.setDate(start.getDate() - 89)
  else if (period === 'mes') start.setDate(1)
  else if (period !== 'hoje') start.setDate(start.getDate() - 29)
  return { start, end }
}

export default async function DesempenhoPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; store?: string }>
}) {
  try { await requireAuth() } catch { redirect('/login') }

  const params = await searchParams
  const period = (['hoje', '7d', '30d', 'mes', '90d', 'custom'].includes(params.period ?? '')
    ? params.period
    : 'mes') as Period
  const { start, end } = getPeriodRange(period, params.from, params.to)

  const stores = await listStores().catch(() => [])
  const storeParam = params.store && stores.some(s => s.id === params.store) ? params.store : 'all'

  const data = await getTeamPerformance({
    start:   start.toISOString(),
    end:     end.toISOString(),
    storeId: storeParam,
  })

  return (
    <DesempenhoClient
      data={data}
      period={period}
      from={params.from ?? null}
      to={params.to ?? null}
      store={storeParam}
      stores={stores.map(s => ({ id: s.id, name: s.name }))}
    />
  )
}
