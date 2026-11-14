import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Lista TODOS os usuários do Supabase Auth que pertencem ao tenant.
 *
 * O Auth é compartilhado por todas as lojas do SaaS, então uma única página
 * de `listUsers` (100 usuários) não basta: membros fora dessa página sumiam
 * da Equipe e apareciam como "—" nos relatórios. Aqui paginamos até o fim.
 */
export async function listTenantUsers(admin: SupabaseClient, tenantId: string): Promise<User[]> {
  const perPage = 1000
  const out: User[] = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)
    const users = data?.users ?? []
    for (const u of users) {
      if (u.app_metadata?.tenant_id === tenantId) out.push(u)
    }
    if (users.length < perPage) break
  }
  return out
}

/** Nome amigável de um usuário: nome completo > parte do email antes do @. */
export function displayName(u: Pick<User, 'email' | 'user_metadata'>): string {
  const full = (u.user_metadata?.full_name ?? u.user_metadata?.name) as string | undefined
  if (full && full.trim()) return full.trim()
  return u.email?.split('@')[0] ?? 'Sem nome'
}
