import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar, type PlanBadge } from '@/components/layout/topbar'
import {
  getTenantSubscriptions, daysUntilTrialEnds, getProductSubscription,
} from '@/lib/subscription'
import { TrialBanner } from '@/components/trial-banner'
import { hasFullAccess, getUserPermissions } from '@/lib/permissions'
import { VoiceFAB } from '@/components/voice-entry/voice-fab'
import { listStores } from '@/actions/stores'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let auth: Awaited<ReturnType<typeof requireAuth>>

  try {
    auth = await requireAuth()
  } catch {
    redirect('/login')
  }

  const { user } = auth
  const userName  = user.user_metadata?.full_name ?? user.user_metadata?.name ?? ''
  const userEmail = user.email ?? ''

  // Permissions pra Sidebar/MobileNav
  const fullAccess  = hasFullAccess(user)
  const permissions = await getUserPermissions(user)
  const isOwner     = user.app_metadata?.tenant_role === 'owner'

  // Status do plano principal (Gestão Smart) pra exibir no topbar
  const subs       = await getTenantSubscriptions(user)
  const trialDays  = daysUntilTrialEnds(subs)
  const gestaoSub  = getProductSubscription(subs, 'gestao_smart')

  // Determina badge a mostrar — prioridade: pagamento pendente > trial > plano ativo
  let planBadge: PlanBadge | null = null
  if (gestaoSub?.status === 'inactive') {
    planBadge = { label: 'Pagamento pendente', kind: 'pending' }
  } else if (gestaoSub?.status === 'late') {
    planBadge = { label: 'Pagamento em atraso', kind: 'late' }
  } else if (trialDays !== null) {
    planBadge = {
      label: trialDays === 0 ? 'Trial expira hoje' : `Trial · ${trialDays}d`,
      kind:  'trial',
    }
  } else if (gestaoSub?.status === 'active' && gestaoSub.planName) {
    const labels: Record<string, string> = { basico: 'BÁSICO', pro: 'PRO', premium: 'PREMIUM' }
    const label = labels[gestaoSub.planName] ?? gestaoSub.planName.toUpperCase()
    planBadge = { label, kind: gestaoSub.planName as 'basico' | 'pro' | 'premium' }
  }

  // Outros sistemas que o tenant tem ativos (pra link cruzado na sidebar)
  const PRODUCT_INFO: Record<string, { label: string; url: string; emoji: string }> = {
    crm:        { label: 'CRM',        url: 'https://crm.gestaosmarterp.online',        emoji: '💬' },
    checksmart: { label: 'CheckSmart', url: 'https://checksmart.gestaosmarterp.online', emoji: '🔧' },
  }
  const otherProducts = subs
    .filter(s => s.product !== 'gestao_smart' && (s.status === 'trial' || s.status === 'active' || s.status === 'late'))
    .map(s => PRODUCT_INFO[s.product])
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .map(info => ({ ...info, product: info.label }))

  // Lojas (multi-store) pra selector no topbar
  const stores = await listStores().catch(() => [])

  return (
    <div className="min-h-screen" style={{ background: '#131C2A' }}>
      <Sidebar hasFullAccess={fullAccess} allowedModules={permissions} isOwner={isOwner} otherProducts={otherProducts} />
      <Topbar
        userName={userName}
        userEmail={userEmail}
        planBadge={planBadge}
        hasFullAccess={fullAccess}
        allowedModules={permissions}
        isOwner={isOwner}
        otherProducts={otherProducts}
        stores={stores}
      />

      {/* Conteúdo principal — sem margem em mobile, 240px em lg+ pra dar espaço pra Sidebar */}
      <main className="pt-16 lg:ml-60">
        {trialDays !== null && <TrialBanner daysLeft={trialDays} />}
        <div className="min-h-[calc(100vh-4rem)] p-4 sm:p-6">
          {children}
        </div>
      </main>

      {/* Voice Entry FAB — visível em todas as páginas do dashboard */}
      <VoiceFAB />
    </div>
  )
}
