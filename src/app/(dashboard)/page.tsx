import {
  DollarSign, ShoppingCart, Users, Receipt,
  TrendingUp, Wrench, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────
type KPICardProps = {
  title:    string
  value:    string
  subtitle: string
  icon:     React.ElementType
  color:    string
  trend?:   { value: string; positive: boolean }
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ title, value, subtitle, icon: Icon, color, trend }: KPICardProps) {
  return (
    <div
      className="rounded-xl border p-5 transition-colors"
      style={{ background: '#111827', borderColor: '#1E2D45' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748B' }}>
            {title}
          </p>
          <p className="mt-2 text-2xl font-bold text-text">{value}</p>
          <p className="mt-1 text-xs" style={{ color: '#64748B' }}>{subtitle}</p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${color}18` }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium">
          {trend.positive
            ? <ArrowUpRight className="h-3.5 w-3.5" style={{ color: '#00FF94' }} />
            : <ArrowDownRight className="h-3.5 w-3.5" style={{ color: '#FF5C5C' }} />
          }
          <span style={{ color: trend.positive ? '#00FF94' : '#FF5C5C' }}>{trend.value}</span>
          <span style={{ color: '#64748B' }}>vs. ontem</span>
        </div>
      )}
    </div>
  )
}

// ── Atividade recente (mock) ───────────────────────────────────────────────
const RECENT_ACTIVITY = [
  { id: 1, type: 'venda',  desc: 'Venda #1042 — iPhone 15 Pro',    value: 'R$ 4.800,00', time: '14:32', color: '#00FF94' },
  { id: 2, type: 'os',     desc: 'OS #0067 aberta — Samsung A55',   value: 'Recebido',    time: '13:15', color: '#00E5FF' },
  { id: 3, type: 'venda',  desc: 'Venda #1041 — Acessórios',        value: 'R$ 320,00',  time: '11:50', color: '#00FF94' },
  { id: 4, type: 'os',     desc: 'OS #0065 entregue — iPhone 12',   value: 'Entregue',   time: '10:20', color: '#00E5FF' },
  { id: 5, type: 'pagto',  desc: 'Recebimento OS #0063',            value: 'R$ 750,00',  time: '09:05', color: '#FFB800' },
]

// ── Page ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Dashboard</h1>
        <p className="mt-1 text-sm capitalize" style={{ color: '#64748B' }}>{today}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KPICard
          title="Faturamento Hoje"
          value="R$ 5.120,00"
          subtitle="3 transações realizadas"
          icon={DollarSign}
          color="#00FF94"
          trend={{ value: '+12%', positive: true }}
        />
        <KPICard
          title="Faturamento do Mês"
          value="R$ 38.450,00"
          subtitle="Abril 2026"
          icon={TrendingUp}
          color="#00E5FF"
          trend={{ value: '+8%', positive: true }}
        />
        <KPICard
          title="Vendas Hoje"
          value="3"
          subtitle="Meta diária: 5 vendas"
          icon={ShoppingCart}
          color="#FFB800"
        />
        <KPICard
          title="Ticket Médio"
          value="R$ 1.707,00"
          subtitle="Baseado nas vendas de hoje"
          icon={Receipt}
          color="#00E5FF"
          trend={{ value: '+5%', positive: true }}
        />
        <KPICard
          title="Clientes Ativos"
          value="284"
          subtitle="Últimos 90 dias"
          icon={Users}
          color="#00FF94"
          trend={{ value: '+3', positive: true }}
        />
        <KPICard
          title="OS Abertas"
          value="12"
          subtitle="No CheckSmart"
          icon={Wrench}
          color="#FF5C5C"
          trend={{ value: '2 novas', positive: false }}
        />
      </div>

      {/* Atividade recente */}
      <div className="rounded-xl border" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-sm font-semibold text-text">Atividade Recente</h2>
          <span className="text-xs" style={{ color: '#64748B' }}>Hoje</span>
        </div>
        <ul className="divide-y" style={{ borderColor: '#1E2D45' }}>
          {RECENT_ACTIVITY.map((item) => (
            <li key={item.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                <p className="text-sm text-text">{item.desc}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs" style={{ color: '#64748B' }}>{item.time}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Aviso de dados mockados */}
      <p className="text-center text-xs" style={{ color: '#1E2D45' }}>
        * KPIs mockados — integração real em desenvolvimento
      </p>
    </div>
  )
}
