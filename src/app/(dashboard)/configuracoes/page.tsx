import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSettings } from '@/actions/settings'
import { ConfiguracoesClient } from './configuracoes-client'

export const metadata = { title: 'Configurações — Smart ERP' }

export default async function ConfiguracoesPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const settings = await getSettings()
  const isOwner  = auth.user.app_metadata?.tenant_role === 'owner'

  return <ConfiguracoesClient initialSettings={settings} isOwner={isOwner} />
}
