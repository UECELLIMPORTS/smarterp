// Relatório iPhone x Android — OS do CheckSmart + gasto de anúncio lançado no
// Gestão Smart (meta_ads_spend_entries). Mesmo Supabase nos dois apps.
//
// ARQUIVO IDÊNTICO em ~/checksmart e ~/smarterp (src/lib/device-report.ts).
// Ao mudar um, copie para o outro.
//
// Regras:
// - Plataforma pela marca/modelo da OS: Apple/iPhone/iPad = iOS; resto = Android.
// - OS de venda = não cancelada, não retorno, valor > 0.
// - Origem: "anúncio" = cliente com origin 'instagram_pago'; "recorrente" = cliente
//   que já tinha OS antes desta; o resto = "orgânico" (indicação, porta, etc.).
// - Cliente novo do anúncio = 1ª OS do cliente cai no período e origin = 'instagram_pago'.
// - CAC por plataforma = gasto lançado daquela plataforma ÷ clientes novos do anúncio
//   daquela plataforma. Gasto sem plataforma (ou coluna ainda não criada) conta como iOS,
//   porque até 20/11/2026 as campanhas eram quase todas "somente iOS".

export type Platform = 'ios' | 'android'
export type Source = 'pago' | 'organico' | 'recorrente'

export const PLATFORM_LABEL: Record<Platform, string> = { ios: 'iPhone (iOS)', android: 'Android' }
export const PLATFORM_COLOR: Record<Platform, string> = { ios: '#60A5FA', android: '#22C55E' }
export const SOURCE_LABEL: Record<Source, string> = {
  pago: 'Anúncio (Instagram pago)', organico: 'Cliente novo sem anúncio', recorrente: 'Cliente recorrente',
}

export type Cell = { count: number; cents: number; profit: number }

export type PlatformRow = Cell & {
  platform:     Platform
  pctCount:     number
  pctProfit:    number
  ticketCents:  number
  profitPerOs:  number
  bySource:     Record<Source, Cell>
  newPaid:      number          // clientes novos do anúncio
  spendCents:   number          // gasto de anúncio atribuído
  cacCents:     number | null   // gasto ÷ clientes novos do anúncio
  paidProfitPerOs: number       // lucro médio da OS que veio do anúncio = teto do CAC
  topModels:    { model: string; count: number }[]
}

export type DeviceReport = {
  count:        number
  cents:        number
  profit:       number
  rows:         PlatformRow[]
  months:       { month: string; ios: Cell; android: Cell }[]
  spendCents:   number
  spendSplit:   boolean        // gasto já separado por plataforma?
  spendNoPlatformCents: number // gasto sem plataforma (contado como iOS)
  ok:           boolean
}

const empty = (): Cell => ({ count: 0, cents: 0, profit: 0 })
const add = (c: Cell, cents: number, profit: number) => { c.count++; c.cents += cents; c.profit += profit }

export function platformOf(brand: string | null, model: string | null): Platform {
  const b = (brand ?? '').toLowerCase()
  const m = (model ?? '').toUpperCase()
  return b === 'apple' || m.includes('IPHONE') || m.includes('IPAD') ? 'ios' : 'android'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(build: () => any): Promise<{ rows: any[]; ok: boolean; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) return { rows, ok: false, error: error.message }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return { rows, ok: true }
  }
}

const ymdBR = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10)

