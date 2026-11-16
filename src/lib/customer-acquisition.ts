/**
 * Classificação de clientes NOVOS vs RECORRENTES num período.
 *
 * Regra (Meta Ads › Relatórios e Analytics › Canais):
 * - NOVO no período  = customers.first_purchase_at dentro de [since, until]
 * - RECORRENTE       = teve compra paga no período E first_purchase_at < since
 * - O canal é sempre a origem de aquisição do cliente (customers.origin),
 *   que compras futuras não alteram.
 *
 * Sem imports de propósito: usado no server e nos testes (node:test).
 */

export type AcquisitionTx = {
  customerId:      string
  /** customers.origin — null quando o cliente não informou como conheceu */
  channel:         string | null
  /** customers.first_purchase_at — null se o trigger/backfill ainda não rodou */
  firstPurchaseAt: string | null
  /** data da transação (sales.created_at / service_orders.received_at) */
  at:              string
  valueCents:      number
}

export type ChannelAcquisition = {
  newCustomers:          number
  recurringCustomers:    number
  newRevenueCents:       number
  recurringRevenueCents: number
  newTxCount:            number
  recurringTxCount:      number
}

export const NO_ORIGIN = 'nao_informado'

const emptyBucket = (): ChannelAcquisition => ({
  newCustomers: 0, recurringCustomers: 0,
  newRevenueCents: 0, recurringRevenueCents: 0,
  newTxCount: 0, recurringTxCount: 0,
})

/**
 * Agrupa as transações do período por canal de origem, separando novos e
 * recorrentes. Transações fora de [since, until] ou com valor <= 0 são ignoradas.
 */
export function classifyAcquisition(
  txs: AcquisitionTx[],
  sinceIso: string,
  untilIso: string,
): Map<string, ChannelAcquisition> {
  const since = Date.parse(sinceIso)
  const until = Date.parse(untilIso)
  const out   = new Map<string, ChannelAcquisition>()
  const seen  = new Set<string>()

  for (const tx of txs) {
    const at = Date.parse(tx.at)
    if (!(tx.valueCents > 0) || at < since || at > until) continue

    // Sem first_purchase_at a melhor estimativa é a própria transação.
    const first = tx.firstPurchaseAt ? Date.parse(tx.firstPurchaseAt) : at
    const isNew = first >= since

    const key = tx.channel || NO_ORIGIN
    const b   = out.get(key) ?? emptyBucket()
    if (isNew) {
      b.newRevenueCents += tx.valueCents
      b.newTxCount      += 1
    } else {
      b.recurringRevenueCents += tx.valueCents
      b.recurringTxCount      += 1
    }
    const seenKey = `${key}|${tx.customerId}`
    if (!seen.has(seenKey)) {
      seen.add(seenKey)
      if (isNew) b.newCustomers += 1
      else       b.recurringCustomers += 1
    }
    out.set(key, b)
  }
  return out
}

/** Valor da OS no mesmo critério dos relatórios. */
export function serviceOrderValueCents(o: {
  total_price_cents:   number | null
  service_price_cents: number | null
  parts_sale_cents:    number | null
  discount_cents:      number | null
}): number {
  return o.total_price_cents
    ?? Math.max(0, (o.service_price_cents ?? 0) + (o.parts_sale_cents ?? 0) - (o.discount_cents ?? 0))
}
