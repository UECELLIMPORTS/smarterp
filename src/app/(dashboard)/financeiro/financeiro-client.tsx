'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import {
  Receipt, TrendingUp, ShoppingCart, CreditCard, Wrench,
  XCircle, RefreshCw, Plus, Loader2, X, AlertTriangle, Search,
  Trash2, UserPlus, Calendar, CalendarDays, MoreVertical, Filter, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelSale, reactivateSale,
  cancelServiceOrder, reactivateServiceOrder,
  createManualSale, updateSaleDate, deleteSale,
  updateServiceOrderPayment, bulkCancel, bulkDeleteSales, bulkDeleteServiceOrders,
  updateCancelledSale,
  type ManualSaleItem,
  type EditSaleInput,
} from '@/actions/financeiro'
import {
  searchCustomers, searchProducts, createCustomer,
  type Customer, type Product,
} from '@/actions/pos'
import { AddressCityState } from '@/components/ui/address-fields'

// ── Types ─────────────────────────────────────────────────────────────────────

type PeriodKey = 'all' | 'today' | 'week' | 'month' | 'custom'

export type FinanceiroRow = {
  id: string; rawId: string; source: 'erp' | 'checksmart'
  date: Date; dateStr: string; customerName: string; description: string
  payment: string | null; osStatus: string | null; cancelled: boolean
  discount: number; total: number
  clienteType: 'novo' | 'recorrente' | null
  // ERP-only (for edit modal)
  customerId?: string | null
  saleItems?: { name: string; quantity: number; unitPriceCents: number }[]
}

