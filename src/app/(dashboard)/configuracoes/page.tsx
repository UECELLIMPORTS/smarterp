import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSettings } from '@/actions/settings'
import { listRecurringExpenses } from '@/actions/recurring-expenses'
import { getBrandingSettings } from '@/actions/comprovante'
import { getBirthdayConfig } from '@/actions/birthdays'
import { ConfiguracoesClient } from './configuracoes-client'
import { getCardFees } from '@/actions/card-fees'

export const metadata = { title: 'Configurações — Smart ERP' }

export default async function ConfiguracoesPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const [settings, expenses, branding, birthdayConfig, cardFees] = await Promise.all([
    getSettings(),
    listRecurringExpenses(),
    getBrandingSettings(),
    getBirthdayConfig(),
    getCardFees(),
  ])
  const isOwner = auth.user.app_metadata?.tenant_role === 'owner'

  return (
    <ConfiguracoesClient
      initialSettings={settings}
      isOwner={isOwner}
      initialExpenses={expenses}
      initialBranding={branding}
      initialBirthdayConfig={birthdayConfig}
      initialCardFees={cardFees}
    />
  )
}
