// Relatório de formas de pagamento — junta as OS do CheckSmart (service_orders)
// e as vendas do PDV do Gestão Smart (sales). Os dois sistemas usam o mesmo
// Supabase e a RLS filtra por tenant_id do JWT, então qualquer um dos apps lê
// as duas tabelas.
//
// ARQUIVO IDÊNTICO em ~/checksmart e ~/smarterp (src/lib/payment-report.ts).
// Ao mudar um, copie para o outro.

import { type CardFees, cardFee } from './card-fees'

export type PaySource = 'total' | 'smarterp' | 'checksmart'

export type PayKey = 'pix' | 'credit' | 'debit' | 'card' | 'cash' | 'transfer' | 'mixed' | 'none'

export const PAY_LABEL: Record<PayKey, string> = {
  pix:      'PIX',
  credit:   'Cartão de crédito',
  debit:    'Cartão de débito',
  card:     'Cartão (PDV, sem tipo)',
  cash:     'Dinheiro',
  transfer: 'Transferência',
  mixed:    'Misto (sem detalhe)',
  none:     'Não informado / pendente',
}

export const PAY_COLOR: Record<PayKey, string> = {
  pix:      '#22C55E',
  credit:   '#8B5CF6',
  debit:    '#3B82F6',
  card:     '#A78BFA',
  cash:     '#F59E0B',
  transfer: '#06B6D4',
  mixed:    '#EC4899',
  none:     '#64748B',
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export type PayCell = { count: number; cents: number }

export type PayRow = PayCell & {
  key:          PayKey
  feeCents:     number
  label:        string
  color:        string
  pctCount:     number
  pctCents:     number
  ticketCents:  number
  os:           PayCell
  sales:        PayCell
}

export type WeekdayRow = PayCell & {
  dow:    number
  label:  string
  days:   number                     // quantos desses dias existem no período
  byKey:  Partial<Record<PayKey, PayCell>>
  topKey: PayKey | null              // forma com mais valor nesse dia da semana
}

export type InstallmentRow = PayCell & { n: number; pctCents: number }   // n = 0: não informado

export type PaymentReport = {
  source:        PaySource
  count:         number
  totalCents:    number
  rows:          PayRow[]
  weekdays:      WeekdayRow[]
  installments:  InstallmentRow[]   // só crédito das OS (o PDV não grava parcelas)
  os:            PayCell & { ok: boolean }
  sales:         PayCell & { ok: boolean }
  keysInUse:     PayKey[]
  hasFees:       boolean           // taxas da maquininha cadastradas
  feeCents:      number            // taxa estimada total do período
  netCents:      number            // totalCents - feeCents
  feeUnknown:    PayCell           // cartão sem tipo/sem taxa cadastrada (taxa não calculada)
  creditNoInst:  number            // créditos sem parcelas informadas (calculados como 1x)
}

type Entry = { src: 'os' | 'sales'; key: PayKey; cents: number; at: string; installments: number | null; fee?: number | null }

function osKey(m: string | null): PayKey {
  switch (m) {
    case 'pix':         return 'pix'
    case 'credit_card': return 'credit'
    case 'debit_card':  return 'debit'
    case 'cash':        return 'cash'
    case 'transfer':    return 'transfer'
    default:            return 'none'
  }
}

function saleKey(m: string | null): PayKey {
  switch (m) {
    case 'pix':                       return 'pix'
    case 'card':                      return 'card'
    case 'credit': case 'credito': case 'credit_card': return 'credit'
    case 'debit':  case 'debito':  case 'debit_card':  return 'debit'
    case 'cash':   case 'dinheiro':   return 'cash'
    case 'transfer':                  return 'transfer'
    case 'mixed':                     return 'mixed'
    default:                          return 'none'
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(build: () => any): Promise<{ rows: any[]; ok: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) {
      console.error('[payment-report]', error.message)
      return { rows, ok: false }
    }
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return { rows, ok: true }
  }
}

/** Dia da semana em Brasília (UTC-3). */
function brDow(iso: string): number {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).getUTCDay()
}

