import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTenantSubscriptions, getProductSubscription, daysUntilTrialEnds } from '@/lib/subscription'
import { AssinaturaClient } from './assinatura-client'

export const metadata = { title: 'Minha Assinatura — Smart ERP' }

export default async function AssinaturaPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const subs = await getTenantSubscriptions(auth.user)

  // Estado consolidado pra renderizar os 4 produtos (contratados ou não)
  const data = {
    gestaoSmart: getProductSubscription(subs, 'gestao_smart'),
    checkSmart:  getProductSubscription(subs, 'checksmart'),
    crm:         getProductSubscription(subs, 'crm'),
    metaAds:     getProductSubscription(subs, 'meta_ads'),
    trialDays:   daysUntilTrialEnds(subs),
    userEmail:   auth.user.email ?? '',
  }

  return <AssinaturaClient data={data} />
}
