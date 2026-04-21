'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, X, Loader2, Phone, Mail, FileText, User } from 'lucide-react'
import { toast } from 'sonner'
import { createCustomer } from '@/actions/pos'

// ── Types ──────────────────────────────────────────────────────────────────

export type CustomerRow = {
  id: string
  full_name: string
  cpf_cnpj: string | null
  whatsapp: string | null
  email: string | null
  address_city: string | null
  address_state: string | null
  created_at: string
}

type Props = {
  customers: CustomerRow[]
  salesByCustomer: Record<string, number>
  osByCustomer: Record<string, number>
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function fmtPhoneInput(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

function fmtCpfInput(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

function fmtCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0,5)}-${d.slice(5)}`
}

const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/60 placeholder:text-muted'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

// ── Component ──────────────────────────────────────────────────────────────

export function ClientesClient({ customers: initial, salesByCustomer, osByCustomer }: Props) {
  const [customers, setCustomers] = useState(initial)
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [fetchingCep, setFetchingCep] = useState(false)

  const [form, setForm] = useState({
    name: '', cpf: '', whatsapp: '', email: '',
    cep: '', addressStreet: '', addressNumber: '',
    addressComplement: '', addressCity: '', addressState: '',
  })

  // ── Search filter ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return customers
    return customers.filter(c => {
      const digits = q.replace(/\D/g, '')
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.cpf_cnpj && digits.length >= 3 && c.cpf_cnpj.includes(digits)) ||
        (c.whatsapp  && digits.length >= 3 && c.whatsapp.includes(digits)) ||
        (c.email     && c.email.toLowerCase().includes(q))
      )
    })
  }, [customers, search])

  // ── CEP lookup ────────────────────────────────────────────────────────

  async function handleCepBlur(val: string) {
    const d = val.replace(/\D/g, '')
    if (d.length !== 8) return
    setFetchingCep(true)
    try {
      const r    = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const data = await r.json()
      if (!data.erro) setForm(p => ({
        ...p,
        addressStreet: data.logradouro ?? '',
        addressCity:   data.localidade ?? '',
        addressState:  data.uf ?? '',
      }))
    } catch { /* silent */ }
    finally { setFetchingCep(false) }
  }

  // ── Save new customer ─────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const c = await createCustomer(form)
      const newRow: CustomerRow = {
        id:           c.id,
        full_name:    c.full_name,
        cpf_cnpj:     c.cpf_cnpj,
        whatsapp:     c.whatsapp,
        email:        c.email,
        address_city: null,
        address_state: null,
        created_at:   new Date().toISOString(),
      }
      setCustomers(prev => [newRow, ...prev].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')))
      setShowModal(false)
      setForm({ name: '', cpf: '', whatsapp: '', email: '', cep: '', addressStreet: '', addressNumber: '', addressComplement: '', addressCity: '', addressState: '' })
      toast.success('Cliente cadastrado com sucesso!')
    } catch {
      toast.error('Erro ao cadastrar cliente')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Search + New button */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF, WhatsApp ou e-mail..."
            className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm text-text outline-none transition-colors focus:border-accent/60 placeholder:text-muted"
            style={{ background: '#111827', borderColor: '#1E2D45' }}
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-sm font-semibold text-text">Todos os Clientes</h2>
          <span className="text-xs text-muted">
            {filtered.length !== customers.length
              ? `${filtered.length} de ${customers.length} clientes`
              : `${customers.length} ${customers.length === 1 ? 'cliente' : 'clientes'}`}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Search className="h-8 w-8" style={{ color: '#1E2D45' }} />
            <p className="text-sm text-muted">
              {search ? `Nenhum cliente encontrado para "${search}"` : 'Nenhum cliente cadastrado ainda'}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="grid gap-4 px-5 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
              style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 150px 190px 120px 70px 70px' }}
            >
              <span>Nome</span>
              <span>Documento</span>
              <span>Contato</span>
              <span>Cliente desde</span>
              <span className="text-center">Vendas</span>
              <span className="text-center">OS</span>
            </div>

            {filtered.map(c => {
              const vendas      = salesByCustomer[c.id] ?? 0
              const os          = osByCustomer[c.id]    ?? 0
              const hasActivity = vendas + os > 0
              const since       = new Date(c.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
              })

              return (
                <div
                  key={c.id}
                  className="grid gap-4 px-5 py-3.5 border-b items-center last:border-0"
                  style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 150px 190px 120px 70px 70px' }}
                >
                  {/* Name */}
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
                    {!c.whatsapp && !c.email && <p className="text-xs text-muted">—</p>}
                  </div>

                  {/* Since */}
                  <p className="text-xs text-muted">{since}</p>

                  {/* Sales */}
                  <p className="text-sm text-center font-medium" style={{ color: vendas > 0 ? '#00FF94' : '#64748B' }}>
                    {vendas > 0 ? vendas : '—'}
                  </p>

                  {/* OS */}
                  <p className="text-sm text-center font-medium" style={{ color: os > 0 ? '#00E5FF' : '#64748B' }}>
                    {os > 0 ? os : '—'}
                  </p>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── New Customer Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6 space-y-4 overflow-y-auto max-h-[90vh]"
            style={{ background: '#0D1320', borderColor: '#1E2D45' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-text">Novo Cliente</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-coral transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Nome completo *"
                className={inputCls}
                style={inputStyle}
                autoFocus
              />
              <input
                value={form.cpf}
                onChange={e => setForm(p => ({ ...p, cpf: fmtCpfInput(e.target.value) }))}
                placeholder="CPF"
                className={inputCls}
                style={inputStyle}
              />
              <input
                value={form.whatsapp}
                onChange={e => setForm(p => ({ ...p, whatsapp: fmtPhoneInput(e.target.value) }))}
                placeholder="WhatsApp"
                className={inputCls}
                style={inputStyle}
              />
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="E-mail"
                className={inputCls}
                style={inputStyle}
              />

              <div className="border-t pt-3 space-y-3" style={{ borderColor: '#1E2D45' }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Endereço (opcional)</p>
                <div className="relative">
                  <input
                    value={form.cep}
                    onChange={e => setForm(p => ({ ...p, cep: fmtCep(e.target.value) }))}
                    onBlur={e => handleCepBlur(e.target.value)}
                    placeholder="CEP"
                    className={inputCls}
                    style={inputStyle}
                  />
                  {fetchingCep && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted" />
                  )}
                </div>

                {form.addressStreet && (
                  <input
                    value={form.addressStreet}
                    onChange={e => setForm(p => ({ ...p, addressStreet: e.target.value }))}
                    placeholder="Logradouro"
                    className={inputCls}
                    style={inputStyle}
                  />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={form.addressNumber}
                    onChange={e => setForm(p => ({ ...p, addressNumber: e.target.value }))}
                    placeholder="Número"
                    className={inputCls}
                    style={inputStyle}
                  />
                  <input
                    value={form.addressComplement}
                    onChange={e => setForm(p => ({ ...p, addressComplement: e.target.value }))}
                    placeholder="Complemento"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>

                {(form.addressCity || form.addressState) && (
                  <div className="grid grid-cols-[1fr_56px] gap-2">
                    <input
                      value={form.addressCity}
                      onChange={e => setForm(p => ({ ...p, addressCity: e.target.value }))}
                      placeholder="Cidade"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <input
                      value={form.addressState}
                      onChange={e => setForm(p => ({ ...p, addressState: e.target.value }))}
                      placeholder="UF"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-lg border py-2.5 text-sm font-medium text-muted hover:bg-card transition-colors"
                style={{ borderColor: '#1E2D45' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