export async function loadPaymentReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  tenantId: string,
  start: Date,
  end: Date,
  source: PaySource = 'total',
  fees: CardFees | null = null,
): Promise<PaymentReport> {
  const entries: Entry[] = []
  const wantOs    = source !== 'smarterp'
  const wantSales = source !== 'checksmart'

  const [osRes, salesRes] = await Promise.all([
    wantOs
      ? fetchAll(() => sb.from('service_orders')
          .select('total_price_cents, payment_method, payment_installments, received_at, status, is_return')
          .eq('tenant_id', tenantId)
          .gte('received_at', start.toISOString())
          .lte('received_at', end.toISOString())
          .neq('status', 'cancelled')
          .order('received_at'))
      : Promise.resolve({ rows: [], ok: true }),
    wantSales
      ? fetchAll(() => sb.from('sales')
          .select('total_cents, payment_method, payment_details, created_at, status')
          .eq('tenant_id', tenantId)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .neq('status', 'cancelled')
          .order('created_at'))
      : Promise.resolve({ rows: [], ok: true }),
  ])

  // OS: retorno/garantia (valor 0) não é recebimento
  for (const o of osRes.rows) {
    const cents = o.total_price_cents ?? 0
    if (cents <= 0 || o.is_return) continue
    entries.push({ src: 'os', key: osKey(o.payment_method), cents, at: o.received_at, installments: o.payment_installments ?? null })
  }

  // PDV: payment_details = { card_type: 'credit'|'debit', installments } no cartão;
  // no misto também { cash, pix, card } com o valor de cada parte.
  for (const s of salesRes.rows) {
    const cents = s.total_cents ?? 0
    if (cents <= 0) continue
    const d = (s.payment_details ?? {}) as Record<string, unknown>
    const cardKey: PayKey = d.card_type === 'credit' ? 'credit' : d.card_type === 'debit' ? 'debit' : 'card'
    const inst = typeof d.installments === 'number' ? d.installments : null
    if (s.payment_method === 'mixed') {
      const parts = (['cash', 'pix', 'card'] as const)
        .map(k => [k, typeof d[k] === 'number' ? (d[k] as number) : 0] as const)
        .filter(([, v]) => v > 0)
      if (parts.length) {
        for (const [k, v] of parts) {
          entries.push({ src: 'sales', key: k === 'card' ? cardKey : saleKey(k), cents: v, at: s.created_at, installments: k === 'card' ? inst : null })
        }
        continue
      }
    }
    const key = s.payment_method === 'card' ? cardKey : saleKey(s.payment_method)
    entries.push({ src: 'sales', key, cents, at: s.created_at, installments: key === 'credit' ? inst : null })
  }

  // Taxa estimada de cada recebimento (PIX/dinheiro/transferência = 0)
  let creditNoInst = 0
  for (const e of entries) {
    if (e.key === 'credit' || e.key === 'debit') {
      if (e.key === 'credit' && !(e.installments && e.installments > 0)) creditNoInst++
      const f = cardFee(fees, e.key, e.installments)
      e.fee = f ? Math.round((e.cents * f.pct) / 100) : null
    } else if (e.key === 'card' || e.key === 'mixed' || e.key === 'none') {
      e.fee = null
    } else {
      e.fee = 0
    }
  }

  const count      = entries.length
  const totalCents = entries.reduce((a, e) => a + e.cents, 0)

  // ── Por forma de pagamento
  const byKey = new Map<PayKey, { count: number; cents: number; fee: number; os: PayCell; sales: PayCell }>()
  for (const e of entries) {
    const r = byKey.get(e.key) ?? { count: 0, cents: 0, fee: 0, os: { count: 0, cents: 0 }, sales: { count: 0, cents: 0 } }
    r.count++; r.cents += e.cents; r.fee += e.fee ?? 0
    r[e.src].count++; r[e.src].cents += e.cents
    byKey.set(e.key, r)
  }
  const rows: PayRow[] = [...byKey.entries()]
    .map(([key, r]) => ({
      key, label: PAY_LABEL[key], color: PAY_COLOR[key],
      count: r.count, cents: r.cents, feeCents: r.fee,
      pctCount:    count      ? (100 * r.count) / count      : 0,
      pctCents:    totalCents ? (100 * r.cents) / totalCents : 0,
      ticketCents: r.count ? Math.round(r.cents / r.count) : 0,
      os: r.os, sales: r.sales,
    }))
    .sort((a, b) => b.cents - a.cents)
  const keysInUse = rows.map(r => r.key)

  // ── Por dia da semana (Segunda primeiro)
  const dayCount = Array(7).fill(0)
  {
    const d = new Date(start.getTime() - 3 * 3600_000)
    const last = new Date(end.getTime() - 3 * 3600_000)
    d.setUTCHours(12, 0, 0, 0)
    for (let i = 0; d <= last && i < 3700; i++) { dayCount[d.getUTCDay()]++; d.setUTCDate(d.getUTCDate() + 1) }
  }
  const wd: WeekdayRow[] = WEEKDAYS.map((label, dow) => ({ dow, label, days: dayCount[dow], count: 0, cents: 0, byKey: {}, topKey: null }))
  for (const e of entries) {
    const w = wd[brDow(e.at)]
    w.count++; w.cents += e.cents
    const c = w.byKey[e.key] ?? { count: 0, cents: 0 }
    c.count++; c.cents += e.cents
    w.byKey[e.key] = c
  }
  for (const w of wd) {
    let best: PayKey | null = null
    for (const k of keysInUse) if ((w.byKey[k]?.cents ?? 0) > (best ? w.byKey[best]!.cents : 0)) best = k
    w.topKey = best
  }
  const weekdays = [...wd.slice(1), wd[0]]

  // ── Parcelas do crédito (OS)
  const inst = new Map<number, PayCell>()
  for (const e of entries) {
    if (e.key !== 'credit') continue
    const n = e.installments && e.installments > 0 ? e.installments : 0   // 0 = parcelas não informadas
    const c = inst.get(n) ?? { count: 0, cents: 0 }
    c.count++; c.cents += e.cents
    inst.set(n, c)
  }
  const creditTotal = [...inst.values()].reduce((a, c) => a + c.cents, 0)
  const installments = [...inst.entries()]
    .sort((a, b) => (a[0] || 99) - (b[0] || 99))
    .map(([n, c]) => ({ n, ...c, pctCents: creditTotal ? (100 * c.cents) / creditTotal : 0 }))

  const sum = (src: 'os' | 'sales') => entries.filter(e => e.src === src).reduce(
    (a, e) => ({ count: a.count + 1, cents: a.cents + e.cents }), { count: 0, cents: 0 })

  const feeCents = entries.reduce((a, e) => a + (e.fee ?? 0), 0)
  const unknown = entries.filter(e => e.fee === null && e.key !== 'none' && e.key !== 'mixed')
  return {
    source, count, totalCents, rows, weekdays, installments, keysInUse,
    hasFees: !!fees, feeCents, netCents: totalCents - feeCents, creditNoInst,
    feeUnknown: { count: unknown.length, cents: unknown.reduce((a, e) => a + e.cents, 0) },
    os:    { ...sum('os'),    ok: osRes.ok },
    sales: { ...sum('sales'), ok: salesRes.ok },
  }
}
