// Rodar: npm run test:acquisition  (node:test, sem dependências)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyAcquisition, NO_ORIGIN, type AcquisitionTx } from './customer-acquisition.ts'

const SINCE = '2026-11-01T00:00:00.000Z'
const UNTIL = '2026-11-30T23:59:59.000Z'

const tx = (p: Partial<AcquisitionTx>): AcquisitionTx => ({
  customerId: 'c1', channel: 'instagram_pago', firstPurchaseAt: null,
  at: '2026-11-10T12:00:00.000Z', valueCents: 10_000, ...p,
})

test('cliente compra 2x no mesmo período → conta 1 novo', () => {
  const r = classifyAcquisition([
    tx({ firstPurchaseAt: '2026-11-05T10:00:00.000Z', at: '2026-11-05T10:00:00.000Z' }),
    tx({ firstPurchaseAt: '2026-11-05T10:00:00.000Z', at: '2026-11-20T10:00:00.000Z', valueCents: 5_000 }),
  ], SINCE, UNTIL).get('instagram_pago')!

  assert.equal(r.newCustomers, 1)
  assert.equal(r.recurringCustomers, 0)
  assert.equal(r.newTxCount, 2)
  assert.equal(r.newRevenueCents, 15_000)
})

test('comprou no mês passado e recomprou agora → 0 novo, 1 recorrente, mantém canal', () => {
  const r = classifyAcquisition([
    tx({ firstPurchaseAt: '2026-10-10T10:00:00.000Z', at: '2026-11-12T10:00:00.000Z' }),
  ], SINCE, UNTIL)

  const ch = r.get('instagram_pago')!
  assert.equal(ch.newCustomers, 0)
  assert.equal(ch.recurringCustomers, 1)
  assert.equal(ch.recurringRevenueCents, 10_000)
  assert.equal(ch.newRevenueCents, 0)
  assert.equal(r.size, 1)
})

test('cliente sem origem preenchida → vai pro balde "não informado", não pros pagos', () => {
  const r = classifyAcquisition([
    tx({ channel: null, firstPurchaseAt: '2026-11-03T10:00:00.000Z', at: '2026-11-03T10:00:00.000Z' }),
  ], SINCE, UNTIL)

  assert.equal(r.get('instagram_pago'), undefined)
  assert.equal(r.get(NO_ORIGIN)!.newCustomers, 1)
})

test('transações fora do período e com valor zero são ignoradas', () => {
  const r = classifyAcquisition([
    tx({ at: '2026-10-31T23:59:00.000Z', firstPurchaseAt: '2026-10-31T23:59:00.000Z' }),
    tx({ customerId: 'c2', valueCents: 0, firstPurchaseAt: '2026-11-10T12:00:00.000Z' }),
  ], SINCE, UNTIL)
  assert.equal(r.size, 0)
})

test('sem first_purchase_at (backfill pendente) → trata a própria compra como 1ª', () => {
  const r = classifyAcquisition([tx({ firstPurchaseAt: null })], SINCE, UNTIL).get('instagram_pago')!
  assert.equal(r.newCustomers, 1)
})
