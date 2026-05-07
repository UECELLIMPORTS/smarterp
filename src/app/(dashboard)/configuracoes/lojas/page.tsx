import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/supabase/server'
import { listStores } from '@/actions/stores'
import { LojasClient } from './client'

export const metadata: Metadata = { title: 'Lojas' }
export const dynamic = 'force-dynamic'

export default async function LojasPage() {
  try { await requireAuth() } catch { redirect('/login') }
  const stores = await listStores()
  return <LojasClient initial={stores} />
}
