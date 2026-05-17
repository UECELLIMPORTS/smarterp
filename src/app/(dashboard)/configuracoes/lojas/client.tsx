'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Pencil, Store as StoreIcon, Loader2, Save, X, Users, Trash2 } from 'lucide-react'
import { createStore, updateStore, toggleStoreActive, updateStoreGoal, updateStockSource, deleteStore, type Store } from '@/actions/stores'
import { toast } from 'sonner'

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#A855F7', '#EC4899', '#06B6D4', '#84CC16']

export function LojasClient({ initial }: { initial: Store[] }) {
  const router = useRouter()
  const [stores, setStores] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating]   = useState(false)

  // Sincroniza quando router.refresh() atualiza os dados do servidor
  useEffect(() => { setStores(initial) }, [initial])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/configuracoes" className="text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <StoreIcon className="h-5 w-5 text-emerald-400" />
        <h1 className="text-lg font-semibold text-zinc-100">Lojas</h1>
      </div>

      <p className="text-xs text-zinc-500 mb-2 leading-relaxed">
        Cadastre lojas virtuais dentro do mesmo sistema. Vendas, despesas e caixas ficam separados
        por loja, mas <strong>produtos e clientes são compartilhados</strong> entre todas. Útil pra empresas
        com mais de uma marca/divisão (ex: UÉ Cell Imports + UÉ Celulares).
      </p>
      <Link
        href="/configuracoes/equipe"
        className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-4"
      >
        <Users className="h-3.5 w-3.5" />
        Definir quais lojas cada membro da equipe pode acessar → Configurações de Equipe
      </Link>

      <div className="space-y-2 mb-4">
        {stores.map(s => (
          editingId === s.id ? (
            <StoreEditForm
              key={s.id}
              store={s}
              onCancel={() => setEditingId(null)}
              onSaved={(updated) => {
                setStores(stores.map(x => x.id === s.id ? { ...x, ...updated } : x))
                setEditingId(null)
              }}
            />
          ) : (
            <StoreRow
              key={s.id}
              store={s}
              allStores={stores}
              onEdit={() => setEditingId(s.id)}
              onSavedGoal={(cents) => {
                setStores(stores.map(x => x.id === s.id ? { ...x, monthly_goal_cents: cents } : x))
              }}
              onStockSourceChanged={(sourceId) => {
                setStores(stores.map(x => x.id === s.id ? { ...x, stock_source_store_id: sourceId } : x))
              }}
              onToggle={async (active) => {
                const res = await toggleStoreActive(s.id, active)
                if (res.ok) {
                  setStores(stores.map(x => x.id === s.id ? { ...x, is_active: active } : x))
                  toast.success(active ? 'Loja reativada' : 'Loja desativada')
                  router.refresh()
                } else {
                  toast.error(res.error)
                }
              }}
              onDelete={() => setStores(stores.filter(x => x.id !== s.id))}
            />
          )
        ))}
      </div>

      {creating ? (
        <StoreEditForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            router.refresh()
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400"
        >
          <Plus className="h-4 w-4" /> Adicionar loja
        </button>
      )}
    </div>
  )
}

