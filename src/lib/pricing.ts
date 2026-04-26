/**
 * Tabela central de preços dos 4 produtos da Gestão Inteligente.
 *
 * Fonte da verdade pra tudo que precisa saber o valor: páginas de
 * assinatura, server actions de subscribe, webhook que valida valor pago.
 *
 * IMPORTANTE: alterar aqui não muda assinaturas já criadas no Asaas.
 * Pra reajustar valor de cliente existente, precisa chamar API do Asaas
 * em update da subscription.
 */

export type Product = 'gestao_smart' | 'checksmart' | 'crm' | 'meta_ads'
export type Plan    = 'basico' | 'pro' | 'premium'

export type PriceEntry = {
  product:     Product
  plan:        Plan
  priceCents:  number       // mensal
  description: string       // pra mostrar no Asaas
}

/** Preços vigentes em R$/mês (cents). */
export const PRICES: PriceEntry[] = [
  // Gestão Smart
  { product: 'gestao_smart', plan: 'basico',  priceCents:  9700, description: 'Gestão Smart Básico — ERP completo' },
  { product: 'gestao_smart', plan: 'pro',     priceCents: 14700, description: 'Gestão Smart Pro — ERP + Analytics avançado' },
  { product: 'gestao_smart', plan: 'premium', priceCents: 19700, description: 'Gestão Smart Premium — Tudo: ERP + CheckSmart + CRM + Meta Ads' },

  // CheckSmart
  { product: 'checksmart',   plan: 'basico',  priceCents:  5700, description: 'CheckSmart Básico — OS + Estoque assistência' },
  { product: 'checksmart',   plan: 'pro',     priceCents:  9700, description: 'CheckSmart Pro — OS + multi-aparelho + relatórios' },
  { product: 'checksmart',   plan: 'premium', priceCents: 12700, description: 'CheckSmart Premium — Tudo + integrações' },

  // CRM
  { product: 'crm',          plan: 'basico',  priceCents:  9700, description: 'CRM Básico — Pipeline + Inbox WhatsApp' },
  { product: 'crm',          plan: 'pro',     priceCents: 14700, description: 'CRM Pro — Pipeline + Inbox WA + IG + automações' },
  { product: 'crm',          plan: 'premium', priceCents: 19700, description: 'CRM Premium — Tudo + IA de mensagens' },

  // Meta Ads (só add-on — não tem plano básico/pro/premium próprio)
  // Convenção: armazenamos como plan='basico' com priceCents do add-on.
  // Premium do Gestão Smart libera grátis (priceCents=0 nesse caso, regra
  // aplicada na server action, não aqui).
  { product: 'meta_ads',     plan: 'basico',  priceCents:  4700, description: 'Meta Ads — ROAS e CAC integrados' },
]

/** Busca preço de (produto, plano). Retorna null se não existir. */
export function getPrice(product: Product, plan: Plan): PriceEntry | null {
  return PRICES.find(p => p.product === product && p.plan === plan) ?? null
}

/** Lista planos disponíveis pra um produto. */
export function plansForProduct(product: Product): PriceEntry[] {
  return PRICES.filter(p => p.product === product)
}

/** Formata cents → "R$ 97,00" (pra UI). */
export function fmtBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

/** Cents → reais (number) pra mandar pro Asaas (que espera valor em reais). */
export function centsToReais(cents: number): number {
  return cents / 100
}
