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
  getSubscriptionFirstPayment, getPaymentPixQrCode,
  isAsaasCustomerValid,
  asaasToday,
  type AsaasBillingType, type AsaasCreditCard, type AsaasCreditCardHolderInfo,
  type AsaasPixQrCode,
} from '@/lib/asaas'
import { getPrice, centsToReais, type Product, type Plan } from '@/lib/pricing'
import { createNotification } from '@/lib/notifications'

export type SubscribeInput = {
  product:       Product
  plan:          Plan
  paymentMethod: 'PIX' | 'CREDIT_CARD'
  // Dados de contato — obrigatórios pra Asaas em PIX e Cartão
  fullName?:     string             // nome completo (titular)
  cpfCnpj?:      string             // só números
  phone?:        string             // celular (DDD + número)
  // Dados de cartão — obrigatórios quando paymentMethod=CREDIT_CARD
  creditCard?: {
    holderName:  string
    number:      string             // só números
    expiryMonth: string             // "01"-"12"
    expiryYear:  string             // "2030"
    ccv:         string
  }
  // Endereço de cobrança (Asaas exige pra cartão — anti-fraude)
  postalCode?:    string             // só números (8 dígitos)
  addressNumber?: string
}

/** Resposta unificada — pode trazer dados pra UI exibir QR PIX inline,
 *  ou só sinalizar sucesso (cartão é cobrado imediatamente). */
