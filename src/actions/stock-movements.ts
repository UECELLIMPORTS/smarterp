'use server'

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MovementType = 'entrada' | 'saida'

export type StockMovementRow = {
  id: string
  product_id: string
  type: MovementType
  quantity: number
  purchase_price_cents: number
  cost_price_cents: number
  sale_price_cents: number
  notes: string | null
  origin: string | null
  created_at: string
}

export type StockMovementInput = {
  productId: string
  type: MovementType
  quantity: number
  purchasePriceCents: number
  costPriceCents: number
  salePriceCents: number
  notes: string
}

export type StockSummary = {
  total_entrada: number
  avg_purchase_price_cents: number
  total_saida: number
  avg_sale_price_cents: number
}

// ── List movements by product ─────────────────────────────────────────────────

export async function listMovements(productId: string): Promise<StockMovementRow[]> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data, error } = await supabase
    .from('stock_movements')
    .select('id, product_id, type, quantity, purchase_price_cents, cost_price_cents, sale_price_cents, notes, origin, created_at')
    .eq('tenant_id', tenantId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as StockMovementRow[]
}

// ── Summary by product ────────────────────────────────────────────────────────

export async function getStockSummary(productId: string): Promise<StockSummary> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data, error } = await supabase
    .from('stock_summary_by_product')
    .select('total_entrada, avg_purchase_price_cents, total_saida, avg_sale_price_cents')
    .eq('tenant_id', tenantId)
    .eq('product_id', productId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data ?? {
    total_entrada: 0,
    avg_purchase_price_cents: 0,
    total_saida: 0,
    avg_sale_price_cents: 0,
  }) as StockSummary
}

// ── Create movement ───────────────────────────────────────────────────────────

export async function createMovement(input: StockMovementInput): Promise<StockMovementRow> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  if (input.quantity <= 0) throw new Error('Quantidade deve ser maior que zero.')

  if (input.type === 'entrada' && input.purchasePriceCents <= 0) {
    throw new Error('Preço de compra é obrigatório na entrada.')
  }

  const { data, error } = await supabase
    .from('stock_movements')
    .insert({
      tenant_id:            tenantId,
      product_id:           input.productId,
      type:                 input.type,
      quantity:             input.quantity,
      purchase_price_cents: input.type === 'entrada' ? input.purchasePriceCents : 0,
      cost_price_cents:     input.type === 'entrada' ? input.costPriceCents : 0,
      sale_price_cents:     input.type === 'saida'   ? input.salePriceCents  : 0,
      notes:                input.notes.trim() || null,
      origin:               'manual',
    })
    .select('id, product_id, type, quantity, purchase_price_cents, cost_price_cents, sale_price_cents, notes, origin, created_at')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
  return data as StockMovementRow
}

// ── Delete movement ───────────────────────────────────────────────────────────
// Atenção: deletar um lançamento NÃO reverte o estoque automaticamente.
// Usar apenas para correções administrativas — o estoque deve ser ajustado manualmente.

export async function deleteMovement(id: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { error } = await supabase
    .from('stock_movements')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
}
