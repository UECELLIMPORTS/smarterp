'use server'

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'

// ── Helper: busca cost_cents atual dos produtos/peças pra snapshot em sale_items
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchCostMap(supabase: any, productIds: (string | null)[]): Promise<Map<string, number>> {
  const ids = productIds.filter((id): id is string => !!id)
  const costMap = new Map<string, number>()
  if (ids.length === 0) return costMap

  const [prodRes, partRes] = await Promise.all([
    supabase.from('products').select('id, cost_cents').in('id', ids),
    supabase.from('parts_catalog').select('id, cost_cents').in('id', ids),
  ])
  for (const p of (prodRes.data ?? []) as { id: string; cost_cents: number }[]) costMap.set(p.id, p.cost_cents ?? 0)
  for (const p of (partRes.data ?? []) as { id: string; cost_cents: number }[]) costMap.set(p.id, p.cost_cents ?? 0)
  return costMap
}

// ── Cancel ERP sale + restore stock ──────────────────────────────────────────

export async function cancelSale(saleId: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // Fetch sale items with product_id to restore stock
  const { data: items } = await supabase
    .from('sale_items')
    .select('product_id, quantity')
    .eq('sale_id', saleId)

  const { error } = await supabase
    .from('sales')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', saleId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)

  // Restaura estoque via stock_movement 'entrada' (a trigger incrementa stock_qty)
  const entries = (items ?? []).filter(i => i.product_id).map(item => ({
    tenant_id:  tenantId,
    product_id: item.product_id as string,
    type:       'entrada',
    quantity:   item.quantity,
    origin:     `sale-cancel:${saleId}`,
    notes:      `Cancelamento da venda #${saleId.slice(0, 8)}`,
  }))
  if (entries.length > 0) {
    await supabase.from('stock_movements').insert(entries)
  }

  revalidatePath('/financeiro')
  revalidatePath('/estoque')
}

// ── Reactivate ERP sale + decrement stock ─────────────────────────────────────

export async function reactivateSale(saleId: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: items } = await supabase
    .from('sale_items')
    .select('product_id, quantity')
    .eq('sale_id', saleId)

  const { error } = await supabase
    .from('sales')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', saleId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)

  // Reativação → saída de estoque via stock_movement
  const exits = (items ?? []).filter(i => i.product_id).map(item => ({
    tenant_id:  tenantId,
    product_id: item.product_id as string,
    type:       'saida',
    quantity:   item.quantity,
    origin:     `sale-reactivate:${saleId}`,
    notes:      `Reativação da venda #${saleId.slice(0, 8)}`,
  }))
  if (exits.length > 0) {
    await supabase.from('stock_movements').insert(exits)
  }

  revalidatePath('/financeiro')
  revalidatePath('/estoque')
}

// ── Update CheckSmart OS payment method ──────────────────────────────────────

