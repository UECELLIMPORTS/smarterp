'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Search, Plus, X, Loader2, ShoppingBag,
  CheckCircle, User, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  searchProducts, searchCustomers, createCustomer, createSale,
  type Product, type Customer,
} from '@/actions/pos'

// ── Types ──────────────────────────────────────────────────────────────────────

type CartItem = {
  key: string
  productId: string | null
  name: string
  quantity: number
  unitPriceCents: number
}

type PaymentMethod = 'cash' | 'pix' | 'card' | 'mixed'

// ── Helpers ────────────────────────────────────────────────────────────────────

const BRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)

function parseCents(value: string): number {
  const clean = value.replace(/[^\d,]/g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function fmtCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

function fmtPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

function fmtCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0,5)}-${d.slice(5)}`
}

function randKey() {
  return Math.random().toString(36).slice(2)
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/60 placeholder:text-muted'
const inputStyle = { background: '#111827', borderColor: '#1E2D45' }

// ── Component ──────────────────────────────────────────────────────────────────

export function PosClient() {
  // ── Cart ──
  const [cart, setCart] = useState<CartItem[]>([])

  // ── Product search ──
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [showDrop, setShowDrop]   = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // ── Manual item modal ──
  const [showManual, setShowManual]   = useState(false)
  const [mName, setMName]             = useState('')
  const [mPrice, setMPrice]           = useState('')
  const [mQty, setMQty]               = useState('1')

  // ── Adjustments ──
  const [shipping, setShipping] = useState('')
  const [discount, setDiscount] = useState('')

  // ── Payment ──
  const [method, setMethod]     = useState<PaymentMethod>('pix')
  const [mxCash, setMxCash]     = useState('')
  const [mxPix, setMxPix]       = useState('')
  const [mxCard, setMxCard]     = useState('')

  // ── Customer ──
  const [cpf, setCpf]                         = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customer, setCustomer]               = useState<Customer | null>(null)
  const [searchingCpf, setSearchingCpf]       = useState(false)
  const [showCustomerDrop, setShowCustomerDrop] = useState(false)
  const [showForm, setShowForm]               = useState(false)
  const [nc, setNc] = useState({
    name: '', cpf: '', whatsapp: '', email: '',
    cep: '', addressStreet: '', addressNumber: '',
    addressComplement: '', addressCity: '', addressState: '',
  })
  const [fetchingCep, setFetchingCep]         = useState(false)
  const [savingCustomer, setSavingCustomer]   = useState(false)

  // ── Finalize ──
  const [finalizing, setFinalizing] = useState(false)

  // ── Computed ──
  const subtotal = cart.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0)
  const total    = Math.max(0, subtotal + parseCents(shipping) - parseCents(discount))

  // ── Product search debounce ──
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setShowDrop(false); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await searchProducts(query)
        setResults(r)
        setShowDrop(r.length > 0)
      } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // ── Close dropdown on outside click ──
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── Cart helpers ──
  function addProduct(p: Product) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return [...prev, { key: randKey(), productId: p.id, name: p.name, quantity: 1, unitPriceCents: p.price_cents }]
    })
    setQuery('')
    setShowDrop(false)
  }

  function addManual() {
    if (!mName.trim() || !mPrice) return
    setCart(prev => [...prev, {
      key: randKey(), productId: null,
      name: mName.trim(),
      quantity: Math.max(1, parseInt(mQty) || 1),
      unitPriceCents: parseCents(mPrice),
    }])
    setMName(''); setMPrice(''); setMQty('1'); setShowManual(false)
  }

  function setQty(key: string, q: number) {
    if (q <= 0) { setCart(prev => prev.filter(i => i.key !== key)); return }
    setCart(prev => prev.map(i => i.key === key ? { ...i, quantity: q } : i))
  }

  function setPrice(key: string, val: string) {
    setCart(prev => prev.map(i => i.key === key ? { ...i, unitPriceCents: parseCents(val) } : i))
  }

  function remove(key: string) {
    setCart(prev => prev.filter(i => i.key !== key))
  }

  // ── Customer search ──
  async function handleCustomerSearch() {
    if (cpf.trim().length < 2) { toast.error('Digite ao menos 2 caracteres'); return }
    setSearchingCpf(true); setCustomer(null); setShowForm(false); setShowCustomerDrop(false)
    try {
      const found = await searchCustomers(cpf.trim())
      if (found.length === 1) {
        setCustomer(found[0]); toast.success('Cliente encontrado!')
      } else if (found.length > 1) {
        setCustomerResults(found); setShowCustomerDrop(true)
      } else {
        const digits = cpf.replace(/\D/g, '')
        setNc(p => ({ ...p, cpf: digits.length === 11 ? fmtCpf(cpf) : '' }))
        setShowForm(true)
        toast.info('Cliente não encontrado — preencha os dados para cadastrar')
      }
    } finally { setSearchingCpf(false) }
  }

  function selectCustomer(c: Customer) {
    setCustomer(c); setShowCustomerDrop(false); setCustomerResults([]); toast.success('Cliente selecionado!')
  }

  // ── CEP lookup ──
  async function handleCepBlur(val: string) {
    const d = val.replace(/\D/g, '')
    if (d.length !== 8) return
    setFetchingCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const data = await r.json()
      if (!data.erro) setNc(p => ({
        ...p,
        addressStreet: data.logradouro ?? '',
        addressCity:   data.localidade ?? '',
        addressState:  data.uf ?? '',
      }))
    } catch { /* silent */ } finally { setFetchingCep(false) }
  }

  // ── Save new customer ──
  async function handleSaveCustomer() {
    if (!nc.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSavingCustomer(true)
    try {
      const c = await createCustomer(nc)
      setCustomer(c)
      setShowForm(false)
      toast.success('Cliente cadastrado!')
    } catch { toast.error('Erro ao cadastrar cliente') }
    finally { setSavingCustomer(false) }
  }

  // ── Finalize sale ──
  async function handleFinalize() {
    if (cart.length === 0) { toast.error('Adicione ao menos um item'); return }
    if (method === 'mixed') {
      const sum = parseCents(mxCash) + parseCents(mxPix) + parseCents(mxCard)
      if (Math.abs(sum - total) > 1) {
        toast.error(`Soma dos pagamentos (${BRL(sum)}) ≠ total (${BRL(total)})`)
        return
      }
    }
    setFinalizing(true)
    try {
      await createSale({
        customerId:     customer?.id ?? null,
        subtotalCents:  subtotal,
        discountCents:  parseCents(discount),
        shippingCents:  parseCents(shipping),
        totalCents:     total,
        paymentMethod:  method,
        paymentDetails: method === 'mixed'
          ? { cash: parseCents(mxCash), pix: parseCents(mxPix), card: parseCents(mxCard) }
          : null,
        items: cart.map(i => ({
          productId:       i.productId,
          name:            i.name,
          quantity:        i.quantity,
          unitPriceCents:  i.unitPriceCents,
          subtotalCents:   i.unitPriceCents * i.quantity,
        })),
      })
      toast.success('Venda finalizada com sucesso!')
      setCart([]); setCustomer(null); setCpf(''); setShipping(''); setDiscount('')
      setCustomerResults([]); setShowCustomerDrop(false)
      setMethod('pix'); setMxCash(''); setMxPix(''); setMxCard('')
    } catch { toast.error('Erro ao finalizar venda') }
    finally { setFinalizing(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Frente de Caixa</h1>
        <p className="mt-1 text-sm text-muted capitalize">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]">

        {/* ── LEFT: search + cart ── */}
        <div className="space-y-4">

          {/* Search bar */}
          <div ref={dropRef} className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar produto por nome ou código..."
                  className="w-full rounded-xl border py-2.5 pl-9 pr-10 text-sm text-text outline-none transition-colors focus:border-accent/60 placeholder:text-muted"
                  style={inputStyle}
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
                )}
              </div>
              <button
                onClick={() => setShowManual(true)}
                className="flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-card text-accent whitespace-nowrap"
                style={{ borderColor: '#1E2D45' }}
              >
                <Plus className="h-4 w-4" />
                Item / Serviço
              </button>
            </div>

            {/* Dropdown */}
            {showDrop && (
              <div
                className="absolute z-50 mt-1 w-full rounded-xl border shadow-xl overflow-hidden"
                style={{ background: '#111827', borderColor: '#1E2D45' }}
              >
                {results.map(p => (
                  <button
                    key={`${p.source}-${p.id}`}
                    onMouseDown={() => addProduct(p)}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-card transition-colors"
                  >
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-text">{p.name}</p>
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={p.source === 'parts_catalog'
                            ? { background: '#FFB80018', color: '#FFB800' }
                            : { background: '#00E5FF18', color: '#00E5FF' }}
                        >
                          {p.source === 'parts_catalog' ? 'Peça' : 'Produto'}
                        </span>
                      </div>
                      {p.code && <p className="text-xs text-muted">Cód: {p.code}</p>}
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <p className="font-semibold text-accent">{BRL(p.price_cents)}</p>
                      {p.stock_qty != null && (
                        <p className="text-xs text-muted">Estoque: {p.stock_qty}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <ShoppingBag className="h-10 w-10" style={{ color: '#1E2D45' }} />
                <p className="text-sm text-muted">Nenhum item adicionado</p>
                <p className="text-xs" style={{ color: '#1E2D45' }}>Busque um produto ou clique em "Manual"</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div
                  className="grid items-center gap-3 px-4 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
                  style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 88px 120px 100px 28px' }}
                >
                  <span>Produto</span>
                  <span className="text-center">Qtd</span>
                  <span className="text-right">Preço Unit.</span>
                  <span className="text-right">Subtotal</span>
                  <span />
                </div>

                {/* Items */}
                {cart.map(item => (
                  <div
                    key={item.key}
                    className="grid items-center gap-3 px-4 py-3 border-b"
                    style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 88px 120px 100px 28px' }}
                  >
                    <p className="text-sm font-medium text-text truncate">{item.name}</p>

                    {/* Qty stepper */}
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setQty(item.key, item.quantity - 1)}
                        className="h-6 w-6 rounded border flex items-center justify-center text-xs text-muted hover:bg-card transition-colors"
                        style={{ borderColor: '#1E2D45' }}
                      >−</button>
                      <span className="w-6 text-center text-sm text-text">{item.quantity}</span>
                      <button
                        onClick={() => setQty(item.key, item.quantity + 1)}
                        className="h-6 w-6 rounded border flex items-center justify-center text-xs text-muted hover:bg-card transition-colors"
                        style={{ borderColor: '#1E2D45' }}
                      >+</button>
                    </div>

                    {/* Unit price (editable) */}
                    <input
                      key={`price-${item.key}`}
                      defaultValue={(item.unitPriceCents / 100).toFixed(2).replace('.', ',')}
                      onBlur={e => setPrice(item.key, e.target.value)}
                      className="w-full rounded-lg border px-2.5 py-1 text-sm text-right text-text outline-none focus:border-accent/60 transition-colors"
                      style={inputStyle}
                    />

                    <p className="text-sm font-semibold text-right text-green">
                      {BRL(item.unitPriceCents * item.quantity)}
                    </p>

                    <button onClick={() => remove(item.key)} className="text-muted hover:text-coral transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {/* Cart footer */}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted">
                    {cart.length} {cart.length === 1 ? 'item' : 'itens'}
                  </span>
                  <span className="text-base font-bold text-green">{BRL(subtotal)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: customer + summary + payment ── */}
        <div className="space-y-4">

          {/* Customer */}
          <div className="rounded-xl border p-5 space-y-4" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <User className="h-4 w-4 text-accent" />
              Cliente
            </h3>

            {customer ? (
              <div
                className="flex items-start justify-between rounded-lg border p-3"
                style={{ background: '#0D1320', borderColor: '#00E5FF30' }}
              >
                <div>
                  <p className="text-sm font-semibold text-text">{customer.full_name}</p>
                  {customer.cpf_cnpj && <p className="mt-0.5 text-xs text-muted">CPF: {fmtCpf(customer.cpf_cnpj)}</p>}
                  {customer.whatsapp && <p className="text-xs text-muted">WhatsApp: {customer.whatsapp}</p>}
                  {customer.email    && <p className="text-xs text-muted">{customer.email}</p>}
                </div>
                <button
                  onClick={() => { setCustomer(null); setCpf(''); setShowForm(false); setCustomerResults([]); setShowCustomerDrop(false) }}
                  className="ml-2 text-muted hover:text-coral transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                {/* Customer search input */}
                <div className="flex gap-2">
                  <input
                    value={cpf}
                    onChange={e => setCpf(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCustomerSearch()}
                    placeholder="Nome, CPF ou WhatsApp..."
                    className={inputCls + ' flex-1'}
                    style={inputStyle}
                  />
                  <button
                    onClick={handleCustomerSearch}
                    disabled={searchingCpf}
                    className="rounded-lg border px-3.5 py-2.5 text-sm font-medium text-accent hover:bg-card transition-colors disabled:opacity-60"
                    style={{ borderColor: '#1E2D45' }}
                  >
                    {searchingCpf ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                  </button>
                </div>

                {/* Multiple results dropdown */}
                {showCustomerDrop && customerResults.length > 0 && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: '#0D1320', borderColor: '#1E2D45' }}>
                    {customerResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                        className="flex w-full items-start justify-between px-4 py-3 text-sm hover:bg-card transition-colors border-b last:border-0"
                        style={{ borderColor: '#1E2D45' }}
                      >
                        <div className="text-left">
                          <p className="font-medium text-text">{c.full_name}</p>
                          {c.cpf_cnpj && <p className="text-xs text-muted">CPF: {fmtCpf(c.cpf_cnpj)}</p>}
                        </div>
                        {c.whatsapp && <p className="text-xs text-muted shrink-0 ml-2">{c.whatsapp}</p>}
                      </button>
                    ))}
                  </div>
                )}

                {/* New customer form */}
                {showForm && (
                  <div className="space-y-3 border-t pt-4" style={{ borderColor: '#1E2D45' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber">Cadastro rápido</p>

                    <input
                      value={nc.name}
                      onChange={e => setNc(p => ({ ...p, name: e.target.value }))}
                      placeholder="Nome completo *"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <input
                      value={nc.whatsapp}
                      onChange={e => setNc(p => ({ ...p, whatsapp: fmtPhone(e.target.value) }))}
                      placeholder="WhatsApp"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <input
                      type="email"
                      value={nc.email}
                      onChange={e => setNc(p => ({ ...p, email: e.target.value }))}
                      placeholder="E-mail"
                      className={inputCls}
                      style={inputStyle}
                    />

                    {/* CEP */}
                    <div className="relative">
                      <input
                        value={nc.cep}
                        onChange={e => setNc(p => ({ ...p, cep: fmtCep(e.target.value) }))}
                        onBlur={e => handleCepBlur(e.target.value)}
                        placeholder="CEP"
                        className={inputCls}
                        style={inputStyle}
                      />
                      {fetchingCep && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted" />
                      )}
                    </div>

                    {/* Street (auto-filled by ViaCEP) */}
                    {nc.addressStreet && (
                      <input
                        value={nc.addressStreet}
                        onChange={e => setNc(p => ({ ...p, addressStreet: e.target.value }))}
                        placeholder="Logradouro"
                        className={inputCls}
                        style={inputStyle}
                      />
                    )}

                    {/* Number + Complement */}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={nc.addressNumber}
                        onChange={e => setNc(p => ({ ...p, addressNumber: e.target.value }))}
                        placeholder="Número"
                        className={inputCls}
                        style={inputStyle}
                      />
                      <input
                        value={nc.addressComplement}
                        onChange={e => setNc(p => ({ ...p, addressComplement: e.target.value }))}
                        placeholder="Complemento"
                        className={inputCls}
                        style={inputStyle}
                      />
                    </div>

                    {/* City + State (auto-filled) */}
                    {(nc.addressCity || nc.addressState) && (
                      <div className="grid grid-cols-[1fr_56px] gap-2">
                        <input
                          value={nc.addressCity}
                          onChange={e => setNc(p => ({ ...p, addressCity: e.target.value }))}
                          placeholder="Cidade"
                          className={inputCls}
                          style={inputStyle}
                        />
                        <input
                          value={nc.addressState}
                          onChange={e => setNc(p => ({ ...p, addressState: e.target.value }))}
                          placeholder="UF"
                          className={inputCls}
                          style={inputStyle}
                        />
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowForm(false); setCpf('') }}
                        className="flex-1 rounded-lg border py-2.5 text-sm font-medium text-muted hover:bg-card transition-colors"
                        style={{ borderColor: '#1E2D45' }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveCustomer}
                        disabled={savingCustomer || !nc.name.trim()}
                        className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}
                      >
                        {savingCustomer && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Salvar
                      </button>
                    </div>
                  </div>
                )}

                {!showForm && !showCustomerDrop && (
                  <p className="text-center text-xs text-muted">Opcional — busque por nome, CPF ou WhatsApp</p>
                )}
              </>
            )}
          </div>

          {/* Order summary */}
          <div className="rounded-xl border p-5 space-y-3" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            <h3 className="text-sm font-semibold text-text">Resumo do Pedido</h3>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="text-text font-medium">{BRL(subtotal)}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Frete (R$)</span>
              <input
                value={shipping}
                onChange={e => setShipping(e.target.value)}
                placeholder="0,00"
                className="w-28 rounded-lg border px-2.5 py-1 text-sm text-right text-text outline-none focus:border-accent/60 transition-colors placeholder:text-muted"
                style={inputStyle}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Desconto (R$)</span>
              <input
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="0,00"
                className="w-28 rounded-lg border px-2.5 py-1 text-sm text-right text-text outline-none focus:border-accent/60 transition-colors placeholder:text-muted"
                style={inputStyle}
              />
            </div>

            <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: '#1E2D45' }}>
              <span className="text-sm font-bold text-text">TOTAL</span>
              <span className="text-xl font-bold text-green">{BRL(total)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="rounded-xl border p-5 space-y-3" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            <h3 className="text-sm font-semibold text-text">Forma de Pagamento</h3>

            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'cash',  label: 'Dinheiro', color: '#00FF94' },
                  { id: 'pix',   label: 'PIX',      color: '#00E5FF' },
                  { id: 'card',  label: 'Cartão',   color: '#FFB800' },
                  { id: 'mixed', label: 'Misto',    color: '#FF5C5C' },
                ] as { id: PaymentMethod; label: string; color: string }[]
              ).map(({ id, label, color }) => {
                const active = method === id
                return (
                  <button
                    key={id}
                    onClick={() => setMethod(id)}
                    className="rounded-lg border py-2 text-xs font-medium transition-all"
                    style={active
                      ? { background: `${color}18`, borderColor: color, color }
                      : { borderColor: '#1E2D45', color: '#64748B' }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Mixed breakdown */}
            {method === 'mixed' && (
              <div className="space-y-2 border-t pt-3" style={{ borderColor: '#1E2D45' }}>
                {(
                  [
                    { label: 'Dinheiro', value: mxCash, set: setMxCash, color: '#00FF94' },
                    { label: 'PIX',      value: mxPix,  set: setMxPix,  color: '#00E5FF' },
                    { label: 'Cartão',   value: mxCard, set: setMxCard, color: '#FFB800' },
                  ]
                ).map(({ label, value, set, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-14 text-xs font-medium shrink-0" style={{ color }}>{label}</span>
                    <input
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder="0,00"
                      className="flex-1 rounded-lg border px-2.5 py-1.5 text-sm text-right text-text outline-none focus:border-accent/60 transition-colors placeholder:text-muted"
                      style={inputStyle}
                    />
                  </div>
                ))}

                {/* Remaining indicator */}
                {(() => {
                  const filled    = parseCents(mxCash) + parseCents(mxPix) + parseCents(mxCard)
                  const remaining = total - filled
                  return (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted">Restante</span>
                      <span style={{ color: remaining === 0 ? '#00FF94' : '#FF5C5C' }}>
                        {remaining === 0 ? '✓ OK' : BRL(Math.abs(remaining))}
                      </span>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {/* Finalize */}
          <button
            onClick={handleFinalize}
            disabled={finalizing || cart.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}
          >
            {finalizing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Finalizando...</>
              : <><CheckCircle className="h-4 w-4" /> Finalizar Venda</>
            }
          </button>
        </div>
      </div>

      {/* ── Manual item modal ── */}
      {showManual && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowManual(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Adicionar Item ou Serviço</h3>
              <button onClick={() => setShowManual(false)} className="text-muted hover:text-coral transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              value={mName}
              onChange={e => setMName(e.target.value)}
              placeholder="Ex: Troca de tela, Película 3D, Conserto de conector..."
              className={inputCls}
              style={inputStyle}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && addManual()}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs text-muted">Preço Unit. (R$)</p>
                <input
                  value={mPrice}
                  onChange={e => setMPrice(e.target.value)}
                  placeholder="0,00"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted">Quantidade</p>
                <input
                  type="number"
                  min="1"
                  value={mQty}
                  onChange={e => setMQty(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
            </div>

            {mName && mPrice && (
              <p className="text-xs text-center text-muted">
                Subtotal: <span className="font-semibold text-green">{BRL(parseCents(mPrice) * (parseInt(mQty) || 1))}</span>
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowManual(false)}
                className="flex-1 rounded-lg border py-2.5 text-sm font-medium text-muted hover:bg-card transition-colors"
                style={{ borderColor: '#1E2D45' }}
              >
                Cancelar
              </button>
              <button
                onClick={addManual}
                disabled={!mName.trim() || !mPrice}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)', color: '#080C14' }}
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
