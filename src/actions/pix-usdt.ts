'use server'

/**
 * Cobrança Pix → USDT (ZimPay) no PDV do Gestão Smart.
 *
 * Fluxo no PDV: colaborador escolhe PIX → "QR automático" → gera cobrança →
 * quando a ZimPay confirma o Pix, o PDV finaliza a venda e liga a cobrança à venda.
 * Colaborador só cria cobrança e vê status. Nada de saldo, saque ou credencial.
 */

import { z } from 'zod'
import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createCharge, syncCharge, toPublic, isZimpayEnabledForTenant, onlyDigits, PAID_STATUSES,
  type PixUsdtCharge, type PixUsdtChargePublic,
} from '@/lib/zimpay'

type Result<T> = { data?: T; error?: string }

const CreateSchema = z.object({
  amountCents:   z.number().int().min(100, 'Valor mínimo R$ 1,00').max(5_000_000, 'Valor acima do limite'),
  payerName:     z.string().trim().min(3, 'Informe o nome do pagador').max(120),
  payerDocument: z.string().transform(onlyDigits).refine(v => v.length === 11 || v.length === 14, 'CPF/CNPJ inválido'),
})

async function auth() {
  try {
    const { user } = await requireAuth()
    const tenantId = getTenantId(user)
    return tenantId ? { user, tenantId } : null
  } catch { return null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any { return createAdminClient() }

export async function isPixUsdtEnabled(): Promise<boolean> {
  const a = await auth()
  return !!a && isZimpayEnabledForTenant(a.tenantId)
}

export async function createPixUsdtChargeForSale(input: unknown): Promise<Result<PixUsdtChargePublic>> {
  const a = await auth()
  if (!a) return { error: 'Sessão expirada. Faça login novamente.' }
  if (!isZimpayEnabledForTenant(a.tenantId)) return { error: 'Pix QR automático não está habilitado para esta loja.' }

  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }

  try {
    const charge = await createCharge(admin(), {
      tenantId: a.tenantId, userId: a.user.id, product: 'smarterp',
      sourceType: 'sale', sourceId: null, ...parsed.data,
    })
    return { data: toPublic(charge) }
  } catch (e) {
    return { error: (e as Error).message || 'Erro ao gerar cobrança.' }
  }
}

export async function getPixUsdtCharge(chargeId: string): Promise<Result<PixUsdtChargePublic>> {
  const a = await auth()
  if (!a) return { error: 'Sessão expirada.' }
  if (!z.string().uuid().safeParse(chargeId).success) return { error: 'Cobrança inválida.' }

  const db = admin()
  const { data: row } = await db
    .from('pix_usdt_charges').select('*')
    .eq('id', chargeId).eq('tenant_id', a.tenantId).single()
  if (!row) return { error: 'Cobrança não encontrada.' }

  const { charge } = await syncCharge(db, row as PixUsdtCharge)
  return { data: toPublic(charge) }
}

/** Liga a cobrança paga à venda recém-criada. Só aceita cobrança paga, do tenant, ainda sem venda. */
export async function linkPixUsdtChargeToSale(chargeId: string, saleId: string): Promise<Result<true>> {
  const a = await auth()
  if (!a) return { error: 'Sessão expirada.' }
  if (!z.string().uuid().safeParse(chargeId).success || !z.string().uuid().safeParse(saleId).success) {
    return { error: 'IDs inválidos.' }
  }
  const db = admin()
  const { data: row } = await db
    .from('pix_usdt_charges').select('id, status, source_id')
    .eq('id', chargeId).eq('tenant_id', a.tenantId).single()
  if (!row) return { error: 'Cobrança não encontrada.' }
  if (!PAID_STATUSES.includes(row.status)) return { error: 'Cobrança ainda não foi paga.' }
  if (row.source_id) return { data: true }

  const { data: sale } = await db.from('sales').select('id').eq('id', saleId).eq('tenant_id', a.tenantId).maybeSingle()
  if (!sale) return { error: 'Venda não encontrada.' }

  await db.from('pix_usdt_charges')
    .update({ source_id: saleId, updated_at: new Date().toISOString() })
    .eq('id', chargeId).is('source_id', null)
  return { data: true }
}

/** Cobranças pagas que não viraram venda (ex.: navegador fechado antes de finalizar). */
export async function listOrphanPaidPixUsdtCharges(): Promise<PixUsdtChargePublic[]> {
  const a = await auth()
  if (!a) return []
  const { data } = await admin()
    .from('pix_usdt_charges').select('*')
    .eq('tenant_id', a.tenantId).eq('source_type', 'sale').is('source_id', null)
    .in('status', PAID_STATUSES)
    .order('created_at', { ascending: false }).limit(10)
  return ((data ?? []) as PixUsdtCharge[]).map(toPublic)
}
