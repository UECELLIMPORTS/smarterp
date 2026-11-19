import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/supabase/server'
import { getTeamPerformance } from '@/actions/desempenho'
import { listStores } from '@/actions/stores'
import { DesempenhoClient } from './desempenho-client'

export const metadata = { title: 'Desempenho da equipe — Smart ERP' }

export type Period = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'mes_passado' | '90d' | 'custom'

// Períodos sempre no horário de Brasília (o servidor roda em UTC). Sem horário
// de verão desde 2019, então o offset fixo -03:00 é exato.
const TZ = '-03:00'
const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** Data de "hoje" em Brasília, como Date em UTC 00:00 (só para aritmética de dias). */
function todayBR(): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  return new Date(s + 'T00:00:00Z')
}

function range(fromDay: string, toDay: string) {
  return {
    start: new Date(`${fromDay}T00:00:00${TZ}`),
    end:   new Date(`${toDay}T23:59:59.999${TZ}`),
  }
}

function getPeriodRange(period: Period, from?: string, to?: string): { start: Date; end: Date } {
  const today = todayBR()
  const daysAgo = (n: number) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - n); return ymd(d) }

  if (period === 'custom' && from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const r = range(from, to)
    if (!isNaN(r.start.getTime()) && !isNaN(r.end.getTime())) return r
  }
  if (period === 'mes_passado') {
    // Mês anterior inteiro — base da comissão paga no dia 10
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
    const last  = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0))
    return range(ymd(first), ymd(last))
  }
  if (period === 'mes') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    return range(ymd(first), ymd(today))
  }
  if (period === 'hoje') return range(ymd(today), ymd(today))
  if (period === 'ontem') return range(daysAgo(1), daysAgo(1))
  if (period === '7d')   return range(daysAgo(6), ymd(today))
  if (period === '90d')  return range(daysAgo(89), ymd(today))
  return range(daysAgo(29), ymd(today))   // 30d e fallback
}

export default async function DesempenhoPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; store?: string }>
}) {
  try { await requireAuth() } catch { redirect('/login') }

  const params = await searchParams
  const period = (['hoje', 'ontem', '7d', '30d', 'mes', 'mes_passado', '90d', 'custom'].includes(params.period ?? '')
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
