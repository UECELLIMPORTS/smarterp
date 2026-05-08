/**
 * Atribuição de afiliado no signup.
 *
 * Chamado por signupTenant após o tenant ser criado. Olha o cookie
 * `smartgestao_ref` (ou param explícito), valida o afiliado, roda os
 * trincos anti-fraude e cria a row em affiliate_referrals.
 *
 * Trincos:
 *  1. Auto-referral — email/whatsapp/cpf do tenant igual ao do afiliado
 *  2. Same IP — IP do signup igual a outro signup deste afiliado nas últimas 24h
 *  3. Limite anti-spam — 5+ conversões nos primeiros 7 dias do afiliado
 *
 * Falhas críticas (auto-referral) → status=rejected, NÃO conta.
 * Falhas leves (limite/ip) → status=under_review, admin libera manual.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export type AttributeAffiliateInput = {
  refCode:        string                          // do cookie
  tenantId:       string
  signupEmail:    string                          // do user que se cadastrou
  signupWhatsapp?: string | null                  // se coletar no signup
  signupCpf?:     string | null                   // idem
  fingerprintIp?: string | null
  fingerprintUa?: string | null
}

export type AttributeAffiliateResult =
  | { ok: true;  referralId: string; status: 'attributed' | 'under_review' }
  | { ok: false; reason: string }

const SPAM_LIMIT_FIRST_DAYS = 7
const SPAM_LIMIT_COUNT      = 5

export async function attributeAffiliate(
  sb: Sb,
  input: AttributeAffiliateInput,
): Promise<AttributeAffiliateResult> {
  const code = input.refCode.toUpperCase().trim()
  if (!code) return { ok: false, reason: 'ref_code vazio' }

  // 1. Busca affiliate ativo
  const { data: affiliate } = await sb
    .from('affiliates')
    .select('id, email, whatsapp, cpf_cnpj, status, email_confirmed_at, created_at')
    .eq('ref_code', code)
    .maybeSingle()

  if (!affiliate)                                return { ok: false, reason: 'ref_code não encontrado' }
  if (affiliate.status === 'banned')             return { ok: false, reason: 'afiliado banido' }
  if (affiliate.status === 'paused')             return { ok: false, reason: 'afiliado pausado' }
  if (affiliate.status === 'pending_email')      return { ok: false, reason: 'email do afiliado não confirmado' }

  // 2. Trincos anti-fraude — coleta flags
  const fraudFlags: string[] = []

  // 2a. Auto-referral por email
  if (affiliate.email && input.signupEmail.toLowerCase() === affiliate.email.toLowerCase()) {
    fraudFlags.push('same_email')
  }
  // 2b. Auto-referral por WhatsApp
  if (affiliate.whatsapp && input.signupWhatsapp) {
    const aff = String(affiliate.whatsapp).replace(/\D/g, '')
    const sig = String(input.signupWhatsapp).replace(/\D/g, '')
    if (aff && sig && aff === sig) fraudFlags.push('same_whatsapp')
  }
  // 2c. Auto-referral por CPF
  if (affiliate.cpf_cnpj && input.signupCpf) {
    const aff = String(affiliate.cpf_cnpj).replace(/\D/g, '')
    const sig = String(input.signupCpf).replace(/\D/g, '')
    if (aff && sig && aff === sig) fraudFlags.push('same_cpf')
  }

  // Falha CRÍTICA: auto-referral confirmado → rejeita
  if (fraudFlags.length > 0) {
    await sb.from('affiliate_referrals').insert({
      affiliate_id:    affiliate.id,
      tenant_id:       input.tenantId,
      attribution:     'link',
      fingerprint_ip:  input.fingerprintIp ?? null,
      fingerprint_ua:  input.fingerprintUa ?? null,
      fraud_flags:     fraudFlags,
      status:          'rejected',
    })
    return { ok: false, reason: `auto-referral detectado (${fraudFlags.join(',')})` }
  }

  // 2d. Same IP nas últimas 24h pra esse afiliado
  if (input.fingerprintIp) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { count: ipCount } = await sb
      .from('affiliate_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliate.id)
      .eq('fingerprint_ip', input.fingerprintIp)
      .gte('created_at', since)
    if ((ipCount ?? 0) > 0) fraudFlags.push('same_ip_24h')
  }

  // 2e. Limite anti-spam: novato com 5+ conversões em 7d → under_review
  const ageMs = Date.now() - new Date(affiliate.created_at).getTime()
  const isNewbie = ageMs < SPAM_LIMIT_FIRST_DAYS * 24 * 3600 * 1000
  if (isNewbie) {
    const { count: convCount } = await sb
      .from('affiliate_referrals')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_id', affiliate.id)
      .in('status', ['attributed', 'under_review'])
    if ((convCount ?? 0) >= SPAM_LIMIT_COUNT) fraudFlags.push('spam_limit')
  }

  // 3. Persiste a atribuição
  const status: 'attributed' | 'under_review' = fraudFlags.length > 0 ? 'under_review' : 'attributed'

  const { data: referral, error } = await sb
    .from('affiliate_referrals')
    .insert({
      affiliate_id:    affiliate.id,
      tenant_id:       input.tenantId,
      attribution:     'link',
      fingerprint_ip:  input.fingerprintIp ?? null,
      fingerprint_ua:  input.fingerprintUa ?? null,
      fraud_flags:     fraudFlags,
      status,
    })
    .select('id')
    .single()

  if (error || !referral) {
    return { ok: false, reason: error?.message ?? 'falha ao gravar referral' }
  }

  // 4. Marca tenant pra recuperação rápida no webhook
  await sb.from('tenants')
    .update({
      affiliate_ref_code:       code,
      affiliate_attributed_at:  new Date().toISOString(),
    })
    .eq('id', input.tenantId)

  return { ok: true, referralId: referral.id as string, status }
}

/**
 * Calcula comissão a partir de um pagamento Asaas confirmado.
 * Chamado pelo webhook de PAYMENT_RECEIVED/PAYMENT_CONFIRMED.
 *
 * Regras:
 *  - 1ª venda do tenant → comissão type='initial' com pct=affiliate.commission_pct (40)
 *  - Vendas seguintes (até recurring_months) → type='recurring' com pct=affiliate.recurring_pct (10)
 *  - Mês 13+ não gera comissão.
 *  - Hold de 30 dias: status='pending_approval', vira 'payable' via cron diário.
 *  - Idempotência: UNIQUE (payment_id, type) na tabela impede duplicação.
 */
