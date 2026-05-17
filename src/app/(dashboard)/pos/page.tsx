import { requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOrCreateConsumidorFinal } from '@/actions/pos'
import { getSettings } from '@/actions/settings'
import { getActiveCashSession, getLastClosedSession } from '@/actions/cash'
import { listStores } from '@/actions/stores'
import { getTenantId } from '@/lib/tenant'
import { resolveActiveStoreId } from '@/lib/active-store'
import { PosClient } from './pos-client'
import { CaixaFechado } from './caixa-fechado'
import { CaixaAbertoHeader } from './caixa-aberto-header'

export const metadata = { title: 'Frente de Caixa — Smart ERP' }
export const dynamic = 'force-dynamic'

export default async function PosPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = auth.supabase as any
  const tenantId = getTenantId(auth.user)

  const [session, stores] = await Promise.all([
    getActiveCashSession(),
    listStores(),
  ])

  // Caixa fechado → mostra tela de abrir caixa + resumo da última sessão
  if (!session) {
    const [lastSummary, activeStoreId] = await Promise.all([
      getLastClosedSession(),
      resolveActiveStoreId(sb, tenantId),
    ])
    const activeStore = stores.find(s => s.id === activeStoreId) ?? stores.find(s => s.is_default) ?? null
    return <CaixaFechado lastSummary={lastSummary} activeStoreName={activeStore?.name ?? null} stores={stores} />
  }

  // Caixa aberto → header com botão fechar + POS normal
  const [consumidorFinal, settings] = await Promise.all([
    getOrCreateConsumidorFinal(),
    getSettings(),
  ])

  return (
    <>
      <CaixaAbertoHeader session={session} />
      <PosClient
        consumidorFinal={consumidorFinal}
        stockControlMode={settings.stock_control_mode}
      />
    </>
  )
}
