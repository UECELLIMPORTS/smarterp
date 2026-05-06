import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getWhatsAppStatus, listTemplates, listRecentMessages,
} from '@/actions/whatsapp'
import { getTenantSubscriptions, canUseAutomation } from '@/lib/subscription'
import { WhatsAppClient } from './whatsapp-client'

export const metadata = { title: 'WhatsApp — Smart ERP' }

export default async function WhatsAppPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const [status, templates, messages, subs] = await Promise.all([
    getWhatsAppStatus(),
    listTemplates(),
    listRecentMessages(20),
    getTenantSubscriptions(auth.user),
  ])

  const automationEnabled = canUseAutomation(subs)

  return (
    <WhatsAppClient
      initialStatus={status}
      initialTemplates={templates}
      initialMessages={messages}
      automationEnabled={automationEnabled}
    />
  )
}
