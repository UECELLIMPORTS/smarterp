'use server'

/**
 * Server Actions do painel /admin/afiliados. Mesma lógica de auth do
 * /admin tradicional: lista de emails autorizados.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/supabase/server'

const ADMIN_EMAILS = [
  'uedsonfelipepessoal@gmail.com',
  'uedsonfelipeprofissional@gmail.com',
]

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

async function requireAdmin(): Promise<{ email: string } | { error: string }> {
  try {
    const { user } = await requireAuth()
    const email = user.email ?? ''
    if (!ADMIN_EMAILS.includes(email)) return { error: 'Acesso negado.' }
    return { email }
  } catch {
    return { error: 'Não autenticado.' }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 1. Lista
// ──────────────────────────────────────────────────────────────────────────

export type AffiliateListItem = {
  id:               string
  fullName:         string
  email:            string
  whatsapp:         string | null
  refCode:          string
  status:           'pending_email' | 'active' | 'paused' | 'banned'
  source:           'manual' | 'public'
  createdAt:        string
  conversions:      number
  payableCents:     number
  pendingCents:     number
}

export async function listAffiliates(filter?: { status?: string; source?: string; q?: string }): Promise<AffiliateListItem[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  let q = sb.from('affiliates')
    .select('id, full_name, email, whatsapp, ref_code, status, source, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (filter?.status) q = q.eq('status', filter.status)
  if (filter?.source) q = q.eq('source', filter.source)
  if (filter?.q) {
    const term = filter.q.trim()
    q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,ref_code.ilike.%${term}%`)
  }

  const { data: rows } = await q
  if (!rows || rows.length === 0) return []

  const ids = rows.map((r: { id: string }) => r.id)

  // Conversions count + comissões agregadas em paralelo
  const [convRes, commRes] = await Promise.all([
    sb.from('affiliate_referrals')
      .select('affiliate_id, status', { count: 'exact' })
      .in('affiliate_id', ids)
      .neq('status', 'rejected'),
    sb.from('affiliate_commissions')
      .select('affiliate_id, amount_cents, status')
      .in('affiliate_id', ids)
      .in('status', ['payable', 'pending_approval', 'under_review']),
  ])

  const convMap: Record<string, number>     = {}
  const payableMap: Record<string, number>  = {}
  const pendingMap: Record<string, number>  = {}

  ;(convRes.data ?? []).forEach((r: { affiliate_id: string }) => {
    convMap[r.affiliate_id] = (convMap[r.affiliate_id] ?? 0) + 1
  })
  ;(commRes.data ?? []).forEach((r: { affiliate_id: string; amount_cents: number; status: string }) => {
    if (r.status === 'payable') {
      payableMap[r.affiliate_id] = (payableMap[r.affiliate_id] ?? 0) + r.amount_cents
    } else {
      pendingMap[r.affiliate_id] = (pendingMap[r.affiliate_id] ?? 0) + r.amount_cents
    }
  })

  return rows.map((r: { id: string; full_name: string; email: string; whatsapp: string | null; ref_code: string; status: AffiliateListItem['status']; source: AffiliateListItem['source']; created_at: string }) => ({
    id:           r.id,
    fullName:     r.full_name,
    email:        r.email,
    whatsapp:     r.whatsapp,
    refCode:      r.ref_code,
    status:       r.status,
    source:       r.source,
    createdAt:    r.created_at,
    conversions:  convMap[r.id]    ?? 0,
    payableCents: payableMap[r.id] ?? 0,
    pendingCents: pendingMap[r.id] ?? 0,
  }))
}

// ──────────────────────────────────────────────────────────────────────────
// 2. KPIs do topo da lista
// ──────────────────────────────────────────────────────────────────────────

export type AffiliateKpis = {
  total:           number
  active:          number
  banned:          number
  payableCents:    number
  pendingCents:    number
  underReviewCount: number
}

export async function getAffiliateKpis(): Promise<AffiliateKpis> {
  const auth = await requireAdmin()
  const empty: AffiliateKpis = { total: 0, active: 0, banned: 0, payableCents: 0, pendingCents: 0, underReviewCount: 0 }
  if ('error' in auth) return empty

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const [tot, act, ban, comm, urc] = await Promise.all([
    sb.from('affiliates').select('*', { count: 'exact', head: true }),
    sb.from('affiliates').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    sb.from('affiliates').select('*', { count: 'exact', head: true }).eq('status', 'banned'),
    sb.from('affiliate_commissions').select('amount_cents, status'),
    sb.from('affiliate_referrals').select('*', { count: 'exact', head: true }).eq('status', 'under_review'),
  ])

  let payableCents = 0, pendingCents = 0
  ;(comm.data ?? []).forEach((c: { amount_cents: number; status: string }) => {
    if (c.status === 'payable') payableCents += c.amount_cents
    else if (c.status === 'pending_approval' || c.status === 'under_review') pendingCents += c.amount_cents
  })

  return {
    total:            tot.count ?? 0,
    active:           act.count ?? 0,
    banned:           ban.count ?? 0,
    payableCents,
    pendingCents,
    underReviewCount: urc.count ?? 0,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 3. Cadastro manual
// ──────────────────────────────────────────────────────────────────────────

export type CreateAffiliateInput = {
  fullName:    string
  email:       string
  whatsapp?:   string
  cpfCnpj?:    string
  pixKey?:     string
  pixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'
  instagram?:  string
  refCode?:    string                                   // se não passar, gera
  notes?:      string
}

export async function createAffiliateManual(input: CreateAffiliateInput): Promise<Result<{ id: string; refCode: string }>> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const fullName = input.fullName.trim()
  const email    = input.email.trim().toLowerCase()
  if (fullName.length < 2)              return { ok: false, error: 'Nome muito curto' }
  if (!/^\S+@\S+\.\S+$/.test(email))    return { ok: false, error: 'Email inválido' }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  // Gera ref_code se não veio
  let refCode = (input.refCode ?? '').trim().toUpperCase()
  if (!refCode) {
    const { data: gen, error: genErr } = await sb.rpc('generate_ref_code')
    if (genErr || !gen) return { ok: false, error: `Falha ao gerar código: ${genErr?.message ?? '—'}` }
    refCode = gen as string
  } else if (!/^[A-Z0-9]{4,12}$/.test(refCode)) {
    return { ok: false, error: 'Código deve ter 4-12 letras/números' }
  }

  const whatsapp = input.whatsapp ? input.whatsapp.replace(/\D/g, '') : null
  const cpfCnpj  = input.cpfCnpj  ? input.cpfCnpj.replace(/\D/g, '')  : null

  const { data, error } = await sb.from('affiliates').insert({
    full_name:     fullName,
    email,
    whatsapp,
    cpf_cnpj:      cpfCnpj,
    pix_key:       input.pixKey?.trim() || null,
    pix_key_type:  input.pixKeyType ?? null,
    instagram:     input.instagram?.trim() || null,
    ref_code:      refCode,
    source:        'manual',
    status:        'active',                // manual já vem ativo
    email_confirmed_at: new Date().toISOString(),
    notes:         input.notes?.trim() || null,
  }).select('id, ref_code').single()

  if (error) {
    if (error.code === '23505') {
      if (error.message.includes('email'))    return { ok: false, error: 'Email já cadastrado' }
      if (error.message.includes('ref_code')) return { ok: false, error: 'Código já em uso' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/afiliados')
  return { ok: true, data: { id: data.id as string, refCode: data.ref_code as string } }
}

// ──────────────────────────────────────────────────────────────────────────
// 4. Detalhe
// ──────────────────────────────────────────────────────────────────────────

export type AffiliateDetail = {
  id:               string
  fullName:         string
  email:            string
  whatsapp:         string | null
  cpfCnpj:          string | null
  pixKey:           string | null
  pixKeyType:       string | null
  instagram:        string | null
  refCode:          string
  status:           string
  source:           string
  commissionPct:    number
  recurringPct:     number
  recurringMonths:  number
  cookieDays:       number
  minPayoutCents:   number
  notes:            string | null
  createdAt:        string
  emailConfirmedAt: string | null
  bannedAt:         string | null
  banReason:        string | null

  referrals:        Array<{
    id: string; tenantId: string; signupAt: string; status: string;
    fraudFlags: string[]; product: string | null
  }>
  commissions:      Array<{
    id: string; type: 'initial' | 'recurring'; status: string; amountCents: number;
    baseAmountCents: number; pct: number; refMonth: string; holdUntil: string;
    paidAt: string | null; createdAt: string;
  }>
}

export async function getAffiliateDetail(id: string): Promise<AffiliateDetail | null> {
  const auth = await requireAdmin()
  if ('error' in auth) return null

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const [affRes, refRes, comRes] = await Promise.all([
    sb.from('affiliates').select('*').eq('id', id).maybeSingle(),
    sb.from('affiliate_referrals')
      .select('id, tenant_id, signup_at, status, fraud_flags, product')
      .eq('affiliate_id', id)
      .order('signup_at', { ascending: false }),
    sb.from('affiliate_commissions')
      .select('id, type, status, amount_cents, base_amount_cents, pct, ref_month, hold_until, paid_at, created_at')
      .eq('affiliate_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!affRes.data) return null
  const a = affRes.data

  return {
    id:               a.id,
    fullName:         a.full_name,
    email:            a.email,
    whatsapp:         a.whatsapp,
    cpfCnpj:          a.cpf_cnpj,
    pixKey:           a.pix_key,
    pixKeyType:       a.pix_key_type,
    instagram:        a.instagram,
    refCode:          a.ref_code,
    status:           a.status,
    source:           a.source,
    commissionPct:    Number(a.commission_pct),
    recurringPct:     Number(a.recurring_pct),
    recurringMonths:  a.recurring_months,
    cookieDays:       a.cookie_days,
    minPayoutCents:   a.min_payout_cents,
    notes:            a.notes,
    createdAt:        a.created_at,
    emailConfirmedAt: a.email_confirmed_at,
    bannedAt:         a.banned_at,
    banReason:        a.ban_reason,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    referrals: (refRes.data ?? []).map((r: any) => ({
      id: r.id, tenantId: r.tenant_id, signupAt: r.signup_at, status: r.status,
      fraudFlags: r.fraud_flags ?? [], product: r.product,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    commissions: (comRes.data ?? []).map((c: any) => ({
      id: c.id, type: c.type, status: c.status, amountCents: c.amount_cents,
      baseAmountCents: c.base_amount_cents, pct: Number(c.pct),
      refMonth: c.ref_month, holdUntil: c.hold_until, paidAt: c.paid_at,
      createdAt: c.created_at,
    })),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 5. Status — pausar / retomar / banir / desbanir
// ──────────────────────────────────────────────────────────────────────────

export async function setAffiliateStatus(
  id: string,
  newStatus: 'active' | 'paused' | 'banned',
  reason?: string,
): Promise<Result> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const update: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'banned') {
    update.banned_at  = new Date().toISOString()
    update.ban_reason = reason ?? null
  } else {
    update.banned_at  = null
    update.ban_reason = null
  }

  const { error } = await sb.from('affiliates').update(update).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/afiliados')
  revalidatePath(`/admin/afiliados/${id}`)
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────
// 6. Liberar comissão under_review manualmente
// ──────────────────────────────────────────────────────────────────────────

export async function approveCommission(commissionId: string): Promise<Result> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { data: c } = await sb
    .from('affiliate_commissions')
    .select('hold_until, status')
    .eq('id', commissionId)
    .maybeSingle()
  if (!c) return { ok: false, error: 'Comissão não encontrada' }
  if (c.status === 'paid' || c.status === 'cancelled') return { ok: false, error: `Status atual: ${c.status}` }

  // Se hold ainda não venceu, vai pra pending_approval (cron solta depois);
  // se já venceu, vira payable direto
  const holdVencido = new Date(c.hold_until).getTime() <= Date.now()
  const newStatus   = holdVencido ? 'payable' : 'pending_approval'

  const { error } = await sb.from('affiliate_commissions')
    .update({ status: newStatus })
    .eq('id', commissionId)
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Bulk pay — gera lista pra pagar e marca como paid
// ──────────────────────────────────────────────────────────────────────────

export type PayableSummary = {
  affiliateId:   string
  fullName:      string
  email:         string
  pixKey:        string | null
  pixKeyType:    string | null
  totalCents:    number
  commissionIds: string[]
  belowMinimum:  boolean
}

export async function getPayableSummary(): Promise<PayableSummary[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { data: rows } = await sb
    .from('affiliate_commissions')
    .select('id, affiliate_id, amount_cents')
    .eq('status', 'payable')
    .limit(2000)

  if (!rows || rows.length === 0) return []

  const ids = Array.from(new Set(rows.map((r: { affiliate_id: string }) => r.affiliate_id)))
  const { data: affs } = await sb
    .from('affiliates')
    .select('id, full_name, email, pix_key, pix_key_type, min_payout_cents, status')
    .in('id', ids)

  const affMap: Record<string, { id: string; full_name: string; email: string; pix_key: string | null; pix_key_type: string | null; min_payout_cents: number; status: string }> = {}
  ;(affs ?? []).forEach((a: { id: string; full_name: string; email: string; pix_key: string | null; pix_key_type: string | null; min_payout_cents: number; status: string }) => { affMap[a.id] = a })

  const grouped: Record<string, PayableSummary> = {}
  rows.forEach((r: { id: string; affiliate_id: string; amount_cents: number }) => {
    const aff = affMap[r.affiliate_id]
    if (!aff || aff.status === 'banned') return
    if (!grouped[r.affiliate_id]) {
      grouped[r.affiliate_id] = {
        affiliateId:   r.affiliate_id,
        fullName:      aff.full_name,
        email:         aff.email,
        pixKey:        aff.pix_key,
        pixKeyType:    aff.pix_key_type,
        totalCents:    0,
        commissionIds: [],
        belowMinimum:  false,
      }
    }
    grouped[r.affiliate_id].totalCents     += r.amount_cents
    grouped[r.affiliate_id].commissionIds.push(r.id)
  })

  // Marca quem tá abaixo do mínimo (não bloqueia, só sinaliza)
  Object.values(grouped).forEach(g => {
    const aff = affMap[g.affiliateId]
    g.belowMinimum = g.totalCents < (aff?.min_payout_cents ?? 0)
  })

  return Object.values(grouped).sort((a, b) => b.totalCents - a.totalCents)
}

export async function markCommissionsPaid(commissionIds: string[], proof?: string): Promise<Result<{ count: number }>> {
  const auth = await requireAdmin()
  if ('error' in auth) return { ok: false, error: auth.error }
  if (commissionIds.length === 0) return { ok: false, error: 'Nada selecionado' }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { error, count } = await sb
    .from('affiliate_commissions')
    .update({
      status:    'paid',
      paid_at:   new Date().toISOString(),
      paid_proof: proof ?? null,
    }, { count: 'exact' })
    .eq('status', 'payable')
    .in('id', commissionIds)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/afiliados/pagamentos')
  return { ok: true, data: { count: count ?? 0 } }
}
