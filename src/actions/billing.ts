'use server'

/**
 * Server Actions de billing — integra Asaas com nossa tabela `subscriptions`.
 *
 * Funções principais:
 * - subscribeToProduct: cliente clica "Assinar" → chama Asaas → salva ids
 * - cancelSubscription: chama Asaas pra cancelar → atualiza status local
 * - getActivePaymentLink: pega link de pagamento da próxima cobrança
 *   (pra mostrar QR code PIX ou link de cartão)
 *
 * Decisão de UX: pedimos CPF/CNPJ no momento de assinar, não no signup.
 * Cadastro inicial é leve; só pede dados de cobrança quando vai pagar.
 */

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantId } from '@/lib/tenant'
import {
  createAsaasCustomer, findAsaasCustomerByCpfCnpj,
  createAsaasSubscription, cancelAsaasSubscription,
  getSubscriptionFirstPaymentUrl,
  asaasToday,
  type AsaasBillingType,
} from '@/lib/asaas'
import { getPrice, centsToReais, type Product, type Plan } from '@/lib/pricing'
import { createNotification } from '@/lib/notifications'

export type SubscribeInput = {
  product:       Product
  plan:          Plan
  paymentMethod: 'PIX' | 'CREDIT_CARD'
  // Dados pra criar customer no Asaas (1ª vez assinando) — opcionais se
  // tenant já tem asaas_customer_id setado.
  cpfCnpj?:      string             // só números
  phone?:        string             // celular
}

export type SubscribeResult =
  | { ok: true;  asaasSubscriptionId: string; nextDueDate: string; paymentLinkHint: string }
  | { ok: false; error: string }

/** Limpa CPF/CNPJ pra só números. */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos). Não valida dígito verificador
 *  porque o Asaas faz isso. Só verifica formato básico. */
function isValidCpfCnpj(s: string): boolean {
  return /^\d{11}$/.test(s) || /^\d{14}$/.test(s)
}

/**
 * Cria/atualiza assinatura paga no Asaas + salva referências locais.
 *
 * Fluxo:
 * 1. Valida input + permissão (só owner)
 * 2. Se tenant não tem asaas_customer_id, cria customer no Asaas
 * 3. Cria subscription no Asaas (PIX ou CREDIT_CARD)
 * 4. Salva ids + status='trialing' até webhook PAYMENT_RECEIVED chegar
 *    (porque PIX pode demorar pra pagar; cartão chega rápido)
 *
 * Idempotência: se já tem asaas_subscription_id ativa pro mesmo
 * (tenant_id, product), retorna a existente em vez de duplicar.
 */