export async function updateServiceOrderPayment(orderId: string, paymentMethod: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { error } = await supabase
    .from('service_orders')
    .update({ payment_method: paymentMethod, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/financeiro')
}

// ── Delete ERP sale (only when already cancelled) ────────────────────────────

export async function deleteSale(saleId: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: sale } = await supabase
    .from('sales')
    .select('status')
    .eq('id', saleId)
    .eq('tenant_id', tenantId)
    .single()

  if (!sale) throw new Error('Venda não encontrada.')
  if (sale.status !== 'cancelled') throw new Error('Cancele a venda antes de excluí-la.')

  await supabase.from('sale_items').delete().eq('sale_id', saleId)

  const { error } = await supabase
    .from('sales')
    .delete()
    .eq('id', saleId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/financeiro')
}

// ── Update cancelled ERP sale (full edit) ────────────────────────────────────

export type EditSaleInput = {
  customerId:    string | null
  items:         { productId: string | null; name: string; quantity: number; unitPriceCents: number }[]
  discountCents: number
  paymentMethod: string
  saleDate:      string
}

export async function updateCancelledSale(saleId: string, input: EditSaleInput): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: sale } = await supabase
    .from('sales')
    .select('status')
    .eq('id', saleId)
    .eq('tenant_id', tenantId)
    .single()

  if (!sale) throw new Error('Venda não encontrada.')
  if (sale.status !== 'cancelled') throw new Error('Só é possível editar vendas canceladas.')
  if (!input.items.length) throw new Error('Adicione ao menos um item.')

  const subtotal     = input.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0)
  const total        = Math.max(0, subtotal - input.discountCents)
  const newCreatedAt = new Date(input.saleDate + 'T12:00:00').toISOString()

  const { error } = await supabase
    .from('sales')
    .update({
      customer_id:    input.customerId,
      total_cents:    total,
      subtotal_cents: subtotal,
      discount_cents: input.discountCents,
      payment_method: input.paymentMethod,
      created_at:     newCreatedAt,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', saleId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)

  await supabase.from('sale_items').delete().eq('sale_id', saleId)
  const costMapEdit = await fetchCostMap(supabase, input.items.map(i => i.productId))
  await supabase.from('sale_items').insert(
    input.items.map(i => ({
      sale_id:             saleId,
      product_id:          i.productId,
      name:                i.name,
      quantity:            i.quantity,
      unit_price_cents:    i.unitPriceCents,
      subtotal_cents:      i.unitPriceCents * i.quantity,
      cost_snapshot_cents: i.productId ? (costMapEdit.get(i.productId) ?? null) : null,
    })),
  )

  revalidatePath('/financeiro')
}

// ── Update sale date (cancel → update date → reactivate) ─────────────────────

export async function updateSaleDate(saleId: string, newDate: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: items } = await supabase
    .from('sale_items')
    .select('product_id, quantity')
    .eq('sale_id', saleId)

  // Restaura estoque (entrada) para depois decrementar com a nova data
  const restores = (items ?? []).filter(i => i.product_id).map(item => ({
    tenant_id:  tenantId,
    product_id: item.product_id as string,
    type:       'entrada',
    quantity:   item.quantity,
    origin:     `sale-date-revert:${saleId}`,
    notes:      `Revertendo venda #${saleId.slice(0, 8)} para alterar data`,
  }))
  if (restores.length > 0) {
    await supabase.from('stock_movements').insert(restores)
  }

  const newCreatedAt = new Date(newDate + 'T12:00:00').toISOString()
  const { error } = await supabase
    .from('sales')
    .update({ created_at: newCreatedAt, status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', saleId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)

  const exits = (items ?? []).filter(i => i.product_id).map(item => ({
    tenant_id:  tenantId,
    product_id: item.product_id as string,
    type:       'saida',
    quantity:   item.quantity,
    origin:     `sale-date-redo:${saleId}`,
    notes:      `Venda #${saleId.slice(0, 8)} com nova data`,
  }))
  if (exits.length > 0) {
    await supabase.from('stock_movements').insert(exits)
  }

  revalidatePath('/financeiro')
  revalidatePath('/estoque')
}

// ── Cancel CheckSmart OS ──────────────────────────────────────────────────────

export async function cancelServiceOrder(orderId: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: current } = await supabase
    .from('service_orders')
    .select('status')
    .eq('id', orderId)
    .eq('tenant_id', tenantId)
    .single()

  const { error } = await supabase
    .from('service_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)

  await supabase.from('order_status_logs').insert({
    tenant_id:   tenantId,
    order_id:    orderId,
    from_status: current?.status ?? null,
    to_status:   'cancelled',
    notes:       'Cancelado pelo SmartERP',
  })

  revalidatePath('/financeiro')
}

// ── Reactivate CheckSmart OS ──────────────────────────────────────────────────

export async function reactivateServiceOrder(orderId: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { error } = await supabase
    .from('service_orders')
    .update({ status: 'received', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/financeiro')
}

// ── Create manual sale (with custom date + items) ────────────────────────────

export type ManualSaleItem = {
  productId:      string | null
  source?:        'products' | 'parts_catalog'
  name:           string
  quantity:       number
  unitPriceCents: number
}

export type ManualSaleInput = {
  saleDate:      string
  customerId:    string | null
  items:         ManualSaleItem[]
  discountCents: number
  paymentMethod: 'cash' | 'pix' | 'card' | 'mixed'
}

export async function createManualSale(input: ManualSaleInput): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  if (!input.items.length) throw new Error('Adicione ao menos um item.')

  const subtotal = input.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0)
  const total    = Math.max(0, subtotal - input.discountCents)

  const saleDate = new Date(input.saleDate + 'T12:00:00')

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .insert({
      tenant_id:      tenantId,
      user_id:        user.id,
      customer_id:    input.customerId,
      subtotal_cents: subtotal,
      discount_cents: input.discountCents,
      shipping_cents: 0,
      total_cents:    total,
      payment_method: input.paymentMethod,
      status:         'completed',
      created_at:     saleDate.toISOString(),
    })
    .select('id')
    .single()

  if (saleErr) throw new Error(saleErr.message)

  const costMapManual = await fetchCostMap(supabase, input.items.map(i => i.productId))
  await supabase.from('sale_items').insert(
    input.items.map(i => ({
      sale_id:             sale.id,
      product_id:          i.productId,
      name:                i.name,
      quantity:            i.quantity,
      unit_price_cents:    i.unitPriceCents,
      subtotal_cents:      i.unitPriceCents * i.quantity,
      cost_snapshot_cents: i.productId ? (costMapManual.get(i.productId) ?? null) : null,
    })),
  )

  // Saída de estoque via stock_movement
  const manualExits = input.items
    .filter(i => i.productId && i.source === 'products')
    .map(item => ({
      tenant_id:        tenantId,
      product_id:       item.productId as string,
      type:             'saida',
      quantity:         item.quantity,
      sale_price_cents: item.unitPriceCents,
      origin:           `sale:${sale.id}`,
      notes:            `Venda manual #${sale.id.slice(0, 8)}`,
    }))
  if (manualExits.length > 0) {
    await supabase.from('stock_movements').insert(manualExits)
  }

  revalidatePath('/financeiro')
  revalidatePath('/estoque')
}

// ── Bulk cancel (ERP sales + CheckSmart OS) ───────────────────────────────────

export async function bulkCancel(
  saleIds: string[],
  orderIds: string[],
): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  for (const saleId of saleIds) {
    const { data: items } = await supabase
      .from('sale_items')
      .select('product_id, quantity')
      .eq('sale_id', saleId)

    await supabase
      .from('sales')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', saleId)
      .eq('tenant_id', tenantId)

    const bulkEntries = (items ?? []).filter(i => i.product_id).map(item => ({
      tenant_id:  tenantId,
      product_id: item.product_id as string,
      type:       'entrada',
      quantity:   item.quantity,
      origin:     `sale-cancel:${saleId}`,
      notes:      `Cancelamento em massa da venda #${saleId.slice(0, 8)}`,
    }))
    if (bulkEntries.length > 0) {
      await supabase.from('stock_movements').insert(bulkEntries)
    }
  }

  if (orderIds.length > 0) {
    const { data: currentOrders } = await supabase
      .from('service_orders')
      .select('id, status')
      .in('id', orderIds)
      .eq('tenant_id', tenantId)

    await supabase
      .from('service_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('id', orderIds)
      .eq('tenant_id', tenantId)

    const logs = (currentOrders ?? []).map(o => ({
      tenant_id:   tenantId,
      order_id:    o.id,
      from_status: o.status,
      to_status:   'cancelled',
      notes:       'Cancelado pelo SmartERP',
    }))
    if (logs.length > 0) await supabase.from('order_status_logs').insert(logs)
  }

  revalidatePath('/financeiro')
  revalidatePath('/estoque')
}

// ── Bulk delete cancelled ERP sales ──────────────────────────────────────────

export async function bulkDeleteSales(saleIds: string[]): Promise<void> {
  if (saleIds.length === 0) return
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: sales } = await supabase
    .from('sales')
    .select('id, status')
    .in('id', saleIds)
    .eq('tenant_id', tenantId)

  const notCancelled = (sales ?? []).filter(s => s.status !== 'cancelled')
  if (notCancelled.length > 0) throw new Error('Cancele todas as vendas selecionadas antes de excluir.')

  for (const saleId of saleIds) {
    await supabase.from('sale_items').delete().eq('sale_id', saleId)
    await supabase.from('sales').delete().eq('id', saleId).eq('tenant_id', tenantId)
  }

  revalidatePath('/financeiro')
}

// ── Bulk delete cancelled CheckSmart OS ───────────────────────────────────────

export async function bulkDeleteServiceOrders(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: orders } = await supabase
    .from('service_orders')
    .select('id, status')
    .in('id', orderIds)
    .eq('tenant_id', tenantId)

  const notCancelled = (orders ?? []).filter(o => o.status !== 'cancelled')
  if (notCancelled.length > 0) throw new Error('Apenas OS canceladas podem ser excluídas.')

  const { error } = await supabase
    .from('service_orders')
    .delete()
    .in('id', orderIds)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/financeiro')
}
