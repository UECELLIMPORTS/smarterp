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
  birthDate: string
  cep: string
  addressStreet: string
  addressNumber: string
  addressComplement: string
  addressCity: string
  addressState: string
}

export type UpdateCustomerInput = CreateCustomerInput & { id: string }

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

export async function searchCustomers(query: string): Promise<Customer[]> {
  if (!query || query.trim().length < 2) return []

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  const q      = query.trim()
  const digits = q.replace(/\D/g, '')

  const filters: string[] = [`full_name.ilike.%${q}%`]
  if (digits.length >= 8) filters.push(`whatsapp.ilike.%${digits}%`)
  if (digits.length === 11) filters.push(`cpf_cnpj.eq.${digits}`)

  const { data } = await supabase
    .from('customers')
    .select('id, full_name, cpf_cnpj, whatsapp, email')
    .eq('tenant_id', tenantId)
    .or(filters.join(','))
    .order('full_name')
    .limit(6)

  return (data ?? []) as Customer[]
}

export async function getOrCreateConsumidorFinal(): Promise<Customer> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const { data: existing } = await supabase
    .from('customers')
    .select('id, full_name, cpf_cnpj, whatsapp, email')
    .eq('tenant_id', tenantId)
    .eq('full_name', 'Consumidor Final')
    .is('cpf_cnpj', null)
    .limit(1)

  if (existing && existing.length > 0) return existing[0] as Customer

  const { data, error } = await supabase
    .from('customers')
    .insert({ tenant_id: tenantId, full_name: 'Consumidor Final' })
    .select('id, full_name, cpf_cnpj, whatsapp, email')
    .single()

  if (error) throw new Error(error.message)
  return data as Customer
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // Duplicate CPF check
  const cpfDigits = input.cpf.replace(/\D/g, '')
  if (cpfDigits) {
    const { data: dups } = await supabase
      .from('customers')
      .select('full_name')
      .eq('tenant_id', tenantId)
      .eq('cpf_cnpj', cpfDigits)
      .limit(1)
    if (dups && dups.length > 0) throw new Error(`CPF já cadastrado para: ${dups[0].full_name}`)
  }

  // Duplicate WhatsApp check
  const whatsDigits = input.whatsapp.replace(/\D/g, '')
  if (whatsDigits) {
    const { data: dups } = await supabase
      .from('customers')
      .select('full_name')
      .eq('tenant_id', tenantId)
      .eq('whatsapp', whatsDigits)
      .limit(1)
    if (dups && dups.length > 0) throw new Error(`WhatsApp já cadastrado para: ${dups[0].full_name}`)
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      tenant_id:          tenantId,
      full_name:          input.name.trim(),
      cpf_cnpj:           cpfDigits || null,
      whatsapp:           whatsDigits || null,
      email:              input.email.trim() || null,
      birth_date:         input.birthDate || null,
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

export async function updateCustomer(input: UpdateCustomerInput): Promise<Customer> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const cpfDigits   = input.cpf.replace(/\D/g, '')
  const whatsDigits = input.whatsapp.replace(/\D/g, '')

  // Duplicate CPF check (exclude self)
  if (cpfDigits) {
    const { data: dups } = await supabase
      .from('customers')
      .select('full_name')
      .eq('tenant_id', tenantId)
      .eq('cpf_cnpj', cpfDigits)
      .neq('id', input.id)
      .limit(1)
    if (dups && dups.length > 0) throw new Error(`CPF já cadastrado para: ${dups[0].full_name}`)
  }

  // Duplicate WhatsApp check (exclude self)
  if (whatsDigits) {
    const { data: dups } = await supabase
      .from('customers')
      .select('full_name')
      .eq('tenant_id', tenantId)
      .eq('whatsapp', whatsDigits)
      .neq('id', input.id)
      .limit(1)
    if (dups && dups.length > 0) throw new Error(`WhatsApp já cadastrado para: ${dups[0].full_name}`)
  }

  const { data, error } = await supabase
    .from('customers')
    .update({
      full_name:          input.name.trim(),
      cpf_cnpj:           cpfDigits || null,
      whatsapp:           whatsDigits || null,
      email:              input.email.trim() || null,
      birth_date:         input.birthDate || null,
      address_zip:        input.cep.replace(/\D/g, '') || null,
      address_street:     input.addressStreet.trim() || null,
      address_number:     input.addressNumber.trim() || null,
      address_complement: input.addressComplement.trim() || null,
      address_city:       input.addressCity.trim() || null,
      address_state:      input.addressState.trim() || null,
    })
    .eq('id', input.id)
    .eq('tenant_id', tenantId)
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
