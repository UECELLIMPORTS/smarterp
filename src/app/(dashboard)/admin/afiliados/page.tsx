/**
 * /admin/afiliados — lista + KPIs + filtros + busca.
 *
 * Acesso restrito (mesma whitelist do /admin). Server component que busca a
 * lista no servidor e delega filtros/busca pro client component.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Lock, Plus, Wallet } from 'lucide-react'
import { requireAuth } from '@/lib/supabase/server'
import { listAffiliates, getAffiliateKpis } from '@/actions/affiliates-admin'
import { AfiliadosClient } from './client'

export const metadata = { title: 'Afiliados — Smart ERP' }

const ADMIN_EMAILS = [
  'uedsonfelipepessoal@gmail.com',
  'uedsonfelipeprofissional@gmail.com',
]

export default async function AfiliadosAdminPage() {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try { auth = await requireAuth() } catch { redirect('/login') }

  const email = auth.user.email ?? ''
  if (!ADMIN_EMAILS.includes(email)) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs hover:underline mb-4"
          style={{ color: '#94A3B8' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar pro Admin
        </Link>
        <div className="rounded-2xl border p-12 text-center"
          style={{ background: '#131C2A', borderColor: 'rgba(255,77,109,.3)' }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
            style={{ background: 'rgba(255,77,109,.1)', borderColor: 'rgba(255,77,109,.3)' }}>
            <Lock className="h-7 w-7" style={{ color: '#EF4444' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#F8FAFC' }}>Acesso restrito</h1>
        </div>
      </div>
    )
  }

  const [affiliates, kpis] = await Promise.all([
    listAffiliates(),
    getAffiliateKpis(),
  ])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold" style={{ color: '#F8FAFC' }}>Afiliados</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/afiliados/pagamentos"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(16,185,129,.1)', borderColor: 'rgba(16,185,129,.3)', color: '#10B981' }}
          >
            <Wallet className="h-3.5 w-3.5" /> Pagamentos
          </Link>
          <Link
            href="/admin/afiliados/novo"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            style={{ background: '#10B981' }}
          >
            <Plus className="h-3.5 w-3.5" /> Novo afiliado
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Total"      value={kpis.total.toString()}              tint="#3B82F6" />
        <KpiCard label="Ativos"     value={kpis.active.toString()}             tint="#10B981" />
        <KpiCard label="A pagar"    value={fmtBRL(kpis.payableCents)}          tint="#F59E0B" />
        <KpiCard label="Pendentes"  value={fmtBRL(kpis.pendingCents)}          tint="#94A3B8"
                  hint={kpis.underReviewCount > 0 ? `${kpis.underReviewCount} em revisão` : undefined} />
      </div>

      {/* Lista (client) */}
      <AfiliadosClient initialList={affiliates} />
    </div>
  )
}

function KpiCard({ label, value, tint, hint }: { label: string; value: string; tint: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ background: '#131C2A', borderColor: 'rgba(255,255,255,.06)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: '#94A3B8' }}>{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1" style={{ color: tint }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: '#F59E0B' }}>{hint}</p>}
    </div>
  )
}

function fmtBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
