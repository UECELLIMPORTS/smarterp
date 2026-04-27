/**
 * Sistema de permissões por módulo pra funcionários (role='employee').
 * Server-only — usa next/headers, supabase admin, etc.
 *
 * Owner e Manager (legado) têm acesso total — não passam por esse check.
 * Employee precisa ter o module_key registrado em tenant_member_permissions
 * pra acessar o módulo correspondente.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantId } from '@/lib/tenant'
import { requireAuth } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { MODULES, isValidModuleKey, hasFullAccess, type ModuleKey } from './permissions-shared'

// Re-exporta tudo que é client-safe pra quem importa @/lib/permissions diretamente
export {
  MODULES,
  isValidModuleKey,
  hasFullAccess,
  canAccessModuleSync,
} from './permissions-shared'
export type { ModuleKey, ModuleInfo } from './permissions-shared'

/** Lê todas as permissions ativas do user logado. */
export async function getUserPermissions(user: User): Promise<ModuleKey[]> {
  if (hasFullAccess(user)) return MODULES.map(m => m.key)

  const tenantId = getTenantId(user)
  if (!tenantId) return []

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  const { data, error } = await sb
    .from('tenant_member_permissions')
    .select('module_key')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[getUserPermissions] erro:', error.message)
    return []
  }

  type Row = { module_key: string }
  return ((data ?? []) as Row[])
    .map(r => r.module_key)
    .filter(isValidModuleKey)
}

/** True se user pode acessar o módulo. Owner/manager sempre true. */
export async function canAccessModule(user: User, key: ModuleKey): Promise<boolean> {
  if (hasFullAccess(user)) return true
  const perms = await getUserPermissions(user)
  return perms.includes(key)
}

/**
 * Server gate: garante user autenticado E com acesso ao módulo. Redireciona pra
 * /login se não autenticado, ou pra / se autenticado mas sem permissão.
 * Usar no topo de layout.tsx de cada módulo.
 */
export async function requireModuleAccess(key: ModuleKey): Promise<User> {
  let user: User
  try {
    const auth = await requireAuth()
    user = auth.user
  } catch {
    redirect('/login')
  }

  if (hasFullAccess(user)) return user

  const perms = await getUserPermissions(user)
  if (!perms.includes(key)) redirect('/')
  return user
}