type CartItem = {
  key: string; productId: string | null; source?: 'products' | 'parts_catalog'
  name: string; quantity: number; unitPriceCents: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BRL = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const parseCents = (v: string) => {
  const n = parseFloat(v.replace(/[^\d,]/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

const fmtBRL = (c: number) => (c / 100).toFixed(2).replace('.', ',')

const fmtCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}
const fmtPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}
const fmtCep = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0,5)}-${d.slice(5)}`
}
const randKey = () => Math.random().toString(36).slice(2)

function getDateRange(period: PeriodKey, from: string, to: string): [Date, Date] | null {
  const now = new Date()
  if (period === 'today') {
    return [
      new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59),
    ]
  }
  if (period === 'week') {
    const day = now.getDay()
    return [
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - day),
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day), 23, 59, 59),
    ]
  }
  if (period === 'month') {
    return [
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    ]
  }
  if (period === 'custom' && from && to) {
    return [new Date(from + 'T00:00:00'), new Date(to + 'T23:59:59')]
  }
  return null
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', card: 'Cartão', mixed: 'Misto',
  credit_card: 'Crédito', debit_card: 'Débito', transfer: 'Transferência', pending: 'Pendente',
}
const METHOD_COLOR: Record<string, string> = {
  cash: '#00FF94', pix: '#00E5FF', card: '#FFB800', mixed: '#FF5C5C',
  credit_card: '#FFB800', debit_card: '#FFB800', transfer: '#00E5FF', pending: '#FF5C5C',
}
const OS_STATUS_LABEL: Record<string, string> = {
  open: 'Aberta', in_progress: 'Em andamento', ready: 'Pronta',
  delivered: 'Entregue', cancelled: 'Cancelada', received: 'Recebida',
}

const INP = 'w-full rounded-lg border bg-transparent px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent'
const INP_S: React.CSSProperties = { borderColor: '#1E2D45' }

const EMPTY_NC = {
  name: '', tradeName: '', personType: 'fisica',
  cpf: '', ieRg: '', isActive: true,
  whatsapp: '', phone: '', email: '', nfeEmail: '', website: '',
  birthDate: '', gender: '', maritalStatus: '', profession: '',
  fatherName: '', fatherCpf: '', motherName: '', motherCpf: '',
  salesperson: '', contactType: '', creditLimitStr: '',
  notes: '',
  cep: '', addressStreet: '', addressDistrict: '',
  addressNumber: '', addressComplement: '', addressCity: '', addressState: '',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FinanceiroClient({ initialRows }: { initialRows: FinanceiroRow[] }) {
  const [rows, setRows]           = useState<FinanceiroRow[]>(initialRows)
  const [actioning, startAction]  = useTransition()

  // Modais de cancelar / reativar
  const [confirmCancel, setConfirmCancel]         = useState<FinanceiroRow | null>(null)
  const [confirmReactivate, setConfirmReactivate] = useState<FinanceiroRow | null>(null)

  // Filtros
  const [period, setPeriod]             = useState<PeriodKey>('all')
  const [fromDate, setFromDate]         = useState('')
  const [toDate, setToDate]             = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')

  // Modal editar venda cancelada (ERP) — formulário completo
  const [esRow, setEsRow]                     = useState<FinanceiroRow | null>(null)
  const [esDate, setEsDate]                   = useState('')
  const [esDiscountStr, setEsDiscountStr]     = useState('')
  const [esPayMethod, setEsPayMethod]         = useState<string>('pix')
  const [esCart, setEsCart]                   = useState<CartItem[]>([])
  const [esCustomerId, setEsCustomerId]       = useState<string | null>(null)
  const [esCustomerName, setEsCustomerName]   = useState('')
  const [esCustQuery, setEsCustQuery]         = useState('')
  const [esCustResults, setEsCustResults]     = useState<Customer[]>([])
  const [esCustSearching, setEsCustSearching] = useState(false)
  const [esCustDrop, setEsCustDrop]           = useState(false)
  const [esPQuery, setEsPQuery]               = useState('')
  const [esPResults, setEsPResults]           = useState<Product[]>([])
  const [esPSearching, setEsPSearching]       = useState(false)
  const [esPDrop, setEsPDrop]                 = useState(false)
  const [esShowManual, setEsShowManual]       = useState(false)
  const [esMName, setEsMName]                 = useState('')
  const [esMPrice, setEsMPrice]               = useState('')
  const [esMQty, setEsMQty]                   = useState('1')
  const [savingEs, startEsSave]               = useTransition()

  // Modal alterar data
  const [editDateRow, setEditDateRow]   = useState<FinanceiroRow | null>(null)
  const [editDateVal, setEditDateVal]   = useState('')
  const [savingDate, startSaveDate]     = useTransition()

  // Seleção em massa
  const [selected, setSelected]             = useState<Set<string>>(new Set())
  const [bulkCancelling, startBulkCancel]   = useTransition()
  const [bulkDeleting, startBulkDelete]     = useTransition()
  const [confirmBulkCancel, setConfirmBulkCancel] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const filteredRows = useMemo(() => {
    let result = rows
    const range = getDateRange(period, fromDate, toDate)
    if (range) {
      const [from, to] = range
      result = result.filter(r => r.date >= from && r.date <= to)
    }
    if (filterCustomer.trim()) {
      const q = filterCustomer.trim().toLowerCase()
      result = result.filter(r =>
        r.customerName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
      )
    }
    return result
  }, [rows, period, fromDate, toDate, filterCustomer])

  const selectedRows      = rows.filter(r => selected.has(r.id))
  const selectedErpIds    = selectedRows.filter(r => r.source === 'erp').map(r => r.rawId)
  const selectedOsIds     = selectedRows.filter(r => r.source === 'checksmart').map(r => r.rawId)
  const allSelected       = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.id))
  const someSelected      = selected.size > 0
  const canBulkDelete     = someSelected && selectedRows.every(r => r.cancelled)

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filteredRows.forEach(r => n.delete(r.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filteredRows.forEach(r => n.add(r.id)); return n })
    }
  }

  function doBulkCancel() {
    setConfirmBulkCancel(false)
    startBulkCancel(async () => {
      try {
        const erpIds = selectedRows.filter(r => r.source === 'erp' && !r.cancelled).map(r => r.rawId)
        const osIds  = selectedRows.filter(r => r.source === 'checksmart' && !r.cancelled).map(r => r.rawId)
        await bulkCancel(erpIds, osIds)
        setRows(rs => rs.map(r => selected.has(r.id) ? { ...r, cancelled: true } : r))
        toast.success(`${erpIds.length + osIds.length} transação(ões) cancelada(s).`)
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao cancelar.') }
    })
  }

  function doBulkDelete() {
    setConfirmBulkDelete(false)
    startBulkDelete(async () => {
      try {
        await Promise.all([
          bulkDeleteSales(selectedErpIds),
          bulkDeleteServiceOrders(selectedOsIds),
        ])
        setRows(rs => rs.filter(r => !selected.has(r.id)))
        setSelected(new Set())
        const total = selectedErpIds.length + selectedOsIds.length
        toast.success(`${total} registro(s) excluído(s).`)
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao excluir.') }
    })
  }

  // Menu 3 pontos
  const [openMenu, setOpenMenu]         = useState<string | null>(null)
  const menuRef                         = useRef<HTMLDivElement>(null)
  const esRef                           = useRef<HTMLDivElement>(null)

  // Modal excluir
  const [confirmDelete, setConfirmDelete] = useState<FinanceiroRow | null>(null)
  const [deleting, startDelete]           = useTransition()

  // Modal editar pagamento OS
  const [editPayRow, setEditPayRow]     = useState<FinanceiroRow | null>(null)
  const [editPayVal, setEditPayVal]     = useState('')
  const [savingPay, startSavePay]       = useTransition()

  // ── Nova Venda state ──────────────────────────────────────────────────────
  const [novaVendaOpen, setNovaVendaOpen] = useState(false)
  const [saleDate, setSaleDate]           = useState(new Date().toISOString().slice(0, 10))
  const [payMethod, setPayMethod]         = useState<'cash'|'pix'|'card'|'mixed'>('pix')
  const [discountStr, setDiscountStr]     = useState('')
  const [nvSaving, startNvSave]           = useTransition()
  const [nvError, setNvError]             = useState('')

  // Cart
  const [cart, setCart]     = useState<CartItem[]>([])
  const subtotal = cart.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0)
  const discount = parseCents(discountStr)
  const total    = Math.max(0, subtotal - discount)

  // Product search
  const [pQuery, setPQuery]       = useState('')
  const [pResults, setPResults]   = useState<Product[]>([])
  const [pSearching, setPSearching] = useState(false)
  const [pDrop, setPDrop]         = useState(false)
  const pRef = useRef<HTMLDivElement>(null)

  // Manual item
  const [showManual, setShowManual] = useState(false)
  const [mName, setMName]           = useState('')
  const [mPrice, setMPrice]         = useState('')
  const [mQty, setMQty]             = useState('1')

  // Customer
  const [customer, setCustomer]             = useState<Customer | null>(null)
  const [custQuery, setCustQuery]           = useState('')
  const [custResults, setCustResults]       = useState<Customer[]>([])
  const [custSearching, setCustSearching]   = useState(false)
  const [custDrop, setCustDrop]             = useState(false)
  const [showCustForm, setShowCustForm]     = useState(false)
  const [nc, setNc]                         = useState(EMPTY_NC)
  const [fetchingCep, setFetchingCep]       = useState(false)
  const [savingCust, setSavingCust]         = useState(false)

  // Product search debounce
  useEffect(() => {
    if (pQuery.trim().length < 2) { setPResults([]); setPDrop(false); return }
    const t = setTimeout(async () => {
      setPSearching(true)
      try { const r = await searchProducts(pQuery); setPResults(r); setPDrop(r.length > 0) }
      finally { setPSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [pQuery])

  // Close product dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (pRef.current && !pRef.current.contains(e.target as Node)) setPDrop(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Close row menu on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Edit modal — product search debounce
  useEffect(() => {
    if (esPQuery.trim().length < 2) { setEsPResults([]); setEsPDrop(false); return }
    const t = setTimeout(async () => {
      setEsPSearching(true)
      try { const r = await searchProducts(esPQuery); setEsPResults(r); setEsPDrop(r.length > 0) }
      finally { setEsPSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [esPQuery])

  // Edit modal — close product dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (esRef.current && !esRef.current.contains(e.target as Node)) setEsPDrop(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  function resetNovaVenda() {
    setCart([]); setPQuery(''); setDiscountStr(''); setSaleDate(new Date().toISOString().slice(0, 10))
    setPayMethod('pix'); setCustomer(null); setCustQuery(''); setShowCustForm(false)
    setNc(EMPTY_NC); setNvError(''); setShowManual(false)
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const activeRows    = useMemo(() => filteredRows.filter(r => !r.cancelled), [filteredRows])
  const totalFaturado = useMemo(() => activeRows.reduce((s, r) => s + r.total, 0), [activeRows])
  const totalVendas   = useMemo(() => activeRows.filter(r => r.source === 'erp').length, [activeRows])
  const totalOS       = useMemo(() => activeRows.filter(r => r.source === 'checksmart').length, [activeRows])
  const ticketMedio   = useMemo(() => activeRows.length > 0 ? Math.round(totalFaturado / activeRows.length) : 0, [activeRows, totalFaturado])
  const totalDesconto = useMemo(() => activeRows.reduce((s, r) => s + r.discount, 0), [activeRows])

  // ── Cancel / Reactivate ───────────────────────────────────────────────────
  function doCancel() {
    if (!confirmCancel) return
    const row = confirmCancel; setConfirmCancel(null)
    startAction(async () => {
      try {
        if (row.source === 'erp') await cancelSale(row.rawId)
        else await cancelServiceOrder(row.rawId)
        setRows(rs => rs.map(r => r.id === row.id ? { ...r, cancelled: true } : r))
        toast.success('Transação cancelada.')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao cancelar.') }
    })
  }

  function doReactivate() {
    if (!confirmReactivate) return
    const row = confirmReactivate; setConfirmReactivate(null)
    startAction(async () => {
      try {
        if (row.source === 'erp') await reactivateSale(row.rawId)
        else await reactivateServiceOrder(row.rawId)
        setRows(rs => rs.map(r => r.id === row.id ? { ...r, cancelled: false } : r))
        toast.success('Transação reativada.')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao reativar.') }
    })
  }

  // ── Edit OS payment ───────────────────────────────────────────────────────
  function doEditPay() {
    if (!editPayRow || !editPayVal) return
    const row = editPayRow; setEditPayRow(null)
    startSavePay(async () => {
      try {
        await updateServiceOrderPayment(row.rawId, editPayVal)
        setRows(rs => rs.map(r => r.id === row.id ? { ...r, payment: editPayVal } : r))
        toast.success('Pagamento atualizado.')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao atualizar pagamento.') }
    })
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function doDelete() {
    if (!confirmDelete) return
    const row = confirmDelete; setConfirmDelete(null)
    startDelete(async () => {
      try {
        await deleteSale(row.rawId)
        setRows(rs => rs.filter(r => r.id !== row.id))
        toast.success('Venda excluída.')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao excluir.') }
    })
  }

  // ── Edit date ─────────────────────────────────────────────────────────────
  function openEditDate(row: FinanceiroRow) {
    const iso = row.date.toISOString().slice(0, 10)
    setEditDateVal(iso)
    setEditDateRow(row)
  }

  function doEditDate() {
    if (!editDateRow || !editDateVal) return
    const row = editDateRow; setEditDateRow(null)
    startSaveDate(async () => {
      try {
        await updateSaleDate(row.rawId, editDateVal)
        const newDate = new Date(editDateVal + 'T12:00:00')
        const newDateStr = newDate.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
        setRows(rs => rs.map(r => r.id === row.id ? { ...r, date: newDate, dateStr: newDateStr, cancelled: false } : r))
        toast.success('Data da venda atualizada.')
        window.location.reload()
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao alterar data.') }
    })
  }

  // ── Edit cancelled ERP sale ───────────────────────────────────────────────
  function openEditSale(row: FinanceiroRow) {
    setEsDate(row.date.toISOString().slice(0, 10))
    setEsDiscountStr(row.discount > 0 ? fmtBRL(row.discount) : '')
    setEsPayMethod(row.payment ?? 'pix')
    setEsCustomerId(row.customerId ?? null)
    setEsCustomerName(row.customerName !== 'Sem cliente' ? row.customerName : '')
    setEsCart((row.saleItems ?? []).map(i => ({
      key: randKey(), productId: null,
      name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents,
    })))
    setEsPQuery(''); setEsMName(''); setEsMPrice(''); setEsMQty('1')
    setEsShowManual(false); setEsCustQuery(''); setEsCustDrop(false)
    setEsRow(row)
  }

  async function handleEsCustSearch() {
    if (esCustQuery.trim().length < 2) return
    setEsCustSearching(true); setEsCustDrop(false)
    try {
      const res = await searchCustomers(esCustQuery.trim())
      if (res.length === 1) {
        setEsCustomerId(res[0].id); setEsCustomerName(res[0].full_name); setEsCustQuery('')
      } else if (res.length > 1) {
        setEsCustResults(res); setEsCustDrop(true)
      } else { toast.info('Cliente não encontrado') }
    } finally { setEsCustSearching(false) }
  }

  function addEsProduct(p: Product) {
    setEsCart(prev => {
      const idx = prev.findIndex(i => i.productId === p.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], quantity: n[idx].quantity + 1 }; return n }
      return [...prev, { key: randKey(), productId: p.id, source: p.source, name: p.name, quantity: 1, unitPriceCents: p.price_cents }]
    })
    setEsPQuery(''); setEsPDrop(false)
  }

  function addEsManualItem() {
    if (!esMName.trim() || !esMPrice) return
    setEsCart(prev => [...prev, { key: randKey(), productId: null, name: esMName.trim(), quantity: Math.max(1, parseInt(esMQty) || 1), unitPriceCents: parseCents(esMPrice) }])
    setEsMName(''); setEsMPrice(''); setEsMQty('1'); setEsShowManual(false)
  }

  function setEsItemQty(key: string, q: number) {
    if (q <= 0) { setEsCart(prev => prev.filter(i => i.key !== key)); return }
    setEsCart(prev => prev.map(i => i.key === key ? { ...i, quantity: q } : i))
  }

  function doEditSale() {
    if (!esRow || !esCart.length) return
    const row = esRow; setEsRow(null)
    startEsSave(async () => {
      try {
        const discountCents = parseCents(esDiscountStr)
        const input: EditSaleInput = {
          customerId:    esCustomerId,
          items:         esCart.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
          discountCents,
          paymentMethod: esPayMethod,
          saleDate:      esDate,
        }
        await updateCancelledSale(row.rawId, input)
        const subtotal   = esCart.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0)
        const newTotal   = Math.max(0, subtotal - discountCents)
        const newDate    = new Date(esDate + 'T12:00:00')
        const newDateStr = newDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        setRows(rs => rs.map(r => r.id === row.id ? {
          ...r,
          date:         newDate,
          dateStr:      newDateStr,
          customerName: esCustomerName || 'Sem cliente',
          description:  esCart.map(i => `${i.quantity}× ${i.name}`).join(', '),
          payment:      esPayMethod,
          discount:     discountCents,
          total:        newTotal,
          customerId:   esCustomerId,
          saleItems:    esCart.map(i => ({ name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
        } : r))
        toast.success('Venda atualizada.')
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao editar venda.') }
    })
  }

  // ── Cart helpers ──────────────────────────────────────────────────────────
  function addProduct(p: Product) {
    setCart(prev => {
      const idx = prev.findIndex(i => i.productId === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return [...prev, { key: randKey(), productId: p.id, source: p.source, name: p.name, quantity: 1, unitPriceCents: p.price_cents }]
    })
    setPQuery(''); setPDrop(false)
  }

  function addManualItem() {
    if (!mName.trim() || !mPrice) return
    setCart(prev => [...prev, { key: randKey(), productId: null, name: mName.trim(), quantity: Math.max(1, parseInt(mQty) || 1), unitPriceCents: parseCents(mPrice) }])
    setMName(''); setMPrice(''); setMQty('1'); setShowManual(false)
  }

  function setItemQty(key: string, q: number) {
    if (q <= 0) { setCart(prev => prev.filter(i => i.key !== key)); return }
    setCart(prev => prev.map(i => i.key === key ? { ...i, quantity: q } : i))
  }

  // ── Customer search ───────────────────────────────────────────────────────
  async function handleCustSearch() {
    if (custQuery.trim().length < 2) return
    setCustSearching(true); setCustDrop(false)
    try {
      const res = await searchCustomers(custQuery.trim())
      if (res.length === 1) { setCustomer(res[0]); setCustQuery(''); toast.success('Cliente encontrado!') }
      else if (res.length > 1) { setCustResults(res); setCustDrop(true) }
      else { setShowCustForm(true); toast.info('Cliente não encontrado — cadastre abaixo') }
    } finally { setCustSearching(false) }
  }

  // ── CEP lookup ────────────────────────────────────────────────────────────
  async function handleCepBlur(val: string) {
    const d = val.replace(/\D/g, '')
    if (d.length !== 8) return
    setFetchingCep(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const data = await r.json()
      if (!data.erro) setNc(p => ({ ...p, addressStreet: data.logradouro ?? '', addressCity: data.localidade ?? '', addressState: data.uf ?? '' }))
    } catch { /* silent */ } finally { setFetchingCep(false) }
  }

  // ── Save customer ─────────────────────────────────────────────────────────
  async function handleSaveCust() {
    if (!nc.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSavingCust(true)
    try {
      const c = await createCustomer(nc)
      setCustomer(c); setShowCustForm(false); setCustQuery(''); toast.success('Cliente cadastrado!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar')
    } finally { setSavingCust(false) }
  }

  // ── Save nova venda ───────────────────────────────────────────────────────
  function doNovaVenda() {
    setNvError('')
    startNvSave(async () => {
      try {
        const items: ManualSaleItem[] = cart.map(i => ({
          productId: i.productId, source: i.source,
          name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents,
        }))
        await createManualSale({ saleDate, customerId: customer?.id ?? null, items, discountCents: discount, paymentMethod: payMethod })
        toast.success('Venda registrada com sucesso!')
        setNovaVendaOpen(false)
        resetNovaVenda()
        window.location.reload()
      } catch (e) { setNvError(e instanceof Error ? e.message : 'Erro ao registrar venda.') }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Financeiro</h1>
          <p className="mt-1 text-sm text-muted">Vendas (Smart ERP) + Ordens de Serviço (CheckSmart)</p>
        </div>
        <button onClick={() => { setNovaVendaOpen(true); resetNovaVenda() }}
          className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-black"
          style={{ background: '#00FF94' }}>
          <Plus className="h-4 w-4" /> Nova Venda
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: 'Total Faturado', value: BRL(totalFaturado), icon: TrendingUp,   color: '#00FF94' },
          { label: 'Vendas ERP',     value: String(totalVendas), icon: ShoppingCart, color: '#00E5FF' },
          { label: 'OS CheckSmart',  value: String(totalOS),    icon: Wrench,       color: '#FFB800' },
          { label: 'Ticket Médio',   value: BRL(ticketMedio),   icon: CreditCard,   color: '#00E5FF' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border p-5" style={{ background: '#111827', borderColor: '#1E2D45' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
                <p className="mt-2 text-xl font-bold text-text">{value}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}18` }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalDesconto > 0 && (
        <div className="flex items-center gap-3 rounded-xl border px-5 py-3" style={{ background: '#111827', borderColor: '#1E2D45' }}>
          <Receipt className="h-4 w-4 shrink-0" style={{ color: '#FF5C5C' }} />
          <p className="text-sm text-muted">
            Total de descontos: <span className="font-semibold" style={{ color: '#FF5C5C' }}>{BRL(totalDesconto)}</span>
          </p>
        </div>
      )}

      {/* Filter bar */}
      <div className="rounded-xl border p-4 space-y-3" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-muted" />
          {([
            { key: 'all',   label: 'Todos' },
            { key: 'today', label: 'Hoje' },
            { key: 'week',  label: 'Esta semana' },
            { key: 'month', label: 'Este mês' },
            { key: 'custom',label: 'Personalizado' },
          ] as { key: PeriodKey; label: string }[]).map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
              style={period === p.key
                ? { background: '#00FF9418', borderColor: '#00FF94', color: '#00FF94' }
                : { borderColor: '#1E2D45', color: '#64748B' }}>
              {p.label}
            </button>
          ))}
          <div className="relative ml-auto w-52">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={filterCustomer}
              onChange={e => setFilterCustomer(e.target.value)}
              placeholder="Buscar cliente…"
              className={INP} style={{ ...INP_S, paddingLeft: '2rem', paddingTop: '0.375rem', paddingBottom: '0.375rem', fontSize: '0.75rem' }}
            />
            {filterCustomer && (
              <button onClick={() => setFilterCustomer('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted pointer-events-none" />
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className={INP} style={{ ...INP_S, paddingLeft: '2.25rem', paddingTop: '0.375rem', paddingBottom: '0.375rem', fontSize: '0.75rem' }} />
            </div>
            <span className="text-xs text-muted">até</span>
            <div className="relative flex-1">
              <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted pointer-events-none" />
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className={INP} style={{ ...INP_S, paddingLeft: '2.25rem', paddingTop: '0.375rem', paddingBottom: '0.375rem', fontSize: '0.75rem' }} />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: '#1E2D45' }}>
          <h2 className="text-sm font-semibold text-text">Todas as Transações</h2>
          <div className="flex items-center gap-3">
            {someSelected && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{selected.size} selecionado(s)</span>
                <button onClick={() => setConfirmBulkCancel(true)} disabled={bulkCancelling}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5"
                  style={{ borderColor: '#FF5C5C40', color: '#FF5C5C' }}>
                  <XCircle className="h-3.5 w-3.5" /> Cancelar seleção
                </button>
                <button onClick={() => setConfirmBulkDelete(true)} disabled={bulkDeleting || !canBulkDelete}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                  style={canBulkDelete ? { borderColor: '#FF5C5C', background: '#FF5C5C18', color: '#FF5C5C' } : { borderColor: '#1E2D45', color: '#64748B' }}
                  title={!canBulkDelete ? 'Selecione apenas registros já cancelados' : ''}>
                  <Trash2 className="h-3.5 w-3.5" /> Excluir seleção
                </button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-text">Limpar</button>
              </div>
            )}
            <span className="text-xs text-muted">{filteredRows.length} {filteredRows.length === 1 ? 'registro' : 'registros'}{filteredRows.length !== rows.length ? ` de ${rows.length}` : ''}</span>
          </div>
        </div>
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Receipt className="h-10 w-10" style={{ color: '#1E2D45' }} />
            <p className="text-sm text-muted">{rows.length === 0 ? 'Nenhuma transação registrada ainda' : 'Nenhum resultado para os filtros selecionados'}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 px-5 py-3 border-b text-xs font-medium uppercase tracking-wider text-muted"
              style={{ borderColor: '#1E2D45', gridTemplateColumns: '32px 90px 1fr 150px 110px 100px 110px 40px' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                className="h-4 w-4 rounded accent-accent cursor-pointer" />
              <span>Origem</span><span>Cliente / Descrição</span><span>Data</span>
              <span>Pagamento</span><span className="text-right">Desconto</span>
              <span className="text-right">Total</span><span />
            </div>
            {filteredRows.map(row => {
              const isERP    = row.source === 'erp'
              const srcColor = row.cancelled ? '#64748B' : isERP ? '#00FF94' : '#00E5FF'
              const pmColor  = row.payment ? (METHOD_COLOR[row.payment] ?? '#64748B') : '#64748B'
              return (
                <div key={row.id} className="grid gap-4 px-5 py-3.5 border-b items-center last:border-0 transition-opacity"
                  style={{ borderColor: '#1E2D45', gridTemplateColumns: '32px 90px 1fr 150px 110px 100px 110px 40px', opacity: row.cancelled ? 0.45 : 1 }}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)}
                    className="h-4 w-4 rounded accent-accent cursor-pointer" />
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-semibold"
                      style={{ background: `${srcColor}18`, color: srcColor }}>
                      {isERP ? 'ERP' : 'CheckSmart'}
                    </span>
                    {row.cancelled && (
                      <span className="inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: '#FF5C5C18', color: '#FF5C5C' }}>Cancelada</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${row.cancelled ? 'line-through text-muted' : 'text-text'}`}>{row.customerName}</p>
                      {!row.cancelled && row.clienteType && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={row.clienteType === 'recorrente'
                            ? { background: 'rgba(0,255,148,.12)', color: '#00FF94' }
                            : { background: 'rgba(155,109,255,.15)', color: '#9B6DFF' }
                          }
                        >
                          {row.clienteType === 'recorrente' ? 'Recorrente' : 'Novo'}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted truncate">{row.description}</p>
                  </div>
                  <p className="text-xs text-muted">{row.dateStr}</p>
                  {row.payment ? (
                    <span className="inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-semibold"
                      style={{ background: `${pmColor}18`, color: pmColor }}>
                      {METHOD_LABEL[row.payment] ?? row.payment}
                    </span>
                  ) : row.osStatus ? (
                    <span className="inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium"
                      style={{ background: '#64748B18', color: '#64748B' }}>
                      {OS_STATUS_LABEL[row.osStatus] ?? row.osStatus}
                    </span>
                  ) : <span className="text-xs text-muted">—</span>}
                  <p className="text-sm text-right" style={{ color: row.discount > 0 ? '#FF5C5C' : '#64748B' }}>
                    {row.discount > 0 ? `- ${BRL(row.discount)}` : '—'}
                  </p>
                  <p className={`text-sm font-bold text-right ${row.cancelled ? 'line-through text-muted' : 'text-green'}`}>{BRL(row.total)}</p>
                  <div className="relative flex items-center justify-center" ref={openMenu === row.id ? menuRef : undefined}>
                    <button onClick={() => setOpenMenu(openMenu === row.id ? null : row.id)}
                      className="rounded p-1.5 text-muted hover:text-text transition-colors hover:bg-white/5">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenu === row.id && (
                      <div className="absolute right-0 top-7 z-20 w-44 rounded-xl border shadow-xl overflow-hidden"
                        style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
                        {/* Alterar data — só ERP ativo */}
                        {row.source === 'erp' && !row.cancelled && (
                          <button onClick={() => { setOpenMenu(null); openEditDate(row) }}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text hover:bg-white/5 transition-colors border-b"
                            style={{ borderColor: '#1E2D45' }}>
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" style={{ color: '#00E5FF' }} />
                            Alterar data
                          </button>
                        )}
                        {/* Editar pagamento — OS CheckSmart */}
                        {row.source === 'checksmart' && !row.cancelled && (
                          <button onClick={() => { setOpenMenu(null); setEditPayVal(row.payment ?? ''); setEditPayRow(row) }}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text hover:bg-white/5 transition-colors border-b"
                            style={{ borderColor: '#1E2D45' }}>
                            <CreditCard className="h-3.5 w-3.5 shrink-0" style={{ color: '#FFB800' }} />
                            Editar pagamento
                          </button>
                        )}
                        {/* Cancelar / Reativar */}
                        {row.cancelled ? (
                          <button onClick={() => { setOpenMenu(null); setConfirmReactivate(row) }}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text hover:bg-white/5 transition-colors border-b"
                            style={{ borderColor: '#1E2D45' }}>
                            <RefreshCw className="h-3.5 w-3.5 shrink-0" style={{ color: '#00FF94' }} />
                            Reativar
                          </button>
                        ) : (
                          <button onClick={() => { setOpenMenu(null); setConfirmCancel(row) }}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text hover:bg-white/5 transition-colors border-b"
                            style={{ borderColor: '#1E2D45' }}>
                            <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#FF5C5C' }} />
                            Cancelar
                          </button>
                        )}
                        {/* Editar venda — só ERP cancelado */}
                        {row.source === 'erp' && row.cancelled && (
                          <button onClick={() => { setOpenMenu(null); openEditSale(row) }}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text hover:bg-white/5 transition-colors border-b"
                            style={{ borderColor: '#1E2D45' }}>
                            <Pencil className="h-3.5 w-3.5 shrink-0" style={{ color: '#00E5FF' }} />
                            Editar venda
                          </button>
                        )}
                        {/* Excluir — só ERP cancelado */}
                        {row.source === 'erp' && row.cancelled && (
                          <button onClick={() => { setOpenMenu(null); setConfirmDelete(row) }}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-red-500/10 transition-colors"
                            style={{ color: '#FF5C5C' }}>
                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                            Excluir venda
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── Modal Cancelar ────────────────────────────────────────────────────── */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#FF5C5C18' }}>
              <XCircle className="h-6 w-6" style={{ color: '#FF5C5C' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Cancelar transação?</h3>
              <p className="mt-1 text-sm text-muted"><span className="font-medium text-text">{confirmCancel.customerName}</span> — {BRL(confirmCancel.total)}</p>
              {confirmCancel.source === 'erp' && (
                <p className="mt-2 text-xs text-yellow-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />O estoque dos produtos será restaurado.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancel(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted" style={INP_S}>Voltar</button>
              <button onClick={doCancel} disabled={actioning}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white"
                style={{ background: '#FF5C5C' }}>
                {actioning && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar venda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Reativar ────────────────────────────────────────────────────── */}
      {confirmReactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#00FF9418' }}>
              <RefreshCw className="h-6 w-6" style={{ color: '#00FF94' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Reativar transação?</h3>
              <p className="mt-1 text-sm text-muted"><span className="font-medium text-text">{confirmReactivate.customerName}</span> — {BRL(confirmReactivate.total)}</p>
              {confirmReactivate.source === 'erp' && (
                <p className="mt-2 text-xs text-yellow-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />O estoque será decrementado novamente.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmReactivate(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted" style={INP_S}>Voltar</button>
              <button onClick={doReactivate} disabled={actioning}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-black"
                style={{ background: '#00FF94' }}>
                {actioning && <Loader2 className="h-4 w-4 animate-spin" />} Reativar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Cancelar em Massa ──────────────────────────────────────────── */}
      {confirmBulkCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#FF5C5C18' }}>
              <XCircle className="h-6 w-6" style={{ color: '#FF5C5C' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Cancelar {selected.size} transação(ões)?</h3>
              <p className="mt-1 text-sm text-muted">
                {selectedErpIds.length > 0 && <span className="block">• {selectedErpIds.length} venda(s) ERP — estoque será restaurado</span>}
                {selectedOsIds.length > 0 && <span className="block">• {selectedOsIds.length} OS CheckSmart</span>}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBulkCancel(false)} className="flex-1 rounded-lg border py-2 text-sm text-muted" style={INP_S}>Voltar</button>
              <button onClick={doBulkCancel} disabled={bulkCancelling}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#FF5C5C' }}>
                {bulkCancelling && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Excluir em Massa ────────────────────────────────────────────── */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#FF5C5C18' }}>
              <Trash2 className="h-6 w-6" style={{ color: '#FF5C5C' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Excluir {selectedErpIds.length} venda(s) permanentemente?</h3>
              <p className="mt-2 text-xs flex items-center gap-1.5" style={{ color: '#FF5C5C' }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBulkDelete(false)} className="flex-1 rounded-lg border py-2 text-sm text-muted" style={INP_S}>Voltar</button>
              <button onClick={doBulkDelete} disabled={bulkDeleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#FF5C5C' }}>
                {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin" />} Excluir tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Pagamento OS ─────────────────────────────────────────── */}
      {editPayRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#FFB80018' }}>
              <CreditCard className="h-6 w-6" style={{ color: '#FFB800' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Editar forma de pagamento</h3>
              <p className="mt-1 text-sm text-muted">
                <span className="font-medium text-text">{editPayRow.customerName}</span> — {BRL(editPayRow.total)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'pix',         label: 'PIX' },
                { value: 'cash',        label: 'Dinheiro' },
                { value: 'credit_card', label: 'Crédito' },
                { value: 'debit_card',  label: 'Débito' },
                { value: 'transfer',    label: 'Transferência' },
                { value: 'pending',     label: 'A Receber' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => setEditPayVal(opt.value)}
                  className="rounded-lg border py-2.5 text-sm font-medium transition-all"
                  style={editPayVal === opt.value
                    ? { background: '#FFB80018', borderColor: '#FFB800', color: '#FFB800' }
                    : { borderColor: '#1E2D45', color: '#64748B' }}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditPayRow(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted" style={INP_S}>
                Cancelar
              </button>
              <button onClick={doEditPay} disabled={savingPay || !editPayVal}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-black disabled:opacity-50"
                style={{ background: '#FFB800' }}>
                {savingPay && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Excluir ────────────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#FF5C5C18' }}>
              <Trash2 className="h-6 w-6" style={{ color: '#FF5C5C' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Excluir venda permanentemente?</h3>
              <p className="mt-1 text-sm text-muted">
                <span className="font-medium text-text">{confirmDelete.customerName}</span> — {BRL(confirmDelete.total)}
              </p>
              <p className="mt-2 text-xs flex items-center gap-1.5" style={{ color: '#FF5C5C' }}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted" style={INP_S}>Voltar</button>
              <button onClick={doDelete} disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#FF5C5C' }}>
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Alterar Data ───────────────────────────────────────────────── */}
      {editDateRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: '#00E5FF18' }}>
              <CalendarDays className="h-6 w-6" style={{ color: '#00E5FF' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text">Alterar data da venda</h3>
              <p className="mt-1 text-sm text-muted">
                <span className="font-medium text-text">{editDateRow.customerName}</span> — {BRL(editDateRow.total)}
              </p>
              <p className="mt-2 text-xs text-yellow-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                O estoque será cancelado e relançado automaticamente.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nova data</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted pointer-events-none" />
                <input type="date" value={editDateVal} onChange={e => setEditDateVal(e.target.value)}
                  className={INP} style={{ ...INP_S, paddingLeft: '2.25rem' }} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditDateRow(null)} className="flex-1 rounded-lg border py-2 text-sm text-muted" style={INP_S}>
                Voltar
              </button>
              <button onClick={doEditDate} disabled={savingDate || !editDateVal}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-black disabled:opacity-50"
                style={{ background: '#00E5FF' }}>
                {savingDate && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Venda Cancelada ─────────────────────────────────────── */}
      {esRow && (() => {
        const esSubtotal = esCart.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0)
        const esDiscount = parseCents(esDiscountStr)
        const esTotal    = Math.max(0, esSubtotal - esDiscount)
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="relative w-full max-w-2xl rounded-2xl border my-8" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>
              <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
                <div className="flex items-center gap-3">
                  <Pencil className="h-4 w-4" style={{ color: '#00E5FF' }} />
                  <h2 className="text-base font-semibold text-text">Editar Venda Cancelada</h2>
                </div>
                <button onClick={() => setEsRow(null)} className="text-muted hover:text-text"><X className="h-5 w-5" /></button>
              </div>

              <div className="space-y-5 px-6 py-5">
                {/* Data */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Data da venda *</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted pointer-events-none" />
                    <input type="date" value={esDate} onChange={e => setEsDate(e.target.value)}
                      className={INP} style={{ ...INP_S, paddingLeft: '2.25rem' }} />
                  </div>
                </div>

                {/* Cliente */}
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#1E2D45' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cliente (opcional)</p>
                  {esCustomerName ? (
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: '#00E5FF30', background: '#00E5FF08' }}>
                      <p className="text-sm font-medium text-text">{esCustomerName}</p>
                      <button onClick={() => { setEsCustomerId(null); setEsCustomerName('') }} className="text-muted hover:text-text">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input value={esCustQuery} onChange={e => setEsCustQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleEsCustSearch()}
                          placeholder="Buscar por nome, CPF ou WhatsApp…"
                          className={INP + ' flex-1'} style={INP_S} />
                        <button onClick={handleEsCustSearch} disabled={esCustSearching}
                          className="rounded-lg border px-3 text-sm text-accent hover:bg-white/5" style={INP_S}>
                          {esCustSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </button>
                      </div>
                      {esCustDrop && esCustResults.length > 0 && (
                        <div className="rounded-lg border overflow-hidden" style={{ ...INP_S, background: '#111827' }}>
                          {esCustResults.map(c => (
                            <button key={c.id} onClick={() => { setEsCustomerId(c.id); setEsCustomerName(c.full_name); setEsCustDrop(false); setEsCustQuery('') }}
                              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-white/5 border-b last:border-0" style={{ borderColor: '#1E2D45' }}>
                              <span className="text-text">{c.full_name}</span>
                              {c.whatsapp && <span className="text-xs text-muted">{c.whatsapp}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Itens */}
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#1E2D45' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Itens do pedido *</p>
                  <div ref={esRef} className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <input value={esPQuery} onChange={e => setEsPQuery(e.target.value)}
                          placeholder="Buscar produto por nome ou código…"
                          className={INP} style={{ ...INP_S, paddingLeft: '2.25rem' }} />
                        {esPSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
                      </div>
                      <button onClick={() => setEsShowManual(true)}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-accent hover:bg-white/5 whitespace-nowrap" style={INP_S}>
                        <Plus className="h-4 w-4" /> Manual
                      </button>
                    </div>
                    {esPDrop && esPResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-xl border shadow-xl overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
                        {esPResults.map(p => (
                          <button key={`${p.source}-${p.id}`} onMouseDown={() => addEsProduct(p)}
                            className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-white/5 transition-colors border-b last:border-0" style={{ borderColor: '#1E2D45' }}>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-text">{p.name}</p>
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={p.source === 'parts_catalog' ? { background: '#FFB80018', color: '#FFB800' } : { background: '#00E5FF18', color: '#00E5FF' }}>
                                  {p.source === 'parts_catalog' ? 'Peça' : 'Produto'}
                                </span>
                              </div>
                            </div>
                            <p className="font-semibold text-accent ml-4 shrink-0">{BRL(p.price_cents)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {esShowManual && (
                    <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: '#1E2D45', background: '#111827' }}>
                      <input value={esMName} onChange={e => setEsMName(e.target.value)} placeholder="Descrição do item / serviço *"
                        className={INP} style={INP_S} autoFocus onKeyDown={e => e.key === 'Enter' && addEsManualItem()} />
                      <div className="grid grid-cols-3 gap-2">
                        <input value={esMPrice} onChange={e => setEsMPrice(e.target.value)} placeholder="Preço (R$)"
                          className={INP} style={INP_S} />
                        <input type="number" min="1" value={esMQty} onChange={e => setEsMQty(e.target.value)} placeholder="Qtd"
                          className={INP} style={INP_S} />
                        <div className="flex gap-2">
                          <button onClick={addEsManualItem} disabled={!esMName.trim() || !esMPrice}
                            className="flex-1 rounded-lg py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ background: '#00FF94' }}>
                            Adicionar
                          </button>
                          <button onClick={() => setEsShowManual(false)} className="rounded-lg border px-2 text-muted hover:text-text" style={INP_S}>
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {esCart.length > 0 ? (
                    <div className="space-y-1">
                      {esCart.map(item => (
                        <div key={item.key} className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: '#1E2D45', background: '#111827' }}>
                          <p className="flex-1 text-sm text-text truncate">{item.name}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setEsItemQty(item.key, item.quantity - 1)}
                              className="h-6 w-6 rounded border flex items-center justify-center text-xs text-muted hover:bg-white/5" style={INP_S}>−</button>
                            <span className="w-6 text-center text-sm text-text">{item.quantity}</span>
                            <button onClick={() => setEsItemQty(item.key, item.quantity + 1)}
                              className="h-6 w-6 rounded border flex items-center justify-center text-xs text-muted hover:bg-white/5" style={INP_S}>+</button>
                          </div>
                          <p className="text-sm font-semibold text-accent shrink-0 w-24 text-right">{BRL(item.unitPriceCents * item.quantity)}</p>
                          <button onClick={() => setEsCart(prev => prev.filter(i => i.key !== item.key))} className="text-muted hover:text-red-400 shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-muted py-4">Busque um produto ou clique em "Manual"</p>
                  )}
                </div>

                {/* Pagamento + Desconto */}
                <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Forma de Pagamento</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['cash','pix','card','mixed'] as const).map(m => {
                        const colors = { cash:'#00FF94', pix:'#00E5FF', card:'#FFB800', mixed:'#FF5C5C' }
                        const labels = { cash:'Dinheiro', pix:'PIX', card:'Cartão', mixed:'Misto' }
                        const active = esPayMethod === m; const c = colors[m]
                        return (
                          <button key={m} onClick={() => setEsPayMethod(m)}
                            className="rounded-lg border py-2 text-xs font-medium transition-all"
                            style={active ? { background:`${c}18`, borderColor:c, color:c } : { borderColor:'#1E2D45', color:'#64748B' }}>
                            {labels[m]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="min-w-32">
                    <label className="mb-1 block text-xs font-medium text-muted">Desconto (R$)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">R$</span>
                      <input type="text" inputMode="numeric" value={esDiscountStr}
                        onChange={e => setEsDiscountStr(e.target.value)} placeholder="0,00"
                        className={INP} style={{ ...INP_S, paddingLeft: '2.25rem' }} />
                    </div>
                  </div>
                </div>

                {esCart.length > 0 && (
                  <div className="rounded-lg border px-4 py-3 space-y-1" style={{ ...INP_S, background: '#111827' }}>
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>Subtotal</span><span>{BRL(esSubtotal)}</span>
                    </div>
                    {esDiscount > 0 && (
                      <div className="flex items-center justify-between text-xs" style={{ color: '#FF5C5C' }}>
                        <span>Desconto</span><span>- {BRL(esDiscount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-bold border-t pt-1" style={{ borderColor: '#1E2D45' }}>
                      <span className="text-sm text-text">Total</span>
                      <span className="text-base" style={{ color: '#00FF94' }}>{BRL(esTotal)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t px-6 py-4" style={{ borderColor: '#1E2D45' }}>
                <button onClick={() => setEsRow(null)} className="rounded-lg border px-4 py-2 text-sm text-muted hover:text-text" style={INP_S}>
                  Cancelar
                </button>
                <button onClick={doEditSale} disabled={savingEs || esCart.length === 0 || !esDate}
                  className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
                  style={{ background: '#00E5FF' }}>
                  {savingEs && <Loader2 className="h-4 w-4 animate-spin" />}
                  {savingEs ? 'Salvando…' : 'Salvar Venda'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal Nova Venda ─────────────────────────────────────────────────── */}
      {novaVendaOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="relative w-full max-w-2xl rounded-2xl border my-8" style={{ background: '#0D1521', borderColor: '#1E2D45' }}>

            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: '#1E2D45' }}>
              <h2 className="text-base font-semibold text-text">Registrar Venda</h2>
              <button onClick={() => setNovaVendaOpen(false)} className="text-muted hover:text-text"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {nvError && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: '#FF5C5C18', color: '#FF5C5C', border: '1px solid #FF5C5C40' }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />{nvError}
                </div>
              )}

              {/* Data */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Data da venda *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted pointer-events-none" />
                  <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)}
                    className={INP} style={{ ...INP_S, paddingLeft: '2.25rem' }} />
                </div>
              </div>

              {/* ── Cliente ─────────────────────────────────────────────────── */}
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#1E2D45' }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cliente (opcional)</p>

                {customer ? (
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: '#00E5FF30', background: '#00E5FF08' }}>
                    <div>
                      <p className="text-sm font-medium text-text">{customer.full_name}</p>
                      {customer.whatsapp && <p className="text-xs text-muted">{customer.whatsapp}</p>}
                    </div>
                    <button onClick={() => { setCustomer(null); setCustQuery('') }} className="text-muted hover:text-text">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    {!showCustForm && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input value={custQuery} onChange={e => setCustQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCustSearch()}
                            placeholder="Buscar por nome, CPF ou WhatsApp…"
                            className={INP + ' flex-1'} style={INP_S} />
                          <button onClick={handleCustSearch} disabled={custSearching}
                            className="rounded-lg border px-3 text-sm text-accent hover:bg-white/5" style={INP_S}>
                            {custSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          </button>
                        </div>
                        <button onClick={() => setShowCustForm(true)}
                          className="flex items-center gap-2 text-xs font-medium transition-colors hover:text-accent"
                          style={{ color: '#00E5FF' }}>
                          <UserPlus className="h-3.5 w-3.5" /> Cadastrar novo cliente
                        </button>
                        {custDrop && custResults.length > 0 && (
                          <div className="rounded-lg border overflow-hidden" style={{ ...INP_S, background: '#111827' }}>
                            {custResults.map(c => (
                              <button key={c.id} onClick={() => { setCustomer(c); setCustDrop(false); setCustQuery('') }}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-white/5 border-b last:border-0" style={{ borderColor: '#1E2D45' }}>
                                <span className="text-text">{c.full_name}</span>
                                {c.whatsapp && <span className="text-xs text-muted">{c.whatsapp}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {showCustForm && (
                      <div className="space-y-3 border-t pt-3" style={{ borderColor: '#1E2D45' }}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-amber uppercase tracking-wider">Cadastro de cliente</p>
                          <button onClick={() => setShowCustForm(false)} className="text-xs text-muted hover:text-text">Cancelar</button>
                        </div>
                        <input value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))}
                          placeholder="Nome completo *" className={INP} style={INP_S} />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={nc.cpf} onChange={e => setNc(p => ({ ...p, cpf: fmtCpf(e.target.value) }))}
                            placeholder="CPF" className={INP} style={INP_S} />
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted pointer-events-none" />
                            <input type="date" value={nc.birthDate} onChange={e => setNc(p => ({ ...p, birthDate: e.target.value }))}
                              className={INP + ' pl-9'} style={INP_S} title="Data de aniversário" />
                          </div>
                        </div>
                        <input value={nc.whatsapp} onChange={e => setNc(p => ({ ...p, whatsapp: fmtPhone(e.target.value) }))}
                          placeholder="WhatsApp" className={INP} style={INP_S} />
                        <input type="email" value={nc.email} onChange={e => setNc(p => ({ ...p, email: e.target.value }))}
                          placeholder="E-mail" className={INP} style={INP_S} />
                        <div className="relative">
                          <input value={nc.cep} onChange={e => setNc(p => ({ ...p, cep: fmtCep(e.target.value) }))}
                            onBlur={e => handleCepBlur(e.target.value)} placeholder="CEP (opcional)"
                            className={INP} style={INP_S} />
                          {fetchingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted" />}
                        </div>
                        <input value={nc.addressStreet} onChange={e => setNc(p => ({ ...p, addressStreet: e.target.value }))}
                          placeholder="Logradouro" className={INP} style={INP_S} />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={nc.addressNumber} onChange={e => setNc(p => ({ ...p, addressNumber: e.target.value }))}
                            placeholder="Número" className={INP} style={INP_S} />
                          <input value={nc.addressComplement} onChange={e => setNc(p => ({ ...p, addressComplement: e.target.value }))}
                            placeholder="Complemento" className={INP} style={INP_S} />
                        </div>
                        <AddressCityState state={nc.addressState} city={nc.addressCity}
                          onStateChange={v => setNc(p => ({ ...p, addressState: v }))}
                          onCityChange={v => setNc(p => ({ ...p, addressCity: v }))}
                          inputCls={INP} inputStyle={INP_S} />
                        <button onClick={handleSaveCust} disabled={savingCust || !nc.name.trim()}
                          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-black disabled:opacity-60"
                          style={{ background: '#00FF94' }}>
                          {savingCust && <Loader2 className="h-4 w-4 animate-spin" />} Cadastrar cliente
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Produtos ─────────────────────────────────────────────────── */}
              <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: '#1E2D45' }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Produtos / Serviços *</p>

                {/* Search */}
                <div ref={pRef} className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                      <input value={pQuery} onChange={e => setPQuery(e.target.value)}
                        placeholder="Buscar produto por nome ou código…"
                        className={INP} style={{ ...INP_S, paddingLeft: '2.25rem' }} />
                      {pSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
                    </div>
                    <button onClick={() => setShowManual(true)}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-accent hover:bg-white/5 whitespace-nowrap" style={INP_S}>
                      <Plus className="h-4 w-4" /> Manual
                    </button>
                  </div>

                  {pDrop && pResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-xl border shadow-xl overflow-hidden" style={{ background: '#111827', borderColor: '#1E2D45' }}>
                      {pResults.map(p => (
                        <button key={`${p.source}-${p.id}`} onMouseDown={() => addProduct(p)}
                          className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-white/5 transition-colors border-b last:border-0" style={{ borderColor: '#1E2D45' }}>
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-text">{p.name}</p>
                              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                style={p.source === 'parts_catalog' ? { background: '#FFB80018', color: '#FFB800' } : { background: '#00E5FF18', color: '#00E5FF' }}>
                                {p.source === 'parts_catalog' ? 'Peça' : 'Produto'}
                              </span>
                            </div>
                            {p.code && <p className="text-xs text-muted">Cód: {p.code}</p>}
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <p className="font-semibold text-accent">{BRL(p.price_cents)}</p>
                            {p.stock_qty != null && <p className="text-xs text-muted">Estoque: {p.stock_qty}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Item manual inline */}
                {showManual && (
                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: '#1E2D45', background: '#111827' }}>
                    <input value={mName} onChange={e => setMName(e.target.value)} placeholder="Descrição do item / serviço *"
                      className={INP} style={INP_S} autoFocus onKeyDown={e => e.key === 'Enter' && addManualItem()} />
                    <div className="grid grid-cols-3 gap-2">
                      <input value={mPrice} onChange={e => setMPrice(e.target.value)} placeholder="Preço (R$)"
                        className={INP} style={INP_S} />
                      <input type="number" min="1" value={mQty} onChange={e => setMQty(e.target.value)} placeholder="Qtd"
                        className={INP} style={INP_S} />
                      <div className="flex gap-2">
                        <button onClick={addManualItem} disabled={!mName.trim() || !mPrice}
                          className="flex-1 rounded-lg py-2 text-sm font-semibold text-black disabled:opacity-50" style={{ background: '#00FF94' }}>
                          Adicionar
                        </button>
                        <button onClick={() => setShowManual(false)} className="rounded-lg border px-2 text-muted hover:text-text" style={INP_S}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cart */}
                {cart.length > 0 && (
                  <div className="space-y-1">
                    {cart.map(item => (
                      <div key={item.key} className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: '#1E2D45', background: '#111827' }}>
                        <p className="flex-1 text-sm text-text truncate">{item.name}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setItemQty(item.key, item.quantity - 1)}
                            className="h-6 w-6 rounded border flex items-center justify-center text-xs text-muted hover:bg-white/5" style={INP_S}>−</button>
                          <span className="w-6 text-center text-sm text-text">{item.quantity}</span>
                          <button onClick={() => setItemQty(item.key, item.quantity + 1)}
                            className="h-6 w-6 rounded border flex items-center justify-center text-xs text-muted hover:bg-white/5" style={INP_S}>+</button>
                        </div>
                        <p className="text-sm font-semibold text-accent shrink-0 w-24 text-right">{BRL(item.unitPriceCents * item.quantity)}</p>
                        <button onClick={() => setCart(prev => prev.filter(i => i.key !== item.key))} className="text-muted hover:text-red-400 shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {cart.length === 0 && !showManual && (
                  <p className="text-center text-xs text-muted py-4">Busque um produto ou clique em "Manual"</p>
                )}
              </div>

              {/* ── Desconto + Pagamento ─────────────────────────────────────── */}
              <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Forma de Pagamento</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['cash','pix','card','mixed'] as const).map(m => {
                      const colors = { cash:'#00FF94', pix:'#00E5FF', card:'#FFB800', mixed:'#FF5C5C' }
                      const labels = { cash:'Dinheiro', pix:'PIX', card:'Cartão', mixed:'Misto' }
                      const active = payMethod === m; const c = colors[m]
                      return (
                        <button key={m} onClick={() => setPayMethod(m)}
                          className="rounded-lg border py-2 text-xs font-medium transition-all"
                          style={active ? { background:`${c}18`, borderColor:c, color:c } : { borderColor:'#1E2D45', color:'#64748B' }}>
                          {labels[m]}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="min-w-32">
                  <label className="mb-1 block text-xs font-medium text-muted">Desconto (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">R$</span>
                    <input type="text" inputMode="numeric" value={discountStr}
                      onChange={e => setDiscountStr(e.target.value)} placeholder="0,00"
                      className={INP} style={{ ...INP_S, paddingLeft: '2.25rem' }} />
                  </div>
                </div>
              </div>

              {/* Total preview */}
              {cart.length > 0 && (
                <div className="rounded-lg border px-4 py-3 space-y-1" style={{ ...INP_S, background: '#111827' }}>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Subtotal</span><span>{BRL(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex items-center justify-between text-xs" style={{ color: '#FF5C5C' }}>
                      <span>Desconto</span><span>- {BRL(discount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-bold border-t pt-1" style={{ borderColor: '#1E2D45' }}>
                    <span className="text-sm text-text">Total</span>
                    <span className="text-base" style={{ color: '#00FF94' }}>{BRL(total)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t px-6 py-4" style={{ borderColor: '#1E2D45' }}>
              <button onClick={() => setNovaVendaOpen(false)} className="rounded-lg border px-4 py-2 text-sm text-muted hover:text-text" style={INP_S}>
                Cancelar
              </button>
              <button onClick={doNovaVenda} disabled={nvSaving || cart.length === 0}
                className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
                style={{ background: '#00FF94' }}>
                {nvSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {nvSaving ? 'Registrando…' : 'Registrar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
