/**
 * Cliente HTTP do Asaas — gateway de pagamento brasileiro.
 *
 * Sandbox: https://api-sandbox.asaas.com
 * Produção: https://api.asaas.com
 *
 * Auth: header `access_token` com a API key (não é Bearer).
 *
 * Modelo: Customer (1 por tenant, identificado por CPF/CNPJ) → Subscription
 * (1 por produto contratado, ex: gestao_smart, checksmart) → Payments
 * (geradas automaticamente a cada ciclo).
 *
 * Fluxo padrão pro nosso SaaS:
 * 1. Tenant decide assinar produto X → backend chama createCustomer (se 1ª vez)
 * 2. Backend chama createSubscription com billingType='PIX' (default) ou
 *    'CREDIT_CARD'
 * 3. Asaas devolve subscription_id e gera 1ª cobrança
 * 4. Cliente paga → Asaas dispara webhook PAYMENT_RECEIVED → backend
 *    atualiza `subscriptions.status` pra 'active'
 * 5. Próximos ciclos: Asaas gera cobrança automaticamente, webhook atualiza
 */

const API_URL = process.env.ASAAS_API_URL ?? 'https://api-sandbox.asaas.com'
const API_KEY = process.env.ASAAS_API_KEY

export type AsaasBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'
export type AsaasCycle = 'MONTHLY' | 'YEARLY'

export type AsaasCustomer = {
  id:          string
  name:        string
  email:       string
  cpfCnpj:     string
  phone?:      string
  mobilePhone?: string
  // outros campos que Asaas devolve mas a gente não usa direto
}

export type AsaasSubscription = {
  id:                string
  customer:          string         // customer id
  value:             number         // valor em reais (ex: 97.00)
  nextDueDate:       string         // YYYY-MM-DD
  cycle:             AsaasCycle
  billingType:       AsaasBillingType
  status:            'ACTIVE' | 'EXPIRED' | 'INACTIVE'
  description?:      string
  externalReference?: string        // a gente passa o subscription.id local aqui
  endDate?:          string | null
}

export type CreateCustomerInput = {
  name:        string
  email:       string
  cpfCnpj:     string             // só números (Asaas valida)
  phone?:      string
  mobilePhone?: string
  externalReference?: string       // a gente passa o tenant_id aqui
}

export type CreateSubscriptionInput = {
  customer:           string       // asaas customer id
  billingType:        AsaasBillingType
  value:              number       // em reais
  nextDueDate:        string       // YYYY-MM-DD
  cycle:              AsaasCycle
  description?:       string
  externalReference?: string       // tenant_id::product
  // Se billingType=CREDIT_CARD, pode passar dados do cartão aqui (modo
  // tokenizado). No nosso fluxo, vamos preferir gerar link de checkout
  // do Asaas pra evitar guardar dados sensíveis.
  creditCardToken?:   string
  // Caso queira que a 1ª cobrança seja imediata (não esperar nextDueDate)
  // basta nextDueDate = hoje.
}

class AsaasError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message)
    this.name = 'AsaasError'
  }
}

async function asaasFetch<T>(
  path:   string,
  init?:  RequestInit,
): Promise<T> {
  if (!API_KEY) throw new Error('ASAAS_API_KEY não configurada.')

  const url = `${API_URL}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'access_token': API_KEY,
      ...init?.headers,
    },
  })

  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* deixa como text */ }

  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'errors' in body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? JSON.stringify((body as any).errors)
      : `HTTP ${res.status}`
    throw new AsaasError(res.status, body, `Asaas API erro: ${msg}`)
  }

  return body as T
}

// ── Customers ──────────────────────────────────────────────────────────────

/** Cria customer no Asaas. CPF/CNPJ é obrigatório e validado pelo Asaas. */
export async function createAsaasCustomer(input: CreateCustomerInput): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>('/v3/customers', {
    method: 'POST',
    body:   JSON.stringify(input),
  })
}

/** Busca customer pelo CPF/CNPJ. Útil pra evitar duplicar. */
export async function findAsaasCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
  const res = await asaasFetch<{ data: AsaasCustomer[] }>(
    `/v3/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`,
  )
  return res.data[0] ?? null
}

export async function getAsaasCustomer(customerId: string): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>(`/v3/customers/${customerId}`)
}

// ── Subscriptions ──────────────────────────────────────────────────────────

export async function createAsaasSubscription(
  input: CreateSubscriptionInput,
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>('/v3/subscriptions', {
    method: 'POST',
    body:   JSON.stringify(input),
  })
}

export async function getAsaasSubscription(id: string): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/v3/subscriptions/${id}`)
}

/** Retorna o invoiceUrl da 1ª cobrança da subscription (pra mandar o cliente
 *  pagar PIX/cartão). Asaas gera a 1ª cobrança ao criar a subscription. */
export async function getSubscriptionFirstPaymentUrl(subId: string): Promise<string | null> {
  type Payment = { id: string; invoiceUrl: string; status: string; dueDate: string }
  const res = await asaasFetch<{ data: Payment[] }>(
    `/v3/subscriptions/${subId}/payments?limit=1&order=asc`,
  )
  return res.data[0]?.invoiceUrl ?? null
}

/** Cancela subscription. Asaas mantém histórico mas não gera mais cobranças. */
export async function cancelAsaasSubscription(id: string): Promise<{ deleted: boolean }> {
  return asaasFetch<{ deleted: boolean }>(`/v3/subscriptions/${id}`, {
    method: 'DELETE',
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Formata data pra YYYY-MM-DD (formato esperado pelo Asaas). */
export function asaasDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Hoje no formato Asaas. */
export function asaasToday(): string {
  return asaasDate(new Date())
}