export async function subscribeToProduct(input: SubscribeInput): Promise<SubscribeResult> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (user.app_metadata?.tenant_role !== 'owner') {
    return { ok: false, error: 'Apenas o dono pode contratar assinaturas.' }
  }

  const price = getPrice(input.product, input.plan)
  if (!price) return { ok: false, error: 'Plano inválido pra esse produto.' }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  // ── 1. Carrega tenant pra ver se já tem asaas_customer_id ───────────────
  const { data: tenant, error: tenantErr } = await sb
    .from('tenants')
    .select('id, name, cpf_cnpj, asaas_customer_id')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantErr || !tenant) {
    console.error('[subscribeToProduct] tenant não encontrado:', tenantErr)
    return { ok: false, error: 'Empresa não encontrada.' }
  }

  // ── 2. Garante customer no Asaas ────────────────────────────────────────
  let asaasCustomerId = tenant.asaas_customer_id as string | null
  let cpfCnpj         = tenant.cpf_cnpj as string | null

  if (!asaasCustomerId) {
    const cleanCpfCnpj = input.cpfCnpj ? digitsOnly(input.cpfCnpj) : ''
    if (!cleanCpfCnpj || !isValidCpfCnpj(cleanCpfCnpj)) {
      return { ok: false, error: 'CPF (11 dígitos) ou CNPJ (14 dígitos) é obrigatório.' }
    }

    try {
      // Tenta achar customer existente pelo CPF/CNPJ (caso usuário já tenha
      // sido cadastrado em fluxo anterior que abortou)
      const existing = await findAsaasCustomerByCpfCnpj(cleanCpfCnpj)
      const customer = existing ?? await createAsaasCustomer({
        name:      tenant.name,
        email:     user.email ?? '',
        cpfCnpj:   cleanCpfCnpj,
        mobilePhone: input.phone ? digitsOnly(input.phone) : undefined,
        externalReference: tenant.id,
      })

      asaasCustomerId = customer.id
      cpfCnpj         = cleanCpfCnpj

      // Salva no tenant pra reusar
      await sb.from('tenants')
        .update({ asaas_customer_id: asaasCustomerId, cpf_cnpj: cleanCpfCnpj })
        .eq('id', tenantId)
    } catch (e) {
      console.error('[subscribeToProduct] criar customer Asaas falhou:', e)
      return { ok: false, error: 'Não foi possível registrar dados de cobrança. Verifique CPF/CNPJ.' }
    }
  }

  // ── 3. Verifica se já existe sub ativa (idempotência) ───────────────────
  const { data: existingSub } = await sb
    .from('subscriptions')
    .select('id, asaas_subscription_id, status')
    .eq('tenant_id', tenantId)
    .eq('product', input.product)
    .maybeSingle()

  if (existingSub?.asaas_subscription_id && existingSub.status !== 'cancelled') {
    const url = await getSubscriptionFirstPaymentUrl(existingSub.asaas_subscription_id)
    return {
      ok: true,
      asaasSubscriptionId: existingSub.asaas_subscription_id,
      nextDueDate:         '',
      paymentLinkHint:     url ?? '',
    }
  }

  // ── 4. Cria subscription no Asaas ───────────────────────────────────────
  const billingType: AsaasBillingType = input.paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX'
  // 1ª cobrança imediata pra usuário pagar logo (especialmente PIX que precisa
  // ver o QR code agora). Próximas seguem o ciclo mensal automaticamente.
  const dueDate = asaasToday()

  let asaasSub
  try {
    asaasSub = await createAsaasSubscription({
      customer:    asaasCustomerId,
      billingType,
      value:       centsToReais(price.priceCents),
      nextDueDate: dueDate,
      cycle:       'MONTHLY',
      description: price.description,
      externalReference: `${tenantId}::${input.product}`,
    })
  } catch (e) {
    console.error('[subscribeToProduct] criar subscription Asaas falhou:', e)
    return { ok: false, error: 'Erro ao criar assinatura no gateway. Tente novamente.' }
  }

  // ── 5. Upsert local em subscriptions ────────────────────────────────────
  // status='inactive' até webhook PAYMENT_RECEIVED chegar e setar 'active'.
  // CHECK constraint do banco só aceita: trial|active|late|inactive|cancelled.
  const subRow = {
    tenant_id:             tenantId,
    product:               input.product,
    plan_name:             input.plan,
    price_cents:           price.priceCents,
    status:                'inactive',
    asaas_subscription_id: asaasSub.id,
    payment_method:        billingType,
    next_due_date:         dueDate,
    billing_cycle:         'MONTHLY',
    trial_ends_at:         null,                  // saiu do trial ao assinar
  }

  const { error: upsertErr } = await sb
    .from('subscriptions')
    .upsert(subRow, { onConflict: 'tenant_id,product' })

  if (upsertErr) {
    // Asaas já criou — não dá rollback fácil. Loga e segue (admin reconcilia).
    console.error('[subscribeToProduct] upsert local falhou:', upsertErr)
    // TEMP: expor erro real pro debug. Tirar depois.
    return { ok: false, error: `DB: ${upsertErr.message ?? upsertErr.code ?? JSON.stringify(upsertErr)}` }
  }

  void createNotification({
    userId:   user.id,
    tenantId: tenantId,
    type:     'subscription_active',
    title:    `Assinatura ${price.description} criada`,
    body:     billingType === 'PIX'
                ? 'Acesse a página de assinatura pra pagar via PIX e ativar.'
                : 'Pagamento via cartão será processado em instantes.',
    link:     '/configuracoes/assinatura',
  })

  // Pega URL da 1ª cobrança (Asaas-hosted page com QR PIX ou form cartão)
  const paymentUrl = await getSubscriptionFirstPaymentUrl(asaasSub.id) ?? ''

  revalidatePath('/configuracoes/assinatura')
  return {
    ok: true,
    asaasSubscriptionId: asaasSub.id,
    nextDueDate:         dueDate,
    paymentLinkHint:     paymentUrl,
  }
}

/**
 * Cancela uma assinatura ativa. Asaas para de gerar cobranças, status local
 * vira 'cancelled'. Cliente perde acesso quando o ciclo atual expirar
 * (`next_due_date`).
 */
export async function cancelSubscriptionAsaas(product: Product): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireAuth()
  const tenantId = getTenantId(user)
  if (user.app_metadata?.tenant_role !== 'owner') {
    return { ok: false, error: 'Apenas o dono pode cancelar assinaturas.' }
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const { data: sub } = await sb
    .from('subscriptions')
    .select('id, asaas_subscription_id')
    .eq('tenant_id', tenantId)
    .eq('product', product)
    .maybeSingle()

  if (!sub) return { ok: false, error: 'Assinatura não encontrada.' }

  if (sub.asaas_subscription_id) {
    try {
      await cancelAsaasSubscription(sub.asaas_subscription_id)
    } catch (e) {
      console.error('[cancelSubscriptionAsaas] erro Asaas:', e)
      // segue assim mesmo: marca local como cancelada
    }
  }

  const { error: updErr } = await sb
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('id', sub.id)

  if (updErr) {
    console.error('[cancelSubscriptionAsaas] update local falhou:', updErr)
    return { ok: false, error: 'Erro ao registrar cancelamento.' }
  }

  revalidatePath('/configuracoes/assinatura')
  return { ok: true }
}