function StoreRow({ store, allStores, onEdit, onToggle, onSavedGoal, onStockSourceChanged, onDelete }: {
  store: Store
  allStores: Store[]
  onEdit: () => void
  onToggle: (active: boolean) => void
  onSavedGoal: (cents: number) => void
  onStockSourceChanged: (sourceId: string | null) => void
  onDelete: () => void
}) {
  const [goalInput, setGoalInput] = useState((store.monthly_goal_cents / 100).toFixed(2))
  const [savingGoal, setSavingGoal] = useState(false)
  const [savingStock, setSavingStock] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Excluir a loja "${store.name}"? Vendas e movimentos vinculados ficam sem loja (não são apagados).`)) return
    setDeleting(true)
    const res = await deleteStore(store.id)
    setDeleting(false)
    if (res.ok) {
      toast.success('Loja excluída')
      onDelete()
    } else {
      toast.error(res.error)
    }
  }
  const goalDirty = parseFloat(goalInput.replace(',', '.') || '0') !== (store.monthly_goal_cents / 100)

  // Lojas que podem ser fonte de estoque: todas exceto esta própria e lojas que já apontam pra alguma outra
  const stockOptions = allStores.filter(s => s.id !== store.id && s.stock_source_store_id === null)

  async function saveGoal() {
    const cents = Math.round(parseFloat(goalInput.replace(',', '.') || '0') * 100)
    if (Number.isNaN(cents) || cents < 0) return
    setSavingGoal(true)
    const res = await updateStoreGoal(store.id, cents)
    setSavingGoal(false)
    if (res.ok) {
      toast.success('Meta atualizada')
      onSavedGoal(cents)
    } else {
      toast.error(res.error)
    }
  }

  async function handleStockSourceChange(value: string) {
    const sourceId = value === '' ? null : value
    setSavingStock(true)
    const res = await updateStockSource(store.id, sourceId)
    setSavingStock(false)
    if (res.ok) {
      toast.success(sourceId ? 'Estoque compartilhado configurado' : 'Loja voltou a ter estoque próprio')
      onStockSourceChanged(sourceId)
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: store.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${store.is_active ? 'text-zinc-100' : 'text-zinc-500'}`}>
              {store.name}
            </span>
            {store.is_default && (
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                padrão
              </span>
            )}
            {store.stock_source_store_id && (
              <span className="text-[10px] uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                estoque compartilhado
              </span>
            )}
            {!store.is_active && (
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">inativa</span>
            )}
          </div>
          <p className="text-xs text-zinc-500 font-mono">{store.code}</p>
        </div>
        <button onClick={onEdit} className="p-1.5 text-zinc-500 hover:text-zinc-200" title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {!store.is_default && (
          <>
            <button
              type="button"
              onClick={() => onToggle(!store.is_active)}
              className="text-[11px] text-zinc-500 hover:text-zinc-200 px-2"
            >
              {store.is_active ? 'Desativar' : 'Ativar'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 text-zinc-600 hover:text-red-400 disabled:opacity-40"
              title="Excluir loja"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Estoque compartilhado — só para lojas não-padrão */}
      {!store.is_default && (
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">Estoque</label>
          <select
            value={store.stock_source_store_id ?? ''}
            onChange={e => handleStockSourceChange(e.target.value)}
            disabled={savingStock}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 disabled:opacity-50"
          >
            <option value="">Próprio (independente)</option>
            {stockOptions.map(s => (
              <option key={s.id} value={s.id}>
                Compartilhar com {s.name}
              </option>
            ))}
          </select>
          {savingStock && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
        </div>
      )}

      {/* Meta mensal inline */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Meta mensal R$</label>
        <input
          type="number" step="0.01" min={0}
          value={goalInput}
          onChange={e => setGoalInput(e.target.value)}
          placeholder="0,00"
          className="flex-1 max-w-[140px] rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 tabular-nums"
        />
        {goalDirty && (
          <button
            type="button"
            onClick={saveGoal}
            disabled={savingGoal}
            className="rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-bold text-zinc-900 hover:bg-emerald-600 disabled:opacity-40"
          >
            {savingGoal ? '...' : 'Salvar meta'}
          </button>
        )}
      </div>
    </div>
  )
}

function StoreEditForm({ store, onCancel, onSaved }: {
  store?: Store
  onCancel: () => void
  onSaved: (updated?: Partial<Store>) => void
}) {
  const [name,  setName]  = useState(store?.name ?? '')
  const [code,  setCode]  = useState(store?.code ?? '')
  const [color, setColor] = useState(store?.color ?? PRESET_COLORS[0])
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const input = { name, code, color }
      const res = store
        ? await updateStore(store.id, input)
        : await createStore(input)
      if (res.ok) {
        toast.success(store ? 'Loja atualizada' : 'Loja criada')
        onSaved({ name, code: code.toUpperCase(), color })
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Nome</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: UÉ Celulares"
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Código curto</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
            placeholder="UCC"
            maxLength={20}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 font-mono uppercase"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Cor</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-md border-2 transition-all ${color === c ? 'border-zinc-100 scale-110' : 'border-transparent'}`}
              style={{ background: c }}
              aria-label={`Cor ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1">
          <X className="h-3 w-3" /> Cancelar
        </button>
        <button
          onClick={save}
          disabled={pending || name.length < 2 || code.length < 2}
          className="px-3 py-1.5 text-xs rounded-md bg-emerald-500 text-white font-medium hover:bg-emerald-600 disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Salvar
        </button>
      </div>
    </div>
  )
}
