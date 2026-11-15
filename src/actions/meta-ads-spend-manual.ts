'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth }    from '@/lib/supabase/server'
import { getTenantId }    from '@/lib/tenant'

export type SpendEntry = {
  id: string
  spend_date: string
  amount_cents: number
  currency: string
  original_amount_cents: number | null
  exchange_rate: number | null
  impressions: number | null
  clicks: number | null
  conversations: number | null
  objective: string | null
  notes: string | null
  created_at: string
}

export async function addSpendEntry(
  amountCents: number,
  spendDate: string,
  notes?: string,
  currency?: string,
  originalAmountCents?: number,
  exchangeRate?: number,
  impressions?: number,
  clicks?: number,
  conversations?: number,
  objective?: string,
): Promise<{ error?: string }> {
  let auth
  try { auth = await requireAuth() } catch { return { error: 'Não autorizado' } }
  const { supabase, user } = auth
  const tenantId = getTenantId(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('meta_ads_spend_entries')
    .insert({
      tenant_id:             tenantId,
      amount_cents:          amountCents,
      spend_date:            spendDate,
      notes:                 notes ?? null,
      currency:              currency ?? 'BRL',
      original_amount_cents: originalAmountCents ?? null,
      exchange_rate:         exchangeRate ?? null,
      impressions:           impressions ?? null,
      clicks:                clicks ?? null,
      conversations:         conversations ?? null,
      objective:             objective ?? null,
    })

  if (error) return { error: error.message }
  revalidatePath('/meta-ads/relatorios')
  return {}
}

export async function deleteSpendEntry(id: string): Promise<{ error?: string }> {
  let auth
  try { auth = await requireAuth() } catch { return { error: 'Não autorizado' } }
  const { supabase, user } = auth
  const tenantId = getTenantId(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('meta_ads_spend_entries')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return { error: error.message }
  revalidatePath('/meta-ads/relatorios')
  return {}
}
