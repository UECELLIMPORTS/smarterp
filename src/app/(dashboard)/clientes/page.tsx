import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { Users, Phone, Mail, FileText, ShoppingBag, Wrench } from 'lucide-react'

export const metadata = { title: 'Clientes — Smart ERP' }

function fmtCpf(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
  return v
}

function fmtPhone(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return v
}

export default async function ClientesPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const { supabase, user } = auth
  const tenantId = getTenantId(user)

  const [customersRes, salesCountRes, osCountRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, full_name, cpf_cnpj, whatsapp, email, address_city, address_state, created_at')
      .eq('tenant_id', tenantId)
      .order('full_name'),

    supabase
      .from('sales')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .not('customer_id', 'is', null),

    supabase
      .from('service_orders')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .not('customer_id', 'is', null),
  ])

  type Customer = {
    id: string
    full_name: string
    cpf_cnpj: string | null
    whatsapp: string | null
    email: string | null
    address_city: string | null
    address_state: string | null
    created_at: string
  }

  const customers  = (customersRes.data  ?? []) as Customer[]
  const salesRows  = (salesCountRes.data ?? []) as { customer_id: string }[]
  const osRows     = (osCountRes.data    ?? []) as { customer_id: string }[]

  // Build activity counts per customer
  const salesByCustomer = salesRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.customer_id] = (acc[r.customer_id] ?? 0) + 1
    return acc
  }, {})

  const osByCustomer = osRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.customer_id] = (acc[r.customer_id] ?? 0) + 1
    return acc
  }, {})

  const totalActive = customers.filter(
    c => (salesByCustomer[c.id] ?? 0) + (osByCustomer[c.id] ?? 0) > 0
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Clientes</h1>
        <p className="mt-1 text-sm text-muted">Cadastro unificado — Smart ERP e CheckSmart</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        {[
          { label: 'Total de Clientes',  value: String(customers.length),  icon: Users,       color: '#00FF94' },
          { label: 'Com Atividade',       value: String(totalActive),        icon: ShoppingBag, color: '#00E5FF' },
          { label: 'OS no CheckSmart',   value: String(osRows.length),      icon: Wrench,      color: '#FFB800' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border p-5" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
                <p className="mt-2 text-2xl font-bold text-text">{value}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Customer list */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-sm font-semibold text-text">Todos os Clientes</h2>
          <span className="text-xs text-muted">{customers.length} {customers.length === 1 ? 'cliente' : 'clientes'}</span>
        </div>

        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Users className="h-10 w-10" style={{ color: '#1E2D45' }} />
            <p className="text-sm text-muted">Nenhum cliente cadastrado ainda</p>
            <p className="text-xs" style={{ color: '#1E2D45' }}>
              Clientes cadastrados no Frente de Caixa ou no CheckSmart aparecerão aqui
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="grid gap-4 px-5 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
              style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 140px 180px 80px 80px' }}
            >
              <span>Nome</span>
              <span>Documento</span>
              <span>Contato</span>
              <span className="text-center">Vendas</span>
              <span className="text-center">OS</span>
            </div>

            {customers.map(c => {
              const vendas = salesByCustomer[c.id] ?? 0
              const os     = osByCustomer[c.id]    ?? 0
              const hasActivity = vendas + os > 0

              return (
                <div
                  key={c.id}
                  className="grid gap-4 px-5 py-3.5 border-b items-center last:border-0"
                  style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 140px 180px 80px 80px' }}
                >
                  {/* Name + city */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text truncate">{c.full_name}</p>
                      {hasActivity && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: '#00FF9418', color: '#00FF94' }}
                        >
                          Ativo
                        </span>
                      )}
                    </div>
                    {(c.address_city || c.address_state) && (
                      <p className="mt-0.5 text-xs text-muted truncate">
                        {[c.address_city, c.address_state].filter(Boolean).join(' — ')}
                      </p>
                    )}
                  </div>

                  {/* Document */}
                  <div className="min-w-0">
                    {c.cpf_cnpj ? (
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 shrink-0 text-muted" />
                        <p className="text-xs text-muted truncate">{fmtCpf(c.cpf_cnpj)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted">—</p>
                    )}
                  </div>

                  {/* Contact */}
                  <div className="space-y-0.5 min-w-0">
                    {c.whatsapp && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0 text-muted" />
                        <p className="text-xs text-muted truncate">{fmtPhone(c.whatsapp)}</p>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0 text-muted" />
                        <p className="text-xs text-muted truncate">{c.email}</p>
                      </div>
                    )}
                    {!c.whatsapp && !c.email && (
                      <p className="text-xs text-muted">—</p>
                    )}
                  </div>

                  {/* Sales count */}
                  <p className="text-sm text-center" style={{ color: vendas > 0 ? '#00FF94' : '#64748B' }}>
                    {vendas > 0 ? vendas : '—'}
                  </p>

                  {/* OS count */}
                  <p className="text-sm text-center" style={{ color: os > 0 ? '#00E5FF' : '#64748B' }}>
                    {os > 0 ? os : '—'}
                  </p>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
