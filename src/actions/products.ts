'use server'

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductRow = {
  id: string
  code: string | null
  name: string
  brand: string | null
  purchase_price_cents: number
  cost_cents: number
  price_cents: number
  unit: string
  stock_qty: number
  supplier: string | null
  image_urls: string[]
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type ProductInput = {
  code: string
  name: string
  brand: string
  purchasePriceCents: number
  costCents: number
  priceCents: number
  unit: string
  stockQty: number
  supplier: string
  imageUrls: string[]
  description: string
  active: boolean
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listProducts(): Promise<ProductRow[]> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data, error } = await supabase
    .from('products')
    .select('id, code, name, brand, purchase_price_cents, cost_cents, price_cents, unit, stock_qty, supplier, image_urls, description, active, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('name')
    .range(0, 999)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductRow[]
}

// ── Brands autocomplete ───────────────────────────────────────────────────────

export async function listBrands(): Promise<string[]> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data } = await supabase
    .from('products')
    .select('brand')
    .eq('tenant_id', tenantId)
    .not('brand', 'is', null)

  const brands = [...new Set((data ?? []).map(r => r.brand as string))].sort()
  return brands
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createProduct(input: ProductInput): Promise<ProductRow> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  if (!input.name.trim()) throw new Error('Nome do produto é obrigatório.')

  const { data, error } = await supabase
    .from('products')
    .insert({
      tenant_id:            tenantId,
      code:                 input.code.trim() || null,
      name:                 input.name.trim(),
      brand:                input.brand.trim() || null,
      purchase_price_cents: input.purchasePriceCents,
      cost_cents:           input.costCents,
      price_cents:          input.priceCents,
      unit:                 input.unit || 'Un',
      stock_qty:            input.stockQty,
      supplier:             input.supplier.trim() || null,
      image_urls:           input.imageUrls,
      description:          input.description.trim() || null,
      active:               input.active,
    })
    .select('id, code, name, brand, purchase_price_cents, cost_cents, price_cents, unit, stock_qty, supplier, image_urls, description, active, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
  return data as unknown as ProductRow
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateProduct(id: string, input: ProductInput): Promise<ProductRow> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  if (!input.name.trim()) throw new Error('Nome do produto é obrigatório.')

  const { data, error } = await supabase
    .from('products')
    .update({
      code:                 input.code.trim() || null,
      name:                 input.name.trim(),
      brand:                input.brand.trim() || null,
      purchase_price_cents: input.purchasePriceCents,
      cost_cents:           input.costCents,
      price_cents:          input.priceCents,
      unit:                 input.unit || 'Un',
      stock_qty:            input.stockQty,
      supplier:             input.supplier.trim() || null,
      image_urls:           input.imageUrls,
      description:          input.description.trim() || null,
      active:               input.active,
      updated_at:           new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, code, name, brand, purchase_price_cents, cost_cents, price_cents, unit, stock_qty, supplier, image_urls, description, active, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
  return data as unknown as ProductRow
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteProduct(id: string): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
}

// ── Adjust stock (balanço) ────────────────────────────────────────────────────

export async function adjustStock(id: string, newQty: number): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { error } = await supabase
    .from('products')
    .update({ stock_qty: Math.max(0, newQty), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
}

// ── Bulk import (upsert) ──────────────────────────────────────────────────────

export async function importProducts(
  rows: ProductInput[]
): Promise<{ created: number; updated: number; errors: number }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // Carrega todos os produtos existentes do tenant para comparação em memória
  const { data: existing } = await supabase
    .from('products')
    .select('id, code, name')
    .eq('tenant_id', tenantId)

  const byCode = new Map<string, string>() // code → id
  const byName = new Map<string, string>() // name_lower → id
  for (const p of existing ?? []) {
    if (p.code) byCode.set(p.code.trim().toLowerCase(), p.id)
    byName.set(p.name.trim().toLowerCase(), p.id)
  }

  let created = 0
  let updated = 0
  let errors  = 0

  for (const row of rows) {
    const name = row.name.trim()
    const code = row.code.trim()
    if (!name) { errors++; continue }

    const payload = {
      tenant_id:            tenantId,
      code:                 code || null,
      name,
      brand:                row.brand.trim() || null,
      purchase_price_cents: row.purchasePriceCents,
      cost_cents:           row.costCents,
      price_cents:          row.priceCents,
      unit:                 row.unit || 'Un',
      stock_qty:            row.stockQty,
      supplier:             row.supplier.trim() || null,
      image_urls:           [],
      description:          row.description.trim() || null,
      active:               row.active,
      updated_at:           new Date().toISOString(),
    }

    // Decide se atualiza ou cria: prioridade código > nome
    const existingId =
      (code && byCode.get(code.toLowerCase())) ||
      byName.get(name.toLowerCase())

    if (existingId) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', existingId)
        .eq('tenant_id', tenantId)
      if (error) errors++; else updated++
    } else {
      const { error } = await supabase
        .from('products')
        .insert(payload)
      if (error) errors++
      else {
        created++
        // Registra no mapa para evitar duplicata dentro do mesmo arquivo
        if (code) byCode.set(code.toLowerCase(), 'new')
        byName.set(name.toLowerCase(), 'new')
      }
    }
  }

  revalidatePath('/estoque')
  return { created, updated, errors }
}

// ── Remover duplicatas (mantém o registro mais antigo por código/nome) ────────

export async function removeDuplicateProducts(): Promise<{ removed: number }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data } = await supabase
    .from('products')
    .select('id, code, name, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) return { removed: 0 }

  const seen = new Map<string, string>() // chave → id do primeiro (mais antigo)
  const toDelete: string[] = []

  for (const p of data) {
    // Chave = código (se existir) OU nome normalizado
    const key = p.code
      ? `code:${p.code.trim().toLowerCase()}`
      : `name:${p.name.trim().toLowerCase()}`

    if (seen.has(key)) {
      toDelete.push(p.id) // duplicata: marca para deletar
    } else {
      seen.set(key, p.id)
    }
  }

  if (toDelete.length === 0) return { removed: 0 }

  const { error } = await supabase
    .from('products')
    .delete()
    .in('id', toDelete)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
  return { removed: toDelete.length }
}

// ── Toggle active ─────────────────────────────────────────────────────────────

export async function toggleProductActive(id: string, active: boolean): Promise<void> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { error } = await supabase
    .from('products')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/estoque')
}
