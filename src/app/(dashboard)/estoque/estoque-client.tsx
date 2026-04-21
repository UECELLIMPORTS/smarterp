'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import {
  Package, Plus, Search, Pencil, Trash2, X, Upload, Loader2,
  ChevronDown, AlertTriangle, ToggleLeft, ToggleRight,
  ClipboardList, FileUp, CheckCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  createProduct, updateProduct, deleteProduct, toggleProductActive,
  adjustStock, importProducts, removeDuplicateProducts,
  type ProductRow, type ProductInput,
} from '@/actions/products'
import { LancamentosModal } from '@/components/estoque/lancamentos-modal'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const parseBRL = (v: string): number => {
  const digits = v.replace(/\D/g, '')
  return parseInt(digits || '0', 10)
}

const fmtBRL = (cents: number): string =>
  (cents / 100).toFixed(2).replace('.', ',')

const UNITS = ['Un', 'Cx', 'Kg', 'g', 'L', 'ml', 'Par', 'Pç', 'Rolo', 'M']

const EMPTY_FORM: ProductInput = {
  code: '', name: '', brand: '', purchasePriceCents: 0, costCents: 0,
  priceCents: 0, unit: 'Un', stockQty: 0, supplier: '', imageUrls: [],
  description: '', active: true,
}

// ── Input style ───────────────────────────────────────────────────────────────

const INP = 'w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent'
const INP_STYLE = { borderColor: '#1E2D45' }

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  initialProducts: ProductRow[]
  brands: string[]
}

// ── Main component ────────────────────────────────────────────────────────────

