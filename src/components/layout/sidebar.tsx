'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, DollarSign,
  Users, BarChart2, Target, TrendingUp, Settings, Zap, PieChart, Store,
} from 'lucide-react'
import type { ModuleKey } from '@/lib/permissions-shared'

// Exportado pra MobileNav reaproveitar a mesma lista
// Cada item tem `moduleKey` opcional — se setado, item só aparece pra users
// com esse módulo liberado (ou owner/manager). Sem moduleKey = sempre aparece.
export const NAV: {
  href: string
  icon: React.ElementType
  label: string
  moduleKey?: ModuleKey
}[] = [
  { href: '/',                  icon: LayoutDashboard, label: 'Dashboard' },              // sempre acessível
  { href: '/pos',               icon: ShoppingCart,    label: 'Frente de Caixa', moduleKey: 'pos' },
  { href: '/estoque',           icon: Package,         label: 'Estoque',         moduleKey: 'estoque' },
  { href: '/financeiro',        icon: DollarSign,      label: 'Financeiro',      moduleKey: 'financeiro' },
  { href: '/clientes',          icon: Users,           label: 'Clientes',        moduleKey: 'clientes' },
  { href: '/erp-clientes',      icon: PieChart,        label: 'ERP Clientes',    moduleKey: 'erp_clientes' },
  { href: '/analytics/canais',  icon: Store,           label: 'Canais',          moduleKey: 'analytics_canais' },
  { href: '/relatorios',        icon: BarChart2,       label: 'Relatórios',      moduleKey: 'relatorios' },
  { href: '/crm',               icon: Target,          label: 'CRM',             moduleKey: 'crm' },
  { href: '/meta-ads',          icon: TrendingUp,      label: 'Meta Ads',        moduleKey: 'meta_ads' },
  { href: '/configuracoes',     icon: Settings,        label: 'Configurações' },           // owner-only (gate na page)
]

/** Filtra NAV baseado nas permissions do user. Retorna lista de itens visíveis. */
export function filterNavByPermissions(
  hasFullAccess: boolean,
  allowedModules: ModuleKey[],
  isOwner: boolean,
): typeof NAV {
  return NAV.filter(item => {
    // Sempre mostra itens sem moduleKey (Dashboard) — Configurações tem gate especial
    if (item.href === '/configuracoes') return isOwner
    if (!item.moduleKey) return true
    if (hasFullAccess) return true
    return allowedModules.includes(item.moduleKey)
  })
}

type Props = {
  hasFullAccess?: boolean
  allowedModules?: ModuleKey[]
  isOwner?:       boolean
}

export function Sidebar({ hasFullAccess = true, allowedModules = [], isOwner = true }: Props) {
  const pathname = usePathname()
  const visibleNav = filterNavByPermissions(hasFullAccess, allowedModules, isOwner)

  return (
    <aside
      // Esconde no mobile (<lg). Mobile usa <MobileNav> dentro do Topbar.
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r lg:flex"
      style={{ background: '#0D1320', borderColor: '#1E2D45' }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-5" style={{ borderColor: '#1E2D45' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30"
          style={{ background: 'linear-gradient(135deg, #00E5FF20, #00FF9420)' }}>
          <Zap className="h-4 w-4" style={{ color: '#00E5FF' }} />
        </div>
        <span className="text-base font-bold tracking-tight text-text">
          Smart<span style={{ color: '#00E5FF' }}>ERP</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {visibleNav.map(({ href, icon: Icon, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
                  style={active
                    ? { background: '#00E5FF15', color: '#00E5FF', borderLeft: '2px solid #00E5FF' }
                    : { color: '#64748B' }
                  }
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-3" style={{ borderColor: '#1E2D45' }}>
        <p className="text-center text-[10px]" style={{ color: '#1E2D45' }}>v1.0.0</p>
      </div>
    </aside>
  )
}
