'use server'

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Product = {
  id: string
  code: string | null
  name: string
  price_cents: number
  stock_qty: number | null
  source: 'products' | 'parts_catalog'
}

export type Customer = {
  id: string
  full_name: string
  cpf_cnpj: string | null
  whatsapp: string | null
  email: string | null
}

export type CreateCustomerInput = {
  name: string
  cpf: string
  whatsapp: string
  email: string
  cep: string
  addressStreet: string
  addressNumber: string
  addressComplement: string
  addressCity: string
  addressState: string
}

export type SaleItem = {
  productId: string | null
  name: string
  quantity: number
  unitPriceCents: number
  subtotalCents: number
}

export type CreateSaleInput = {
  customerId: string | null
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  paymentMethod: 'cash' | 'pix' | 'card' | 'mixed'
  paymentDetails: Record<string, number> | null
  items: SaleItem[]
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function searchProducts(query: string): Promise<Product[]> {
  if (!query || query.trim().length < 2) return []

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  const q = query.trim()

  const [productsRes, partsRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, code, name, price_cents, stock_qty')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .order('name')
      .limit(8),
    supabase
      .from('parts_catalog')
      .select('id, sku, name, cost_cents')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(8),
  ])

  const products: Product[] = (productsRes.data ?? []).map(p => ({
    id:          p.id,
    code:        p.code ?? null,
    name:        p.name,
    price_cents: p.price_cents,
    stock_qty:   p.stock_qty,
    source:      'products' as const,
  }))

  const parts: Product[] = (partsRes.data ?? []).map(p => ({
    id:          p.id,
    code:        p.sku ?? null,
    name:        p.name,
    price_cents: p.cost_cents,
    stock_qty:   null,
    source:      'parts_catalog' as const,
  }))

  return [...products, ...parts].slice(0, 12)
}

export async function searchCustomerByCpf(cpf: string): Promise<Customer | null> {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return null

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data } = await supabase
    .from('customers')
    .select('id, full_name, cpf_cnpj, whatsapp, email')
    .eq('tenant_id', tenantId)
    .eq('cpf_cnpj', digits)
    .maybeSingle()

  return (data as Customer | null) ?? null
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id:          tenantId,
      full_name:          input.name.trim(),
      cpf_cnpj:           input.cpf.replace(/\D/g, '') || null,
      whatsapp:           input.whatsapp.replace(/\D/g, '') || null,
      email:              input.email.trim() || null,
      address_zip:        input.cep.replace(/\D/g, '') || null,
      address_street:     input.addressStreet.trim() || null,
      address_number:     input.addressNumber.trim() || null,
      address_complement: input.addressComplement.trim() || null,
      address_city:       input.addressCity.trim() || null,
      address_state:      input.addressState.trim() || null,
    })
    .select('id, full_name, cpf_cnpj, whatsapp, email')
    .single()

  if (error) throw new Error(error.message)
  return data as Customer
}

export async function createSale(input: CreateSaleInput): Promise<{ id: string }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      tenant_id:       tenantId,
      user_id:         user.id,
      customer_id:     input.customerId,
      subtotal_cents:  input.subtotalCents,
      discount_cents:  input.discountCents,
      shipping_cents:  input.shippingCents,
      total_cents:     input.totalCents,
      payment_method:  input.paymentMethod,
      payment_details: input.paymentDetails,
    })
    .select('id')
    .single()

  if (saleError) throw new Error(saleError.message)

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(
      input.items.map(item => ({
        sale_id:          sale.id,
        product_id:       item.productId,
        name:             item.name,
        quantity:         item.quantity,
        unit_price_cents: item.unitPriceCents,
        subtotal_cents:   item.subtotalCents,
      })),
    )

  if (itemsError) throw new Error(itemsError.message)

  return sale as { id: string }
}
