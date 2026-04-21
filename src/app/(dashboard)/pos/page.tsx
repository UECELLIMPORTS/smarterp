import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOrCreateConsumidorFinal } from '@/actions/pos'
import { PosClient } from './pos-client'

export const metadata = { title: 'Frente de Caixa — Smart ERP' }

export default async function PosPage() {
  try { await requireAuth() } catch { redirect('/login') }

  const consumidorFinal = await getOrCreateConsumidorFinal()

  return <PosClient consumidorFinal={consumidorFinal} />
}
