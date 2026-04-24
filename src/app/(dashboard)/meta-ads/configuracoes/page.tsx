import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getMetaAdsCredentials } from '@/actions/meta-ads'
import { ConfiguracoesClient } from './configuracoes-client'

export const metadata = { title: 'Configurações — Meta Ads' }

export default async function MetaAdsConfiguracoesPage() {
  try { await requireAuth() } catch { redirect('/login') }
  const current = await getMetaAdsCredentials()
  return <ConfiguracoesClient current={current} />
}
