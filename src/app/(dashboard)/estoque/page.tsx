import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listProducts, listBrands } from '@/actions/products'
import { EstoqueClient } from './estoque-client'

export const metadata = { title: 'Estoque — Smart ERP' }

export default async function EstoquePage() {
  try { await requireAuth() } catch { redirect('/login') }

  const [products, brands] = await Promise.all([
    listProducts(),
    listBrands(),
  ])

  return <EstoqueClient initialProducts={products} brands={brands} />
}
