import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOrCreateConsumidorFinal } from '@/actions/pos'
import { getSettings } from '@/actions/settings'
import { PosClient } from './pos-client'

export const metadata = { title: 'Frente de Caixa — Smart ERP' }

export default async function PosPage() {
  try { await requireAuth() } catch { redirect('/login') }

  const [consumidorFinal, settings] = await Promise.all([
    getOrCreateConsumidorFinal(),
    getSettings(),
  ])

  return <PosClient consumidorFinal={consumidorFinal} stockControlMode={settings.stock_control_mode} />
}
