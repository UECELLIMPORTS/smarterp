'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, X, Loader2, Phone, Mail, FileText, User, Pencil, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { createCustomer, updateCustomer } from '@/actions/pos'

// ── Types ──────────────────────────────────────────────────────────────────

export type CustomerRow = {
  id: string
  full_name: string
  cpf_cnpj: string | null
  whatsapp: string | null
  email: string | null
  birth_date: string | null
  address_zip: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_city: string | null
  address_state: string | null
  created_at: string
}

type Props = {
  customers: CustomerRow[]
  salesByCustomer: Record<string, number>
  osByCustomer: Record<string, number>
}

type FormState = {
  name: string; cpf: string; whatsapp: string; email: string; birthDate: string
  cep: string; addressStreet: string; addressNumber: string
  addressComplement: string; addressCity: string; addressState: string
}

const EMPTY_FORM: FormState = {
  name: '', cpf: '', whatsapp: '', email: '', birthDate: '',
  cep: '', addressStreet: '', addressNumber: '',
  addressComplement: '', addressCity: '', addressState: '',
}

// ── Formatters ─────────────────────────────────────────────────────────────

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
  if (d.length <= 2)  return d
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`
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

function fmtBirthDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const inputCls   = 'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/60 placeholder:text-muted'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

// ── Customer Form Modal ────────────────────────────────────────────────────

function CustomerModal({
  mode, editId, initial, onClose, onSaved,
}: {
  mode: 'create' | 'edit'
  editId?: string
  initial: FormState
  onClose: () => void
  onSaved: (updated: CustomerRow, isEdit: boolean) => void
}) {
  const [form, setForm]           = useState<FormState>(initial)
  const [saving, setSaving]       = useState(false)
  const [fetchingCep, setFetching] = useState(false)

  const set = (patch: Partial<FormState>) => setForm(p => ({ ...p, ...patch }))

  async function handleCepBlur(val: string) {
    const d = val.replace(/\D/g, '')
    if (d.length !== 8) return
    setFetching(true)
    try {
      const r    = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const data = await r.json()
      if (!data.erro) set({
        addressStreet: data.logradouro ?? '',
        addressCity:   data.localidade ?? '',
        addressState:  data.uf ?? '',
      })
    } catch { /* silent */ }
    finally { setFetching(false) }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }

    setSaving(true)
    try {
      let result: Awaited<ReturnType<typeof createCustomer>>
      if (mode === 'edit' && editId) {
        result = await updateCustomer({ ...form, id: editId })
      } else {
        result = await createCustomer(form)
      }

      const row: CustomerRow = {
        id:               result.id,
        full_name:        result.full_name,
        cpf_cnpj:         result.cpf_cnpj,
        whatsapp:         result.whatsapp,
        email:            result.email,
        birth_date:       form.birthDate || null,
        address_zip:      form.cep.replace(/\D/g, '') || null,
        address_street:   form.addressStreet || null,
        address_number:   form.addressNumber || null,
        address_complement: form.addressComplement || null,
        address_city:     form.addressCity || null,
        address_state:    form.addressState || null,
        created_at:       mode === 'edit' ? initial.name : new Date().toISOString(),
      }

      onSaved(row, mode === 'edit')
      toast.success(mode === 'edit' ? 'Cliente atualizado!' : 'Cliente cadastrado!')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 space-y-4 overflow-y-auto max-h-[90vh]"
        style={{ background: '#0D1320', borderColor: '#1E2D45' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-text">
              {mode === 'edit' ? 'Editar Cliente' : 'Novo Cliente'}
            </h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-coral transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Dados pessoais ── */}
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={e => set({ name: e.target.value })}
            placeholder="Nome completo *"
            className={inputCls}
            style={inputStyle}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.cpf}
              onChange={e => set({ cpf: fmtCpfInput(e.target.value) })}
              placeholder="CPF"
              className={inputCls}
              style={inputStyle}
            />
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="date"
                value={form.birthDate}
                onChange={e => set({ birthDate: e.target.value })}
                className={inputCls + ' pl-9'}
                style={inputStyle}
                title="Data de aniversário"
              />
            </div>
          </div>

          <input
            value={form.whatsapp}
            onChange={e => set({ whatsapp: fmtPhoneInput(e.target.value) })}
            placeholder="WhatsApp"
            className={inputCls}
            style={inputStyle}
          />

          <input
            type="email"
            value={form.email}
            onChange={e => set({ email: e.target.value })}
            placeholder="E-mail"
            className={inputCls}
            style={inputStyle}
          />
        </div>

        {/* ── Endereço ── */}
        <div className="border-t pt-3 space-y-3" style={{ borderColor: '#1E2D45' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Endereço (opcional)</p>

          {/* CEP — opcional, auto-preenche outros campos */}
          <div className="relative">
            <input
              value={form.cep}
              onChange={e => set({ cep: fmtCep(e.target.value) })}
              onBlur={e => handleCepBlur(e.target.value)}
              placeholder="CEP (opcional — auto-preenche)"
              className={inputCls}
              style={inputStyle}
            />
            {fetchingCep && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted" />
            )}
          </div>

          {/* Todos os campos sempre visíveis */}
          <input
            value={form.addressStreet}
            onChange={e => set({ addressStreet: e.target.value })}
            placeholder="Logradouro"
            className={inputCls}
            style={inputStyle}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.addressNumber}
              onChange={e => set({ addressNumber: e.target.value })}
              placeholder="Número"
              className={inputCls}
              style={inputStyle}
            />
            <input
              value={form.addressComplement}
              onChange={e => set({ addressComplement: e.target.value })}
              placeholder="Complemento"
              className={inputCls}
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-[1fr_56px] gap-2">
            <input
              value={form.addressCity}
              onChange={e => set({ addressCity: e.target.value })}
              placeholder="Cidade"
              className={inputCls}
              style={inputStyle}
            />
            <input
              value={form.addressState}
              onChange={e => set({ addressState: e.target.value.toUpperCase().slice(0, 2) })}
              placeholder="UF"
              className={inputCls}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
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
            {mode === 'edit' ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main client component ──────────────────────────────────────────────────

export function ClientesClient({ customers: initial, salesByCustomer, osByCustomer }: Props) {
  const [customers, setCustomers] = useState(initial)
  const [search, setSearch]       = useState('')

  // Modal state
  const [modal, setModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; customer: CustomerRow }
    | null
  >(null)

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

  // ── Modal callbacks ────────────────────────────────────────────────────

  function handleSaved(row: CustomerRow, isEdit: boolean) {
    if (isEdit) {
      setCustomers(prev => prev.map(c => c.id === row.id ? { ...c, ...row } : c))
    } else {
      setCustomers(prev =>
        [row, ...prev].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
      )
    }
  }

  function openEdit(c: CustomerRow) {
    setModal({ mode: 'edit', customer: c })
  }

  function buildFormFromCustomer(c: CustomerRow): FormState {
    const cpf = c.cpf_cnpj
      ? (c.cpf_cnpj.length === 11
          ? `${c.cpf_cnpj.slice(0,3)}.${c.cpf_cnpj.slice(3,6)}.${c.cpf_cnpj.slice(6,9)}-${c.cpf_cnpj.slice(9)}`
          : c.cpf_cnpj)
      : ''
    const wa = c.whatsapp ? fmtPhone(c.whatsapp) : ''
    return {
      name:              c.full_name,
      cpf,
      whatsapp:          wa,
      email:             c.email ?? '',
      birthDate:         c.birth_date ?? '',
      cep:               c.address_zip ?? '',
      addressStreet:     c.address_street ?? '',
      addressNumber:     c.address_number ?? '',
      addressComplement: c.address_complement ?? '',
      addressCity:       c.address_city ?? '',
      addressState:      c.address_state ?? '',
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
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
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
              className="grid gap-3 px-5 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
              style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 150px 190px 100px 100px 60px 60px 36px' }}
            >
              <span>Nome</span>
              <span>Documento</span>
              <span>Contato</span>
              <span>Aniversário</span>
              <span>Cliente desde</span>
              <span className="text-center">Vendas</span>
              <span className="text-center">OS</span>
              <span />
            </div>

            {filtered.map(c => {
              const vendas      = salesByCustomer[c.id] ?? 0
              const os          = osByCustomer[c.id]    ?? 0
              const hasActivity = vendas + os > 0
              const since       = new Date(c.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
              })
              const birthday = c.birth_date ? fmtBirthDate(c.birth_date) : null

              return (
                <div
                  key={c.id}
                  className="grid gap-3 px-5 py-3.5 border-b items-center last:border-0 group"
                  style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 150px 190px 100px 100px 60px 60px 36px' }}
                >
                  {/* Name */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text truncate">{c.full_name}</p>
                      {hasActivity && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: '#00FF9418', color: '#00FF94' }}>Ativo</span>
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
                    ) : <p className="text-xs text-muted">—</p>}
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

                  {/* Birthday */}
                  <div className="min-w-0">
                    {birthday ? (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3 shrink-0 text-muted" />
                        <p className="text-xs text-muted">{birthday}</p>
                      </div>
                    ) : <p className="text-xs text-muted">—</p>}
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

                  {/* Edit button */}
                  <button
                    onClick={() => openEdit(c)}
                    className="flex items-center justify-center h-7 w-7 rounded-lg border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
                    style={{ borderColor: '#1E2D45' }}
                    title="Editar cliente"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted" />
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {modal?.mode === 'create' && (
        <CustomerModal
          mode="create"
          initial={EMPTY_FORM}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {modal?.mode === 'edit' && (
        <CustomerModal
          mode="edit"
          editId={modal.customer.id}
          initial={buildFormFromCustomer(modal.customer)}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
