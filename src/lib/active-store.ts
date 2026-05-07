/**
 * Active store resolver — lê a loja ativa do cookie HTTP em server actions.
 * Cliente seta o cookie ao trocar de loja (via setActiveStoreCookie).
 * Server lê o cookie aqui pra saber qual loja é a ativa nesta requisição.
 *
 * Fallback: se cookie ausente, usa a loja default do tenant.
 */

import { cookies } from 'next/headers'

export const ACTIVE_STORE_COOKIE = 'smarterp_active_store_v1'

export async function getActiveStoreIdFromCookie(): Promise<string | null> {
  try {
    const c = await cookies()
    return c.get(ACTIVE_STORE_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

/**
 * Resolve store ativa: cookie > default do tenant > null.
 * Use em qualquer server action que precise saber a loja atual.
 */
export async function resolveActiveStoreId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  tenantId: string,
): Promise<string | null> {
  const fromCookie = await getActiveStoreIdFromCookie()
  if (fromCookie) {
    // Valida que pertence ao tenant (defesa contra cookie adulterado)
    const { data } = await sb
      .from('stores')
      .select('id')
      .eq('id', fromCookie)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  // Fallback: default
  const { data: def } = await sb
    .from('stores')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle()
  return (def?.id as string | null) ?? null
}
