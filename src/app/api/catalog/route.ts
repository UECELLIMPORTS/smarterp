import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Endpoint público para o Evo CRM AI consultar o catálogo de produtos.
// Protegido por API key via header X-Catalog-Key ou query param key.

export async function GET(req: NextRequest) {
  const apiKey =
    req.headers.get('x-catalog-key') ??
    req.nextUrl.searchParams.get('key')

  if (!apiKey || apiKey !== process.env.CATALOG_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = process.env.CATALOG_TENANT_ID
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant not configured' }, { status: 500 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase()

  const supabase = createAdminClient()

  let query = supabase
    .from('products')
    .select('name, brand, category, price_cents, stock_qty, description, condition, unit')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('name')
    .limit(50)

  if (q) {
    query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const products = (data ?? []).map((p) => ({
    nome: p.name,
    marca: p.brand ?? '',
    categoria: p.category ?? '',
    preco: p.price_cents ? `R$ ${(p.price_cents / 100).toFixed(2).replace('.', ',')}` : 'Consultar',
    estoque: p.stock_qty > 0 ? `${p.stock_qty} ${p.unit ?? 'un'}` : 'Sem estoque',
    condicao: p.condition === 'novo' ? 'Novo' : p.condition === 'usado' ? 'Usado' : 'Recondicionado',
    descricao: p.description ?? '',
  }))

  return NextResponse.json({ total: products.length, products })
}
