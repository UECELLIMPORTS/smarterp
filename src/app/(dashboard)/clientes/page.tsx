import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import { Users, ShoppingBag, Wrench } from 'lucide-react'
import { ClientesClient, type CustomerRow } from './clientes-client'

export const metadata = { title: 'Clientes — Smart ERP' }

export default async function ClientesPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const { supabase, user } = auth
  const tenantId = getTenantId(user)

  const [customersRes, salesCountRes, osCountRes] = await Promise.all([
    // range(0, 1999) supera o limite padrão de 1000 do PostgREST
    supabase
      .from('customers')
      .select('id, full_name, cpf_cnpj, whatsapp, email, birth_date, address_zip, address_street, address_number, address_complement, address_city, address_state, created_at')
      .eq('tenant_id', tenantId)
      .order('full_name')
      .range(0, 1999),

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

  const customers = (customersRes.data ?? []) as CustomerRow[]
  const salesRows = (salesCountRes.data ?? []) as { customer_id: string }[]
  const osRows    = (osCountRes.data    ?? []) as { customer_id: string }[]

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
          { label: 'Total de Clientes', value: String(customers.length), icon: Users,       color: '#00FF94' },
          { label: 'Com Atividade',      value: String(totalActive),      icon: ShoppingBag, color: '#00E5FF' },
          { label: 'OS no CheckSmart',  value: String(osRows.length),    icon: Wrench,      color: '#FFB800' },
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

      {/* Client component: search + table + create modal */}
      <ClientesClient
        customers={customers}
        salesByCustomer={salesByCustomer}
        osByCustomer={osByCustomer}
      />
    </div>
  )
}
