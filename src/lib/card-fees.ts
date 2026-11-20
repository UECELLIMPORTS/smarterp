// Taxas da maquininha do tenant (tenant_settings.card_fees, jsonb).
// Formato: { debit: 0.89, credit: { "1": 3.04, "2": 4.29, ... "12": 11.5 } } — em %.
// Parcelas sem taxa cadastrada são estimadas por interpolação entre as vizinhas.
//
// ARQUIVO IDÊNTICO em ~/checksmart e ~/smarterp (src/lib/card-fees.ts).

export const MAX_INSTALLMENTS = 12

export type CardFees = {
  debit:  number | null
  credit: Record<string, number>
}

export type FeeInfo = { pct: number; estimated: boolean }

export function parseCardFees(raw: unknown): CardFees | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { debit?: unknown; credit?: unknown }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100 ? v : null)
  const credit: Record<string, number> = {}
  if (r.credit && typeof r.credit === 'object') {
    for (const [k, v] of Object.entries(r.credit as Record<string, unknown>)) {
      const n = Number(k); const p = num(v)
      if (Number.isInteger(n) && n >= 1 && n <= MAX_INSTALLMENTS && p !== null) credit[String(n)] = p
    }
  }
  const debit = num(r.debit)
  if (debit === null && !Object.keys(credit).length) return null
  return { debit, credit }
}

/** Taxa (%) para débito ou crédito em N parcelas. null = não dá para saber. */
export function cardFee(fees: CardFees | null, kind: 'credit' | 'debit', installments?: number | null): FeeInfo | null {
  if (!fees) return null
  if (kind === 'debit') return fees.debit !== null ? { pct: fees.debit, estimated: false } : null
  const n = Math.min(Math.max(installments && installments > 0 ? Math.round(installments) : 1, 1), MAX_INSTALLMENTS)
  const exact = fees.credit[String(n)]
  if (exact !== undefined) return { pct: exact, estimated: false }
  const known = Object.keys(fees.credit).map(Number).sort((a, b) => a - b)
  const lo = [...known].reverse().find(k => k < n)
  const hi = known.find(k => k > n)
  if (lo === undefined || hi === undefined) return null
  const a = fees.credit[String(lo)], b = fees.credit[String(hi)]
  return { pct: a + ((b - a) * (n - lo)) / (hi - lo), estimated: true }
}

/** Quanto cai na conta depois da taxa. */
export const netAfterFee = (grossCents: number, pct: number) => Math.round(grossCents * (1 - pct / 100))

/** Quanto cobrar no cartão para receber `netCents` limpo (preço PIX → preço cartão). */
export const grossUpForFee = (netCents: number, pct: number) => Math.round(netCents / (1 - pct / 100))

export const fmtPct = (p: number) => `${p.toFixed(2).replace('.', ',')}%`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadCardFees(sb: any, tenantId: string): Promise<CardFees | null> {
  const { data, error } = await sb.from('tenant_settings').select('card_fees').eq('tenant_id', tenantId).maybeSingle()
  if (error) return null   // coluna ainda não criada (migration pendente) → sem taxas
  return parseCardFees(data?.card_fees)
}
