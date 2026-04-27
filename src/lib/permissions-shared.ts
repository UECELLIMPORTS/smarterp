/**
 * Parte client-safe do sistema de permissões: types, MODULES list e helpers sync.
 * Não importa nada de server-only (next/headers, supabase admin, etc).
 *
 * Server-only helpers (getUserPermissions, canAccessModule, requireModuleAccess)
 * vivem em @/lib/permissions e re-exportam tudo daqui.
 */

export type ModuleKey =
  | 'pos'
  | 'estoque'
  | 'financeiro'
  | 'clientes'
  | 'erp_clientes'
  | 'analytics_canais'
  | 'relatorios'
  | 'meta_ads'
  | 'crm'

export type ModuleInfo = {
  key:         ModuleKey
  label:       string
  description: string
  icon:        string
  route:       string
}

/** Lista canônica dos módulos com gate de permissão. */
export const MODULES: ModuleInfo[] = [
  { key: 'pos',              label: 'Frente de Caixa',     description: 'Vender produtos no POS',                icon: 'ShoppingCart',  route: '/pos' },
  { key: 'estoque',          label: 'Estoque',             description: 'Gerenciar produtos e estoque',          icon: 'Package',       route: '/estoque' },
  { key: 'financeiro',       label: 'Financeiro',          description: 'Vendas + OS + cancelamentos',           icon: 'DollarSign',    route: '/financeiro' },
  { key: 'clientes',         label: 'Clientes',            description: 'Cadastro e busca de clientes',          icon: 'Users',         route: '/clientes' },
  { key: 'erp_clientes',     label: 'ERP Clientes',        description: 'Analytics de clientes (Pro+)',          icon: 'PieChart',      route: '/erp-clientes' },
  { key: 'analytics_canais', label: 'Canais',              description: 'Análise de canais e break-even (Pro+)', icon: 'BarChart3',     route: '/analytics/canais' },
  { key: 'relatorios',       label: 'Relatórios',          description: 'Relatórios avançados (Pro+)',           icon: 'FileText',      route: '/relatorios' },
  { key: 'meta_ads',         label: 'Meta Ads',            description: 'ROAS e CAC (Premium)',                  icon: 'TrendingUp',    route: '/meta-ads' },
  { key: 'crm',              label: 'CRM',                 description: 'Pipeline e Inbox (Premium)',            icon: 'MessageCircle', route: '/crm' },
]

const MODULE_KEYS = new Set<string>(MODULES.map(m => m.key))
export function isValidModuleKey(s: string): s is ModuleKey {
  return MODULE_KEYS.has(s)
}

// Aceita tanto o User do Supabase (app_metadata: UserAppMetadata) quanto um
// objeto simples — usar `unknown`-like loose shape pra compatibilidade.
type UserLike = { app_metadata?: Record<string, unknown> | { tenant_role?: string } }

/**
 * True se o user tem garantia de acesso total — apenas owner.
 * Manager pode ter ou não acesso total (depende de tenant_member_permissions);
 * a fonte da verdade é `getUserPermissions` (server). Pra UI, sempre filtre
 * a partir de allowedModules — esse helper é só pra atalhos óbvios.
 */
export function hasFullAccess(user: UserLike): boolean {
  const role = (user.app_metadata as { tenant_role?: string } | undefined)?.tenant_role
  return role === 'owner'
}

/** Sync: dado uma lista pré-carregada, checa se módulo está liberado. */
export function canAccessModuleSync(
  user: UserLike,
  perms: ModuleKey[],
  key: ModuleKey,
): boolean {
  if (hasFullAccess(user)) return true
  return perms.includes(key)
}
