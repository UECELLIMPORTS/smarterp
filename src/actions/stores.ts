'use server'

/**
 * Multi-store: CRUD de lojas dentro do tenant.
 * Produtos e clientes são compartilhados; vendas/despesas/caixa ficam
 * vinculadas a uma loja específica via store_id.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'

export type Store = {
  id:         string
  name:       string
  code:       string
  color:      string
  is_default: boolean
  is_active:  boolean
  created_at: string
}

export type Result<T = void> =
  | { ok: true;  data: T }
  | { ok: true }
  | { ok: false; error: string }

const UpsertSchema = z.object({
  name:  z.string().trim().min(2, 'Nome muito curto').max(60),
  code:  z.string().trim().min(2, 'Código muito curto').max(20).regex(/^[A-Z0-9_-]+$/i, 'Use letras/números/_-'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor hex inválida').default('#3B82F6'),
})

// ── List ─────────────────────────────────────────────────────────────────
export async function listStores(): Promise<Store[]> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data } = await sb
    .from('stores')
    .select('id, name, code, color, is_default, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
  return ((data ?? []) as Store[])
}

// ── Default store ───────────────────────────────────────────────────────
export async function getDefaultStore(): Promise<Store | null> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data } = await sb
    .from('stores')
    .select('id, name, code, color, is_default, is_active, created_at')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle()
  return data as Store | null
}

// ── Create ──────────────────────────────────────────────────────────────
export async function createStore(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = UpsertSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data, error } = await sb
    .from('stores')
    .insert({
      tenant_id:  tenantId,
      name:       parsed.data.name,
      code:       parsed.data.code.toUpperCase(),
      color:      parsed.data.color,
      is_default: false,
      is_active:  true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Já existe uma loja com esse código' }
    return { ok: false, error: error.message }
  }

  revalidatePath('/configuracoes/lojas')
  return { ok: true, data: { id: data.id as string } }
}

// ── Update ──────────────────────────────────────────────────────────────
export async function updateStore(id: string, input: unknown): Promise<Result> {
  const parsed = UpsertSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { error } = await sb
    .from('stores')
    .update({
      name:       parsed.data.name,
      code:       parsed.data.code.toUpperCase(),
      color:      parsed.data.color,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Já existe uma loja com esse código' }
    return { ok: false, error: error.message }
  }
  revalidatePath('/configuracoes/lojas')
  return { ok: true }
}

// ── Toggle active ───────────────────────────────────────────────────────
export async function toggleStoreActive(id: string, active: boolean): Promise<Result> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Não permite desativar default
  if (!active) {
    const { data } = await sb.from('stores').select('is_default').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
    if (data?.is_default) return { ok: false, error: 'Não dá pra desativar a loja padrão' }
  }

  const { error } = await sb
    .from('stores')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/lojas')
  return { ok: true }
}