export async function loadDeviceReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any, tenantId: string, start: Date, end: Date,
): Promise<DeviceReport> {
  const osRes = await fetchAll(() => sb.from('service_orders')
    .select('id, customer_id, brand_name, model_name, received_at, total_price_cents, profit_cents, is_return, status')
    .eq('tenant_id', tenantId)
    .gte('received_at', start.toISOString())
    .lte('received_at', end.toISOString())
    .neq('status', 'cancelled')
    .order('received_at'))
  const os = osRes.rows.filter(o => !o.is_return && (o.total_price_cents ?? 0) > 0)

  // Clientes: origem + OS anteriores (para saber se é recorrente)
  const ids = [...new Set(os.map(o => o.customer_id).filter(Boolean))] as string[]
  const origin = new Map<string, string | null>()
  const firstAt = new Map<string, string>()   // data da 1ª OS do cliente (qualquer época)
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    const [cRes, hRes] = await Promise.all([
      sb.from('customers').select('id, origin').in('id', chunk),
      fetchAll(() => sb.from('service_orders').select('customer_id, received_at')
        .in('customer_id', chunk).neq('status', 'cancelled').lte('received_at', end.toISOString())),
    ])
    for (const c of cRes.data ?? []) origin.set(c.id, c.origin ?? null)
    for (const h of hRes.rows) {
      const cur = firstAt.get(h.customer_id)
      if (!cur || h.received_at < cur) firstAt.set(h.customer_id, h.received_at)
    }
  }

  // Gasto de anúncio (com plataforma, se a coluna existir)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spendQ = (cols: string) => () => sb.from('meta_ads_spend_entries').select(cols)
    .eq('tenant_id', tenantId).gte('spend_date', ymdBR(start.toISOString())).lte('spend_date', ymdBR(end.toISOString()))
  let spendRes = await fetchAll(spendQ('amount_cents, platform'))
  let spendSplit = spendRes.ok
  if (!spendRes.ok) spendRes = await fetchAll(spendQ('amount_cents'))
  const spend: Record<Platform, number> = { ios: 0, android: 0 }
  let spendNoPlatformCents = 0
  for (const s of spendRes.rows) {
    const p = s.platform as string | null | undefined
    const v = s.amount_cents ?? 0
    if (p === 'android') spend.android += v
    else if (p === 'misto') { spend.ios += Math.round(v / 2); spend.android += v - Math.round(v / 2) }
    else { spend.ios += v; if (p !== 'ios') spendNoPlatformCents += v }
  }
  spendSplit = spendSplit && spendNoPlatformCents === 0

  const acc = {
    ios:     { all: empty(), src: { pago: empty(), organico: empty(), recorrente: empty() }, paidNew: 0, models: new Map<string, number>() },
    android: { all: empty(), src: { pago: empty(), organico: empty(), recorrente: empty() }, paidNew: 0, models: new Map<string, number>() },
  }
  const months = new Map<string, { ios: Cell; android: Cell }>()
  const seenNew = new Set<string>()

  for (const o of os) {
    const p = platformOf(o.brand_name, o.model_name)
    const cents = o.total_price_cents ?? 0
    const profit = o.profit_cents ?? 0
    const cid = o.customer_id as string | null
    const first = cid ? firstAt.get(cid) : undefined
    const isRecurring = !!(cid && first && first < o.received_at)
    const src: Source = isRecurring ? 'recorrente' : cid && origin.get(cid) === 'instagram_pago' ? 'pago' : 'organico'
    const a = acc[p]
    add(a.all, cents, profit)
    add(a.src[src], cents, profit)
    if (src === 'pago' && cid && !seenNew.has(cid)) { seenNew.add(cid); a.paidNew++ }
    const model = (o.model_name ?? '').trim() || '(sem modelo)'
    a.models.set(model, (a.models.get(model) ?? 0) + 1)
    const mk = ymdBR(o.received_at).slice(0, 7)
    const m = months.get(mk) ?? { ios: empty(), android: empty() }
    add(m[p], cents, profit)
    months.set(mk, m)
  }

  const count = os.length
  const cents = os.reduce((s, o) => s + (o.total_price_cents ?? 0), 0)
  const profit = os.reduce((s, o) => s + (o.profit_cents ?? 0), 0)

  const rows: PlatformRow[] = (['ios', 'android'] as const).map(p => {
    const a = acc[p]
    return {
      platform: p, ...a.all,
      pctCount: count ? (100 * a.all.count) / count : 0,
      pctProfit: profit ? (100 * a.all.profit) / profit : 0,
      ticketCents: a.all.count ? Math.round(a.all.cents / a.all.count) : 0,
      profitPerOs: a.all.count ? Math.round(a.all.profit / a.all.count) : 0,
      bySource: a.src,
      newPaid: a.paidNew,
      spendCents: spend[p],
      cacCents: a.paidNew && spend[p] ? Math.round(spend[p] / a.paidNew) : null,
      paidProfitPerOs: a.src.pago.count ? Math.round(a.src.pago.profit / a.src.pago.count) : 0,
      topModels: [...a.models.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([model, n]) => ({ model, count: n })),
    }
  })

  return {
    count, cents, profit, rows,
    months: [...months.entries()].sort().map(([month, v]) => ({ month, ...v })),
    spendCents: spend.ios + spend.android,
    spendSplit, spendNoPlatformCents,
    ok: osRes.ok,
  }
}
