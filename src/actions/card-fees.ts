'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { type CardFees, parseCardFees, loadCardFees } from '@/lib/card-fees'

export async function getCardFees(): Promise<CardFees | null> {
  try {
    const { supabase, user } = await requireAuth()
    return await loadCardFees(supabase, getTenantId(user))
  } catch { return null }
}

export async function saveCardFees(fees: CardFees): Promise<{ error?: string }> {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { return { error: 'Sessão expirada. Faça login novamente.' } }
  if (auth.user.app_metadata?.tenant_role !== 'owner') return { error: 'Só o proprietário pode alterar as taxas.' }

  const clean = parseCardFees(fees) ?? { debit: null, credit: {} }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (auth.supabase as any)
    .from('tenant_settings')
    .upsert({ tenant_id: getTenantId(auth.user), card_fees: clean, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
  if (error) {
    console.error('[saveCardFees]', error.message)
    return { error: error.message.includes('card_fees') ? 'Falta rodar o SQL das taxas no Supabase.' : 'Erro ao salvar as taxas.' }
  }
  revalidatePath('/configuracoes'); revalidatePath('/pos'); revalidatePath('/relatorios')
  return {}
}