export function EstoqueClient({ initialProducts, brands: initialBrands }: Props) {
  const [products, setProducts] = useState<ProductRow[]>(initialProducts)
  const [brands, setBrands]     = useState<string[]>(initialBrands)
  const [search, setSearch]     = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<ProductRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null)

  // Balanço
  const [balanceTarget, setBalanceTarget]       = useState<ProductRow | null>(null)
  const [lancamentosTarget, setLancamentosTarget] = useState<ProductRow | null>(null)
  const [balanceQty, setBalanceQty]       = useState('')
  const [balancing, startBalance]         = useTransition()

  // Importação CSV
  const [importOpen, setImportOpen]         = useState(false)
  const [importRows, setImportRows]         = useState<ProductInput[]>([])
  const [importParsed, setImportParsed]     = useState(false)
  const [importing, startImport]            = useTransition()
  const [importResult, setImportResult]     = useState<{ created: number; updated: number; errors: number } | null>(null)
  const importFileRef                       = useRef<HTMLInputElement>(null)

  const [form, setForm]   = useState<ProductInput>(EMPTY_FORM)
  const [saving, startSave]   = useTransition()
  const [deleting, startDel]  = useTransition()
  const [toggling, startToggle]       = useTransition()
  const [deduping, startDedup]        = useTransition()
  const [dedupResult, setDedupResult] = useState<number | null>(null)
  const [error, setError]   = useState('')
  const [brandInput, setBrandInput] = useState('')
  const [showBrandList, setShowBrandList] = useState(false)
  const brandRef = useRef<HTMLDivElement>(null)

  // Image upload
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !p.code?.toLowerCase().includes(q) && !p.brand?.toLowerCase().includes(q)) return false
      if (filterBrand && p.brand !== filterBrand) return false
      if (filterActive === 'active' && !p.active) return false
      if (filterActive === 'inactive' && p.active) return false
      return true
    })
  }, [products, search, filterBrand, filterActive])

  // ── Open modal ─────────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setBrandInput('')
    setError('')
    setModalOpen(true)
  }

  function openEdit(p: ProductRow) {
    setEditing(p)
    setForm({
      code:                 p.code ?? '',
      name:                 p.name,
      brand:                p.brand ?? '',
      purchasePriceCents:   p.purchase_price_cents,
      costCents:            p.cost_cents,
      priceCents:           p.price_cents,
      unit:                 p.unit,
      stockQty:             p.stock_qty,
      supplier:             p.supplier ?? '',
      imageUrls:            p.image_urls ?? [],
      description:          p.description ?? '',
      active:               p.active,
    })
    setBrandInput(p.brand ?? '')
    setError('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setError('')
  }

  // ── Balanço ────────────────────────────────────────────────────────────────

  function openBalance(p: ProductRow) {
    setBalanceTarget(p)
    setBalanceQty(String(p.stock_qty))
    setError('')
  }

  function handleBalance() {
    if (!balanceTarget) return
    const qty = parseInt(balanceQty) || 0
    startBalance(async () => {
      try {
        await adjustStock(balanceTarget.id, qty)
        setProducts(ps => ps.map(p => p.id === balanceTarget.id ? { ...p, stock_qty: qty } : p))
        setBalanceTarget(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao ajustar estoque.')
      }
    })
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────

  function normHeader(h: string): string {
    return h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  }

  function parseCsvPrice(v: string): number {
    if (!v) return 0
    const clean = v.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
    return Math.round((parseFloat(clean) || 0) * 100)
  }

  // Handles Brazilian integer format: "1.500,00" → 1500, "10,000" → 10
  function parseCsvInt(v: string): number {
    if (!v) return 0
    const clean = v.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    return Math.round(parseFloat(clean) || 0)
  }

  function parseCSVText(text: string): ProductInput[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []

    const sep = lines[0].includes(';') ? ';' : ','
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim())
    const normHeaders = headers.map(normHeader)

    // exclude permite que iPrecoV não roube o índice já ocupado por iPrecoCu
    const col = (keys: string[], exclude = -1) => {
      for (const k of keys) {
        const idx = normHeaders.findIndex((h, i) => i !== exclude && h.includes(k))
        if (idx >= 0) return idx
      }
      return -1
    }

    // "ID" do Bling (coluna exata "id") — usado como fallback de código quando SKU está vazio
    const iBlingId  = normHeaders.findIndex(h => h === 'id')
    const iCod      = col(['codigo', 'sku', 'cod'])
    const iNome     = col(['nome', 'descricao', 'descri', 'produto'])
    const iMarca    = col(['marca'])
    // iPrecoCu / iPrecoCompra detectados antes de iPrecoV para não confundir com o fallback 'preco'
    const iPrecoCu      = col(['preco de custo', 'preco custo', 'custo'])
    const iPrecoCompra  = col(['preco de compra', 'preco compra', 'valor de compra'], iPrecoCu)
    const iPrecoV       = col(['preco de venda', 'preco venda', 'valor de venda', 'valor venda', 'preco', 'valor'], iPrecoCu)
    const iEstoque  = col(['saldo em estoque', 'saldo fisico', 'saldo', 'estoque fisico', 'estoque', 'quantidade', 'qtd'])
    const iUnidade  = col(['unidade de medida', 'unidade', 'un'])
    const iFornec   = col(['fornecedor'])
    const iSituacao = col(['situacao', 'ativo', 'status'])

    const parseCell = (row: string[], idx: number) =>
      idx >= 0 ? (row[idx] ?? '').replace(/^"|"$/g, '').trim() : ''

    return lines.slice(1).filter(l => l.trim()).map(line => {
      const cells = line.split(sep)
      const situacao  = parseCell(cells, iSituacao).toLowerCase()
      // Código do produto: SKU do Bling ou, se vazio, o ID interno do Bling
      const sku = parseCell(cells, iCod)
      const code = sku || parseCell(cells, iBlingId)
      return {
        code,
        name:               parseCell(cells, iNome),
        brand:              parseCell(cells, iMarca),
        purchasePriceCents: parseCsvPrice(parseCell(cells, iPrecoCompra !== -1 ? iPrecoCompra : iPrecoCu)),
        costCents:          parseCsvPrice(parseCell(cells, iPrecoCu)),
        priceCents:         parseCsvPrice(parseCell(cells, iPrecoV)),
        unit:               parseCell(cells, iUnidade) || 'Un',
        stockQty:           parseCsvInt(parseCell(cells, iEstoque)),
        supplier:           parseCell(cells, iFornec),
        imageUrls:          [],
        description:        '',
        active:             !situacao || situacao === 'ativo' || situacao === 'a' || situacao === '1',
      }
    }).filter(r => r.name)
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)
    if (importFileRef.current) importFileRef.current.value = ''

    const applyRows = (rows: ProductInput[]) => {
      setImportRows(rows)
      setImportParsed(true)
    }

    const readWith = (encoding: string, fallback?: () => void) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        const rows = parseCSVText(text)
        // Se leu como UTF-8 e todos os preços vieram zerados, tenta ISO-8859-1 (encoding padrão do Bling)
        if (encoding === 'UTF-8' && fallback && rows.length > 0 && rows.every(r => r.priceCents === 0)) {
          fallback()
          return
        }
        applyRows(rows)
      }
      reader.readAsText(file, encoding)
    }

    readWith('UTF-8', () => readWith('ISO-8859-1'))
  }

  function handleImport() {
    startImport(async () => {
      try {
        const result = await importProducts(importRows)
        setImportResult(result)
        if (result.created > 0) {
          // Reload products list
          window.location.reload()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao importar produtos.')
      }
    })
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  function handleSave() {
    setError('')
    startSave(async () => {
      try {
        if (editing) {
          const updated = await updateProduct(editing.id, form)
          setProducts(ps => ps.map(p => p.id === updated.id ? updated : p))
        } else {
          const created = await createProduct(form)
          setProducts(ps => [created, ...ps])
          if (form.brand && !brands.includes(form.brand)) {
            setBrands(bs => [...bs, form.brand].sort())
          }
        }
        closeModal()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao salvar produto.')
      }
    })
  }

  // ── Remover duplicatas ─────────────────────────────────────────────────────

  function handleRemoveDuplicates() {
    startDedup(async () => {
      try {
        const { removed } = await removeDuplicateProducts()
        setDedupResult(removed)
        if (removed > 0) window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao remover duplicatas.')
      }
    })
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  function handleDelete() {
    if (!deleteTarget) return
    startDel(async () => {
      try {
        await deleteProduct(deleteTarget.id)
        setProducts(ps => ps.filter(p => p.id !== deleteTarget.id))
        setDeleteTarget(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao excluir.')
      }
    })
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  function handleToggle(p: ProductRow) {
    startToggle(async () => {
      try {
        await toggleProductActive(p.id, !p.active)
        setProducts(ps => ps.map(x => x.id === p.id ? { ...x, active: !p.active } : x))
      } catch { /* silencioso */ }
    })
  }

  // ── Image upload (Supabase Storage) ───────────────────────────────────────

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if ((form.imageUrls.length + files.length) > 4) {
      setError('Máximo de 4 imagens por produto.')
      return
    }
    setUploading(true)
    const supabase = createClient()
    const urls: string[] = []
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: false })
      if (upErr) { setError('Erro ao fazer upload de imagem.'); setUploading(false); return }
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
      urls.push(publicUrl)
    }
    setForm(f => ({ ...f, imageUrls: [...f.imageUrls, ...urls] }))
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeImage(url: string) {
    setForm(f => ({ ...f, imageUrls: f.imageUrls.filter(u => u !== url) }))
  }

  // ── Price input helper ─────────────────────────────────────────────────────

  function PriceInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">R$</span>
          <input
            type="text"
            inputMode="numeric"
            value={fmtBRL(value)}
            onChange={e => onChange(parseBRL(e.target.value))}
            className={INP}
            style={{ ...INP_STYLE, paddingLeft: '2.25rem' }}
          />
        </div>
      </div>
    )
  }

  // ── Brand dropdown ─────────────────────────────────────────────────────────

  const brandSuggestions = brandInput
    ? brands.filter(b => b.toLowerCase().includes(brandInput.toLowerCase()))
    : brands

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Estoque</h1>
          <p className="mt-1 text-sm text-muted">Cadastro e controle de produtos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRemoveDuplicates}
            disabled={deduping}
            title="Remove produtos duplicados, mantendo o mais antigo de cada código/nome"
            className="flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted hover:text-red-400 transition-colors disabled:opacity-50"
            style={{ borderColor: '#1E2D45' }}
          >
            {deduping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deduping ? 'Limpando…' : dedupResult !== null ? `${dedupResult} removidos` : 'Limpar duplicatas'}
          </button>
          <button
            onClick={() => { setImportOpen(true); setImportParsed(false); setImportRows([]); setImportResult(null) }}
            className="flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted hover:text-text transition-colors"
            style={{ borderColor: '#1E2D45' }}
          >
            <FileUp className="h-4 w-4" />
            Importar CSV
          </button>
          <button
            onClick={openNew}
            className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-black"
            style={{ background: '#00FF94' }}
          >
            <Plus className="h-4 w-4" />
            Novo Produto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, SKU ou marca…"
            className={INP}
            style={{ ...INP_STYLE, paddingLeft: '2.25rem' }}
          />
        </div>

        <select
          value={filterBrand}
          onChange={e => setFilterBrand(e.target.value)}
          className="rounded-lg border bg-transparent px-3 py-2 text-sm text-text"
          style={{ borderColor: '#1E2D45', minWidth: '160px' }}
        >
          <option value="">Todas as marcas</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <select
          value={filterActive}
          onChange={e => setFilterActive(e.target.value as typeof filterActive)}
          className="rounded-lg border bg-transparent px-3 py-2 text-sm text-text"
          style={{ borderColor: '#1E2D45' }}
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-sm font-semibold text-text">Produtos</h2>
          <span className="text-xs text-muted">{filtered.length} {filtered.length === 1 ? 'produto' : 'produtos'}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Package className="h-10 w-10" style={{ color: '#1E2D45' }} />
            <p className="text-sm text-muted">Nenhum produto encontrado</p>
          </div>
        ) : (
          <>
            <div
              className="grid gap-4 px-5 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
              style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 100px 120px 110px 110px 80px 90px 100px' }}
            >
              <span>Nome</span>
              <span>SKU</span>
              <span>Marca</span>
              <span className="text-right">Pr. Custo</span>
              <span className="text-right">Pr. Venda</span>
              <span className="text-right">Estoque</span>
              <span className="text-center">Situação</span>
              <span className="text-right">Ações</span>
            </div>

            {filtered.map(p => (
              <div
                key={p.id}
                className="grid gap-4 px-5 py-3.5 border-b items-center last:border-0 hover:bg-white/[0.02] transition-colors"
                style={{ borderColor: '#1E2D45', gridTemplateColumns: '1fr 100px 120px 110px 110px 80px 90px 100px' }}
              >
                {/* Name + image */}
                <div className="flex items-center gap-3 min-w-0">
                  {p.image_urls?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_urls[0]} alt={p.name} className="h-9 w-9 rounded-lg object-cover shrink-0" style={{ border: '1px solid #1E2D45' }} />
                  ) : (
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#1E2D45' }}>
                      <Package className="h-4 w-4 text-muted" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{p.name}</p>
                    {p.supplier && <p className="text-xs text-muted truncate">{p.supplier}</p>}
                  </div>
                </div>

                <p className="text-xs text-muted font-mono">{p.code || '—'}</p>
                <p className="text-xs text-muted truncate">{p.brand || '—'}</p>
                <p className="text-sm text-right text-muted">{BRL(p.cost_cents)}</p>
                <p className="text-sm font-semibold text-right" style={{ color: '#00FF94' }}>{BRL(p.price_cents)}</p>

                {/* Stock */}
                <p className={`text-sm font-bold text-right ${p.stock_qty <= 0 ? 'text-red-400' : p.stock_qty <= 5 ? 'text-yellow-400' : 'text-text'}`}>
                  {p.stock_qty} {p.unit}
                </p>

                {/* Toggle active */}
                <div className="flex justify-center">
                  <button onClick={() => handleToggle(p)} disabled={toggling} title={p.active ? 'Ativo — clique para inativar' : 'Inativo — clique para ativar'}>
                    {p.active
                      ? <ToggleRight className="h-6 w-6" style={{ color: '#00FF94' }} />
                      : <ToggleLeft className="h-6 w-6 text-muted" />
                    }
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setLancamentosTarget(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                    title="Lançamentos de estoque"
                  >
                    <ClipboardList className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-white hover:bg-white/10 transition-colors"
                    title="Editar produto"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    title="Excluir produto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Modal Produto ─────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="relative w-full max-w-2xl rounded-2xl border my-8" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
              <h2 className="text-base font-semibold text-text">
                {editing ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button onClick={closeModal} className="text-muted hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="space-y-5 px-6 py-5">

              {error && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: '#FF5C5C18', color: '#FF5C5C', border: '1px solid #FF5C5C40' }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Row 1: Nome + SKU */}
              <div className="grid grid-cols-[1fr_180px] gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Nome do Produto *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Tela iPhone 13 Original"
                    className={INP}
                    style={INP_STYLE}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Código / SKU</label>
                  <input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    placeholder="Ex: TELA-IP13"
                    className={INP}
                    style={INP_STYLE}
                  />
                </div>
              </div>

              {/* Row 2: Marca + Unidade */}
              <div className="grid grid-cols-[1fr_140px] gap-3">
                {/* Marca com autocomplete */}
                <div ref={brandRef}>
                  <label className="mb-1 block text-xs font-medium text-muted">Marca</label>
                  <div className="relative">
                    <input
                      value={brandInput}
                      onChange={e => {
                        setBrandInput(e.target.value)
                        setForm(f => ({ ...f, brand: e.target.value }))
                        setShowBrandList(true)
                      }}
                      onFocus={() => setShowBrandList(true)}
                      onBlur={() => setTimeout(() => setShowBrandList(false), 150)}
                      placeholder="Ex: Apple, Samsung…"
                      className={INP}
                      style={INP_STYLE}
                    />
                    {showBrandList && brandSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border shadow-xl overflow-hidden" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
                        {brandSuggestions.map(b => (
                          <button
                            key={b}
                            type="button"
                            onMouseDown={() => { setBrandInput(b); setForm(f => ({ ...f, brand: b })); setShowBrandList(false) }}
                            className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-white/5"
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Unidade */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Unidade</label>
                  <div className="relative">
                    <select
                      value={form.unit}
                      onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                      className={INP}
                      style={{ ...INP_STYLE, appearance: 'none', paddingRight: '2rem', cursor: 'pointer' }}
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  </div>
                </div>
              </div>

              {/* Row 3: Preços */}
              <div className="grid grid-cols-3 gap-3">
                <PriceInput
                  label="Preço de Compra (fornecedor)"
                  value={form.purchasePriceCents}
                  onChange={v => setForm(f => ({ ...f, purchasePriceCents: v }))}
                />
                <PriceInput
                  label="Preço de Custo (operacional)"
                  value={form.costCents}
                  onChange={v => setForm(f => ({ ...f, costCents: v }))}
                />
                <PriceInput
                  label="Preço de Venda *"
                  value={form.priceCents}
                  onChange={v => setForm(f => ({ ...f, priceCents: v }))}
                />
              </div>

              {/* Margem indicativa */}
              {form.costCents > 0 && form.priceCents > 0 && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#00FF9410', border: '1px solid #00FF9430', color: '#00FF94' }}>
                  Margem: {(((form.priceCents - form.costCents) / form.priceCents) * 100).toFixed(1)}% &nbsp;·&nbsp;
                  Lucro bruto: {BRL(form.priceCents - form.costCents)}
                </div>
              )}

              {/* Row 4: Estoque + Fornecedor */}
              <div className="grid grid-cols-[160px_1fr] gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Qtd. em Estoque</label>
                  <input
                    type="number"
                    min={0}
                    value={form.stockQty}
                    onChange={e => setForm(f => ({ ...f, stockQty: parseInt(e.target.value) || 0 }))}
                    className={INP}
                    style={INP_STYLE}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Fornecedor</label>
                  <input
                    value={form.supplier}
                    onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                    placeholder="Ex: Distribuidora ABC"
                    className={INP}
                    style={INP_STYLE}
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Descrição / Observações</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Informações adicionais sobre o produto…"
                  className={INP}
                  style={{ ...INP_STYLE, resize: 'vertical' }}
                />
              </div>

              {/* Imagens */}
              <div>
                <label className="mb-2 block text-xs font-medium text-muted">Imagens do produto (máx. 4)</label>
                <div className="flex flex-wrap gap-3">
                  {form.imageUrls.map((url, i) => (
                    <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden" style={{ border: '1px solid #1E2D45' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(url)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-white"
                        style={{ background: 'rgba(0,0,0,0.7)' }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {form.imageUrls.length < 4 && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed transition-colors hover:border-accent"
                      style={{ borderColor: '#1E2D45', color: '#64748B' }}
                    >
                      {uploading
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <Upload className="h-5 w-5" />
                      }
                      <span className="text-xs">{uploading ? 'Enviando…' : 'Upload'}</span>
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>

              {/* Situação */}
              <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: '#1E2D45' }}>
                <div>
                  <p className="text-sm font-medium text-text">Situação</p>
                  <p className="text-xs text-muted">Produtos inativos não aparecem no Frente de Caixa</p>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, active: !f.active }))}>
                  {form.active
                    ? <ToggleRight className="h-8 w-8" style={{ color: '#00FF94' }} />
                    : <ToggleLeft className="h-8 w-8 text-muted" />
                  }
                </button>
              </div>

            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 border-t px-6 py-4" style={{ borderColor: '#1E2D45' }}>
              <button onClick={closeModal} className="rounded-lg border px-4 py-2 text-sm text-muted hover:text-text transition-colors" style={{ borderColor: '#1E2D45' }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
                style={{ background: '#00FF94' }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Salvando…' : editing ? 'Salvar Alterações' : 'Cadastrar Produto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Balanço ────────────────────────────────────────────────────── */}
      {balanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: '#FFB80018' }}>
                <ClipboardList className="h-5 w-5" style={{ color: '#FFB800' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">Ajuste de Estoque</h3>
                <p className="text-xs text-muted truncate">{balanceTarget.name}</p>
              </div>
            </div>

            <div className="rounded-lg border px-4 py-3 flex items-center justify-between" style={{ borderColor: '#1E2D45' }}>
              <span className="text-xs text-muted">Estoque atual</span>
              <span className="text-sm font-bold text-text">{balanceTarget.stock_qty} {balanceTarget.unit}</span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nova quantidade</label>
              <input
                type="number"
                min={0}
                value={balanceQty}
                onChange={e => setBalanceQty(e.target.value)}
                className="w-full rounded-lg border bg-transparent px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
                style={{ borderColor: '#1E2D45' }}
                autoFocus
              />
              {balanceQty !== '' && parseInt(balanceQty) !== balanceTarget.stock_qty && (
                <p className="mt-1 text-xs" style={{ color: parseInt(balanceQty) > balanceTarget.stock_qty ? '#00FF94' : '#FF5C5C' }}>
                  {parseInt(balanceQty) > balanceTarget.stock_qty
                    ? `+${parseInt(balanceQty) - balanceTarget.stock_qty} unidades`
                    : `${parseInt(balanceQty) - balanceTarget.stock_qty} unidades`}
                </p>
              )}
            </div>

            {error && <p className="text-xs" style={{ color: '#FF5C5C' }}>{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setBalanceTarget(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted hover:text-text" style={{ borderColor: '#1E2D45' }}>
                Cancelar
              </button>
              <button
                onClick={handleBalance}
                disabled={balancing || balanceQty === ''}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-black disabled:opacity-50"
                style={{ background: '#FFB800' }}
              >
                {balancing && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Importação CSV ──────────────────────────────────────────────── */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="relative w-full max-w-2xl rounded-2xl border my-8" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
              <h2 className="text-base font-semibold text-text">Importar Produtos (CSV)</h2>
              <button onClick={() => setImportOpen(false)} className="text-muted hover:text-text"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {!importParsed ? (
                <>
                  <div className="rounded-lg border p-4 space-y-2" style={{ background: '#111827', borderColor: '#1E2D45' }}>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">Formato esperado (CSV ou exportação do Bling)</p>
                    <p className="text-xs text-muted">Colunas reconhecidas automaticamente:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Código', 'Nome', 'Marca', 'Preço de Venda', 'Preço de Custo', 'Estoque', 'Unidade', 'Fornecedor', 'Situação'].map(c => (
                        <span key={c} className="rounded px-2 py-0.5 text-xs" style={{ background: '#00FF9410', color: '#00FF94', border: '1px solid #00FF9430' }}>{c}</span>
                      ))}
                    </div>
                    <p className="text-xs text-muted pt-1">Separador detectado automaticamente (vírgula ou ponto-e-vírgula). Encoding: UTF-8.</p>
                  </div>

                  <button
                    onClick={() => importFileRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors hover:border-accent"
                    style={{ borderColor: '#1E2D45' }}
                  >
                    <FileUp className="h-8 w-8 text-muted" />
                    <p className="text-sm font-medium text-text">Clique para selecionar o arquivo CSV</p>
                    <p className="text-xs text-muted">Exportação do Bling ou qualquer CSV com cabeçalho</p>
                  </button>
                  <input ref={importFileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile} />
                </>
              ) : importResult ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <CheckCircle className="h-12 w-12" style={{ color: '#00FF94' }} />
                  <div className="text-center space-y-1">
                    {importResult.created > 0 && (
                      <p className="text-lg font-bold text-text">{importResult.created} produto{importResult.created !== 1 ? 's' : ''} criado{importResult.created !== 1 ? 's' : ''}</p>
                    )}
                    {importResult.updated > 0 && (
                      <p className="text-base font-semibold" style={{ color: '#00FF94' }}>{importResult.updated} produto{importResult.updated !== 1 ? 's' : ''} atualizado{importResult.updated !== 1 ? 's' : ''}</p>
                    )}
                    {importResult.errors > 0 && (
                      <p className="text-sm text-muted">{importResult.errors} linha{importResult.errors !== 1 ? 's' : ''} ignorada{importResult.errors !== 1 ? 's' : ''} (sem nome)</p>
                    )}
                  </div>
                  <button onClick={() => setImportOpen(false)} className="rounded-lg px-6 py-2 text-sm font-semibold text-black" style={{ background: '#00FF94' }}>
                    Fechar
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#1E2D45' }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1E2D45', background: '#111827' }}>
                      <p className="text-sm font-medium text-text">{importRows.length} produtos encontrados</p>
                      <button onClick={() => { setImportParsed(false); setImportRows([]) }} className="text-xs text-muted hover:text-text">Trocar arquivo</button>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-[#1E2D45]">
                      {importRows.slice(0, 50).map((r, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="text-text truncate font-medium">{r.name}</p>
                            <p className="text-xs text-muted">{r.code && `SKU: ${r.code} · `}{r.brand && `${r.brand} · `}Estoque: {r.stockQty}</p>
                          </div>
                          <p className="text-xs font-semibold ml-3 shrink-0" style={{ color: '#00FF94' }}>
                            {r.priceCents > 0 ? `R$ ${(r.priceCents / 100).toFixed(2).replace('.', ',')}` : '—'}
                          </p>
                        </div>
                      ))}
                      {importRows.length > 50 && (
                        <p className="px-4 py-2 text-xs text-muted">… e mais {importRows.length - 50} produtos</p>
                      )}
                    </div>
                  </div>

                  {error && <p className="text-xs" style={{ color: '#FF5C5C' }}>{error}</p>}

                  <div className="flex gap-3">
                    <button onClick={() => setImportOpen(false)} className="flex-1 rounded-lg border py-2.5 text-sm text-muted hover:text-text" style={{ borderColor: '#1E2D45' }}>
                      Cancelar
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importing}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-black"
                      style={{ background: '#00FF94' }}
                    >
                      {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                      {importing ? `Importando…` : `Importar ${importRows.length} produtos`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmação Delete ──────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#FF5C5C18' }}>
              <Trash2 className="h-6 w-6" style={{ color: '#FF5C5C' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Excluir produto?</h3>
              <p className="mt-1 text-sm text-muted">
                <span className="font-medium text-text">{deleteTarget.name}</span> será removido permanentemente. Esta ação não pode ser desfeita.
              </p>
            </div>
            {error && <p className="text-xs" style={{ color: '#FF5C5C' }}>{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted hover:text-text" style={{ borderColor: '#1E2D45' }}>
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white"
                style={{ background: '#FF5C5C' }}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Lançamentos ─────────────────────────────────────────────────── */}
      {lancamentosTarget && (
        <LancamentosModal
          product={lancamentosTarget}
          onClose={() => setLancamentosTarget(null)}
          onStockChanged={(productId, newQty, newCostCents, newPurchaseCents) => {
            setProducts(ps => ps.map(p =>
              p.id === productId
                ? { ...p, stock_qty: newQty, cost_cents: newCostCents, purchase_price_cents: newPurchaseCents }
                : p
            ))
            setLancamentosTarget(prev => prev?.id === productId
              ? { ...prev, stock_qty: newQty, cost_cents: newCostCents, purchase_price_cents: newPurchaseCents }
              : prev
            )
          }}
        />
      )}
    </div>
  )
}
