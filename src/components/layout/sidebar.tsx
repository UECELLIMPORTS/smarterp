'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, DollarSign,
  Users, BarChart2, Target, TrendingUp, Settings, Zap, PieChart,
} from 'lucide-react'

const NAV = [
  { href: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/pos',           icon: ShoppingCart,    label: 'Frente de Caixa' },
  { href: '/estoque',       icon: Package,         label: 'Estoque' },
  { href: '/financeiro',    icon: DollarSign,      label: 'Financeiro' },
  { href: '/clientes',      icon: Users,           label: 'Clientes' },
  { href: '/erp-clientes',  icon: PieChart,        label: 'ERP Clientes' },
  { href: '/relatorios',    icon: BarChart2,       label: 'Relatórios' },
  { href: '/crm',           icon: Target,          label: 'CRM' },
  { href: '/meta-ads',      icon: TrendingUp,      label: 'Meta Ads' },
  { href: '/configuracoes', icon: Settings,        label: 'Configurações' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r"
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
          {NAV.map(({ href, icon: Icon, label }) => {
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