export async function createCommissionFromPayment(
  sb: Sb,
  args: {
    tenantId:        string
    paymentId:       string
    amountCents:     number
    subscriptionId?: string | null
  },
): Promise<{ ok: true; commissionId?: string; skipped?: string } | { ok: false; reason: string }> {
  // 1. Tenant tem afiliado?
  const { data: tenant } = await sb
    .from('tenants')
    .select('id, affiliate_ref_code, affiliate_attributed_at')
    .eq('id', args.tenantId)
    .maybeSingle()

  if (!tenant?.affiliate_ref_code) return { ok: true, skipped: 'sem afiliado atribuído' }

  // 2. Busca afiliado + referral válido (não rejeitado)
  const { data: affiliate } = await sb
    .from('affiliates')
    .select('id, status, commission_pct, recurring_pct, recurring_months')
    .eq('ref_code', tenant.affiliate_ref_code)
    .maybeSingle()

  if (!affiliate)                       return { ok: true, skipped: 'afiliado não encontrado' }
  if (affiliate.status === 'banned')    return { ok: true, skipped: 'afiliado banido' }

  const { data: referral } = await sb
    .from('affiliate_referrals')
    .select('id, status, signup_at')
    .eq('tenant_id', args.tenantId)
    .eq('affiliate_id', affiliate.id)
    .maybeSingle()

  if (!referral)                                 return { ok: true, skipped: 'referral não existe' }
  if (referral.status === 'rejected')            return { ok: true, skipped: 'referral rejeitado (fraude)' }

  // 3. Já existe comissão initial? Decide se é initial ou recurring
  const { data: existingInitial } = await sb
    .from('affiliate_commissions')
    .select('id')
    .eq('referral_id', referral.id)
    .eq('type', 'initial')
    .maybeSingle()

  const isInitial = !existingInitial
  const pct       = isInitial ? Number(affiliate.commission_pct) : Number(affiliate.recurring_pct)

  // 4. Recurring só vale até recurring_months (default 12)
  if (!isInitial) {
    const monthsSinceSignup = Math.floor(
      (Date.now() - new Date(referral.signup_at).getTime()) / (30 * 24 * 3600 * 1000)
    )
    if (monthsSinceSignup >= Number(affiliate.recurring_months)) {
      return { ok: true, skipped: `recurring window expirou (${monthsSinceSignup}m)` }
    }
  }

  // 5. Calcula valor + status (under_review se referral está under_review)
  const commissionCents = Math.round(args.amountCents * (pct / 100))
  const initialStatus   = referral.status === 'under_review' ? 'under_review' : 'pending_approval'
  const holdUntil       = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  const refMonth        = new Date().toISOString().slice(0, 7) + '-01'

  const { data: ins, error } = await sb
    .from('affiliate_commissions')
    .insert({
      affiliate_id:      affiliate.id,
      referral_id:       referral.id,
      payment_id:        args.paymentId,
      subscription_id:   args.subscriptionId ?? null,
      amount_cents:      commissionCents,
      base_amount_cents: args.amountCents,
      pct,
      type:              isInitial ? 'initial' : 'recurring',
      ref_month:         refMonth,
      status:            initialStatus,
      hold_until:        holdUntil,
    })
    .select('id')
    .single()

  if (error) {
    // UNIQUE (payment_id, type) violado = duplicado, ignora silenciosamente
    if (error.code === '23505') return { ok: true, skipped: 'comissão já existia (idempotência)' }
    return { ok: false, reason: error.message }
  }

  return { ok: true, commissionId: ins.id as string }
}
