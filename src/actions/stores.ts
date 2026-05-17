'use server'

/**
 * Multi-store: CRUD de lojas dentro do tenant.
 * Produtos e clientes são compartilhados; vendas/despesas/caixa ficam
 * vinculadas a uma loja específica via store_id.
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { ACTIVE_STORE_COOKIE } from '@/lib/active-store'

export type Store = {
  id:                    string
  name:                  string
  code:                  string
  color:                 string
  is_default:            boolean
  is_active:             boolean
  monthly_goal_cents:    number
  stock_source_store_id: string | null
  created_at:            string
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

  // Tenta query completa, com fallbacks progressivos pra colunas que podem
  // ainda não existir no banco (stock_source_store_id, monthly_goal_cents).
  let rawStores: Store[] | null = null

  const q1 = await sb
    .from('stores')
    .select('id, name, code, color, is_default, is_active, monthly_goal_cents, stock_source_store_id, created_at')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (!q1.error) {
    rawStores = (q1.data ?? []) as Store[]
  } else {
    console.error('[listStores] q1 falhou:', q1.error.code, q1.error.message)
    // Fallback sem stock_source_store_id
    const q2 = await sb
      .from('stores')
      .select('id, name, code, color, is_default, is_active, monthly_goal_cents, created_at')
      .eq('tenant_id', tenantId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (!q2.error) {
      rawStores = ((q2.data ?? []) as Store[]).map((s: Store) => ({ ...s, stock_source_store_id: null }))
    } else {
      console.error('[listStores] q2 falhou:', q2.error.code, q2.error.message)
      // Fallback sem monthly_goal_cents nem stock_source_store_id
      const q3 = await sb
        .from('stores')
        .select('id, name, code, color, is_default, is_active, created_at')
        .eq('tenant_id', tenantId)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })

      if (!q3.error) {
        rawStores = ((q3.data ?? []) as Store[]).map((s: Store) => ({
          ...s,
          monthly_goal_cents: 0,
          stock_source_store_id: null,
        }))
      } else {
        console.error('[listStores] q3 falhou:', q3.error.code, q3.error.message)
        rawStores = []
      }
    }
  }

  // Se não existe nenhuma loja, cria a padrão automaticamente
  if (rawStores.length === 0) {
    const { data: newStore } = await sb
      .from('stores')
      .insert({
        tenant_id:  tenantId,
        name:       'Loja Principal',
        code:       'PRINCIPAL',
        color:      '#3B82F6',
        is_default: true,
        is_active:  true,
      })
      .select('id, name, code, color, is_default, is_active, created_at')
      .single()
    if (newStore) {
      rawStores = [{ ...newStore, monthly_goal_cents: 0, stock_source_store_id: null }]
    }
  }

  let stores = rawStores

  // Filtra pelas lojas permitidas pro funcionário (owner vê tudo)
  const role = user.app_metadata?.tenant_role
  if (role !== 'owner') {
    const { data: member } = await sb
      .from('tenant_members')
      .select('allowed_store_ids')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .maybeSingle()
    const allowed = (member?.allowed_store_ids as string[] | null) ?? []
    if (allowed.length > 0) {
      stores = stores.filter(s => allowed.includes(s.id))
    }
    // Se array vazio, vê todas (default)
  }

  return stores
}

// ── Default store ───────────────────────────────────────────────────────
export async function getDefaultStore(): Promise<Store | null> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('stores')
    .select('id, name, code, color, is_default, is_active, monthly_goal_cents, stock_source_store_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle()
  if (error && (error.code === '42703' || error.message?.includes('stock_source_store_id'))) {
    const { data: fallback } = await sb
      .from('stores').select('id, name, code, color, is_default, is_active, monthly_goal_cents, created_at')
      .eq('tenant_id', tenantId).eq('is_default', true).maybeSingle()
    return fallback ? { ...fallback, stock_source_store_id: null } : null
  }
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

// ── Set active store (cookie) ───────────────────────────────────────────
export async function setActiveStoreCookie(storeId: string): Promise<Result> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Valida que a store pertence ao tenant
  const { data } = await sb
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return { ok: false, error: 'Loja inválida ou inativa' }

  const c = await cookies()
  c.set(ACTIVE_STORE_COOKIE, storeId, {
    path:     '/',
    maxAge:   60 * 60 * 24 * 365,  // 1 ano
    sameSite: 'lax',
    httpOnly: false,                // client precisa ler também
  })
  return { ok: true }
}

// ── Update goal ─────────────────────────────────────────────────────────
export async function updateStoreGoal(id: string, monthlyGoalCents: number): Promise<Result> {
  if (!Number.isInteger(monthlyGoalCents) || monthlyGoalCents < 0) {
    return { ok: false, error: 'Meta inválida' }
  }
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { error } = await sb
    .from('stores')
    .update({ monthly_goal_cents: monthlyGoalCents, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/lojas')
  revalidatePath('/relatorios')
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

// ── Update stock source (estoque compartilhado) ─────────────────────────
// stockSourceId = null → estoque próprio
// stockSourceId = uuid → compartilha pool com essa loja
export async function updateStockSource(id: string, stockSourceId: string | null): Promise<Result> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  if (stockSourceId === id) return { ok: false, error: 'Uma loja não pode apontar para ela mesma' }

  // Valida que a loja de destino pertence ao mesmo tenant
  if (stockSourceId) {
    const { data } = await sb
      .from('stores')
      .select('id')
      .eq('id', stockSourceId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (!data) return { ok: false, error: 'Loja de estoque não encontrada' }
  }

  const { error } = await sb
    .from('stores')
    .update({ stock_source_store_id: stockSourceId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/configuracoes/lojas')
  return { ok: true }
}