export type SubscribeResult =
  | { ok: true;  asaasSubscriptionId: string; mode: 'pix';  pixQrCode: AsaasPixQrCode | null; paymentValue: number }
  | { ok: true;  asaasSubscriptionId: string; mode: 'card'; chargedNow: boolean }
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

  // Valida cache: se asaas_customer_id existe mas customer foi removido
  // do Asaas (admin deletou no painel), invalida pra criar um novo
  if (asaasCustomerId) {
    const valid = await isAsaasCustomerValid(asaasCustomerId)
    if (!valid) {
      console.warn('[subscribeToProduct] customer cache inválido, recriando:', asaasCustomerId)
      asaasCustomerId = null
      // Limpa também no banco pra não tentar reusar de novo
      await sb.from('tenants')
        .update({ asaas_customer_id: null })
        .eq('id', tenantId)
    }
  }

  // Validação dos campos de contato — exigidos pra qualquer método de pagamento
  const fullName = (input.fullName ?? '').trim()
  const phone    = input.phone ? digitsOnly(input.phone) : ''
  if (fullName.length < 3) {
    return { ok: false, error: 'Informe seu nome completo.' }
  }
  if (phone.length < 10 || phone.length > 11) {
    return { ok: false, error: 'Informe um celular válido com DDD (10 ou 11 dígitos).' }
  }

  if (!asaasCustomerId) {
    const cleanCpfCnpj = input.cpfCnpj ? digitsOnly(input.cpfCnpj) : (cpfCnpj ?? '')
    if (!cleanCpfCnpj || !isValidCpfCnpj(cleanCpfCnpj)) {
      return { ok: false, error: 'CPF (11 dígitos) ou CNPJ (14 dígitos) é obrigatório.' }
    }

    try {
      // Tenta achar customer existente pelo CPF/CNPJ (Asaas não permite
      // 2 customers com mesmo CPF/CNPJ — se existe, reusa).
      // findAsaasCustomerByCpfCnpj retorna até deletados, então também valida.
      let customer = await findAsaasCustomerByCpfCnpj(cleanCpfCnpj)
      if (customer) {
        const stillValid = await isAsaasCustomerValid(customer.id)
        if (!stillValid) customer = null
      }

      const finalCustomer = customer ?? await createAsaasCustomer({
        name:        fullName,
        email:       user.email ?? '',
        cpfCnpj:     cleanCpfCnpj,
        mobilePhone: phone,
        externalReference: tenant.id,
      })

      asaasCustomerId = finalCustomer.id
      cpfCnpj         = cleanCpfCnpj

      // Salva no tenant pra reusar
      await sb.from('tenants')
        .update({ asaas_customer_id: asaasCustomerId, cpf_cnpj: cleanCpfCnpj })
        .eq('id', tenantId)
    } catch (e) {
      console.error('[subscribeToProduct] criar customer Asaas falhou:', e)
      const msg = e instanceof Error ? e.message : 'Não foi possível registrar dados de cobrança.'
      return { ok: false, error: msg }
    }
  }

  // ── 3. Verifica se já existe sub ativa (idempotência) ───────────────────
  const { data: existingSub } = await sb
    .from('subscriptions')
    .select('id, asaas_subscription_id, status')
    .eq('tenant_id', tenantId)
    .eq('product', input.product)
    .maybeSingle()

  if (existingSub?.asaas_subscription_id && existingSub.status === 'active') {
    return { ok: false, error: `Você já tem assinatura ativa de ${input.product}.` }
  }

  // ── 4. Cria subscription no Asaas ───────────────────────────────────────
  const billingType: AsaasBillingType = input.paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX'
  // 1ª cobrança imediata. Cartão é cobrado na hora; PIX gera QR pra cliente
  // pagar manualmente (status fica inactive até webhook PAYMENT_RECEIVED).
  const dueDate = asaasToday()

  // Pra cartão, valida e prepara dados sensíveis
  let creditCard:           AsaasCreditCard | undefined
  let creditCardHolderInfo: AsaasCreditCardHolderInfo | undefined
  if (input.paymentMethod === 'CREDIT_CARD') {
    if (!input.creditCard) {
      return { ok: false, error: 'Dados do cartão são obrigatórios.' }
    }
    if (!input.postalCode || !input.addressNumber) {
      return { ok: false, error: 'CEP e número do endereço são obrigatórios pra pagamento com cartão.' }
    }

    const cardNum = digitsOnly(input.creditCard.number)
    if (cardNum.length < 13 || cardNum.length > 19) {
      return { ok: false, error: 'Número do cartão inválido.' }
    }

    creditCard = {
      holderName:  input.creditCard.holderName.trim(),
      number:      cardNum,
      expiryMonth: input.creditCard.expiryMonth.padStart(2, '0'),
      expiryYear:  input.creditCard.expiryYear,
      ccv:         input.creditCard.ccv,
    }
    creditCardHolderInfo = {
      name:          fullName,
      email:         user.email ?? '',
      cpfCnpj:       cpfCnpj!,
      postalCode:    digitsOnly(input.postalCode),
      addressNumber: input.addressNumber,
      mobilePhone:   phone,
    }
  }

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
      creditCard,
      creditCardHolderInfo,
    })
  } catch (e) {
    console.error('[subscribeToProduct] criar subscription Asaas falhou:', e)
    const msg = e instanceof Error ? e.message : 'Erro ao criar assinatura no gateway.'
    // Erros comuns: cartão recusado, CVV errado, limite, etc.
    return { ok: false, error: msg.includes('Asaas') ? msg : 'Erro ao processar pagamento. Verifique os dados.' }
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
    return { ok: false, error: 'Assinatura criada no gateway mas erro ao registrar. Contate suporte.' }
  }

  void createNotification({
    userId:   user.id,
    tenantId: tenantId,
    type:     'subscription_active',
    title:    `Assinatura ${price.description} criada`,
    body:     billingType === 'PIX'
                ? 'Pague o PIX pra ativar — o QR code está aberto na tela.'
                : 'Pagamento via cartão processado.',
    link:     '/configuracoes/assinatura',
  })

  revalidatePath('/configuracoes/assinatura')

  // ── 6. Resposta diferenciada por método ────────────────────────────────
  if (billingType === 'CREDIT_CARD') {
    // Cartão: Asaas já cobrou. Webhook vai chegar e setar status='active'.
    return {
      ok:                  true,
      asaasSubscriptionId: asaasSub.id,
      mode:                'card',
      chargedNow:          true,
    }
  }

  // PIX: busca QR code da 1ª cobrança pra exibir inline no modal
  const firstPayment = await getSubscriptionFirstPayment(asaasSub.id)
  const pixQrCode = firstPayment ? await getPaymentPixQrCode(firstPayment.id) : null

  return {
    ok:                  true,
    asaasSubscriptionId: asaasSub.id,
    mode:                'pix',
    pixQrCode,
    paymentValue:        centsToReais(price.priceCents),
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
