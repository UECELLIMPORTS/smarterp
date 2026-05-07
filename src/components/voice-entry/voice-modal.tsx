'use client'

/**
 * Voice Modal — captura áudio, processa via IA, mostra preview e confirma.
 *
 * Flow:
 *   idle → recording → processing → review → submitting → done
 *
 * Após confirmação, chama actions correspondentes:
 *   - expense: createVariableExpense
 *   - stock_in: createMovement (entrada)
 *   - stock_balance: adjustStock (ou createMovement com origin='balanco')
 */

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, X, Loader2, Check, AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react'
import { processVoiceCommand, type VoiceProductMatch, type VoiceCustomerMatch, type VoiceSaleItemMatched } from '@/actions/voice-entry'
import { createVariableExpense } from '@/actions/variable-expenses'
import { createMovement } from '@/actions/stock-movements'
import { adjustStock } from '@/actions/products'
import { createSale, type SaleItem } from '@/actions/pos'
import { VARIABLE_EXPENSE_CATEGORIES, type VariableExpenseCategory } from '@/lib/variable-expense-categories'

type Phase = 'idle' | 'recording' | 'processing' | 'review' | 'submitting' | 'done' | 'error'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandData = any  // Mantido any local pra simplificar a edição inline; valida no envio

export function VoiceModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase]               = useState<Phase>('idle')
  const [recElapsed, setRecElapsed]     = useState(0)
  const [transcript, setTranscript]     = useState('')
  const [command, setCommand]           = useState<CommandData | null>(null)
  const [productMatches, setProductMatches] = useState<VoiceProductMatch[]>([])
  const [chosenProductId, setChosenProductId] = useState<string | null>(null)
  // Pra vendas (sale)
  const [saleItemsMatched, setSaleItemsMatched]   = useState<VoiceSaleItemMatched[]>([])
  const [chosenItemIds, setChosenItemIds]         = useState<(string | null)[]>([])  // 1 escolha por item, mesma ordem
  const [customerMatches, setCustomerMatches]     = useState<VoiceCustomerMatch[]>([])
  const [chosenCustomerId, setChosenCustomerId]   = useState<string | null>(null)
  const [cashSessionOpen, setCashSessionOpen]     = useState<boolean | null>(null)

  const [costUsd, setCostUsd]           = useState(0)
  const [errMsg, setErrMsg]             = useState<string | null>(null)
  const [doneMsg, setDoneMsg]           = useState<string | null>(null)

  const recorderRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimetypeRef  = useRef<string>('audio/webm')

  // Cleanup ao fechar
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch { /* noop */ }
        recorderRef.current.stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  async function startRecording() {
    setErrMsg(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mt = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
                 MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4'  :
                 ''
      mimetypeRef.current = mt || 'audio/webm'
      const r = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined)
      chunksRef.current = []
      r.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
      }
      r.start()
      recorderRef.current = r
      setPhase('recording')
      setRecElapsed(0)
      intervalRef.current = setInterval(() => setRecElapsed(s => s + 1), 1000)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Microfone bloqueado. Permita o acesso.')
      setPhase('error')
    }
  }

  async function stopRecording() {
    const r = recorderRef.current
    if (!r) return
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }

    return new Promise<void>((resolve) => {
      r.addEventListener('stop', async () => {
        const blob = new Blob(chunksRef.current, { type: mimetypeRef.current })
        chunksRef.current = []
        await sendAudio(blob)
        resolve()
      }, { once: true })
      r.stop()
    })
  }

  async function sendAudio(blob: Blob) {
    setPhase('processing')
    try {
      const base64 = await blobToBase64(blob)
      const res = await processVoiceCommand({ audioBase64: base64, mimetype: mimetypeRef.current })
      if (!res.ok) {
        setErrMsg(res.error)
        setTranscript(res.transcript ?? '')
        setPhase('error')
        return
      }
      setTranscript(res.transcript)
      setCommand(res.command)
      setProductMatches(res.productMatches ?? [])
      setChosenProductId(res.productMatches && res.productMatches.length > 0 ? res.productMatches[0].id : null)
      setSaleItemsMatched(res.saleItemsMatched ?? [])
      setChosenItemIds((res.saleItemsMatched ?? []).map(it => it.candidates[0]?.id ?? null))
      setCustomerMatches(res.customerMatches ?? [])
      setChosenCustomerId(res.customerMatches && res.customerMatches.length > 0 ? res.customerMatches[0].id : null)
      setCashSessionOpen(res.cashSessionOpen ?? null)
      setCostUsd(res.costs.totalUsd)
      if (res.command.type === 'unknown') {
        setErrMsg('Não consegui entender o comando. Tenta falar de novo, mais claro.')
        setPhase('error')
      } else {
        setPhase('review')
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Erro ao processar áudio')
      setPhase('error')
    }
  }

  async function confirmSubmit() {
    if (!command) return
    setPhase('submitting')
    setErrMsg(null)
    try {
      if (command.type === 'expense') {
        const res = await createVariableExpense({
          occurredAt:    command.occurredAt,
          amountCents:   command.amountCents,
          category:      command.category,
          description:   command.description ?? null,
          paymentMethod: command.paymentMethod ?? null,
        })
        if (!res.ok) throw new Error(res.error)
        setDoneMsg(`Despesa de R$ ${(command.amountCents / 100).toFixed(2)} lançada (${command.category}).`)
      } else if (command.type === 'stock_in') {
        if (!chosenProductId) throw new Error('Escolha um produto.')
        await createMovement({
          productId:          chosenProductId,
          type:               'entrada',
          quantity:           command.quantity,
          purchasePriceCents: command.purchasePriceCents ?? 0,
          costPriceCents:     command.purchasePriceCents ?? 0,
          salePriceCents:     command.salePriceCents     ?? 0,
          notes:              command.notes ?? '(via comando de voz)',
          origin:             'voice',
        })
        setDoneMsg(`Entrada de ${command.quantity} unidade(s) registrada.`)
      } else if (command.type === 'stock_balance') {
        if (!chosenProductId) throw new Error('Escolha um produto.')
        await adjustStock(chosenProductId, command.newQty)
        setDoneMsg(`Estoque ajustado pra ${command.newQty} unidade(s).`)
      } else if (command.type === 'sale') {
        if (!cashSessionOpen) throw new Error('Caixa fechado. Abra o caixa em /pos antes de registrar venda.')
        const items: SaleItem[] = command.items.map((it: { quantity: number; unitPriceCents?: number | null }, idx: number) => {
          const productId = chosenItemIds[idx]
          if (!productId) throw new Error(`Escolha um produto pro item ${idx + 1}.`)
          const cand = saleItemsMatched[idx]?.candidates.find(c => c.id === productId)
          const unitPrice = it.unitPriceCents ?? cand?.price_cents ?? 0
          return {
            productId,
            source:         'products',
            name:           cand?.name ?? 'Produto',
            quantity:       it.quantity,
            unitPriceCents: unitPrice,
            subtotalCents:  unitPrice * it.quantity,
          }
        })
        const subtotalCents = items.reduce((s, i) => s + i.subtotalCents, 0)
        const totalCents = command.totalCents ?? (subtotalCents - (command.discountCents ?? 0) + (command.shippingCents ?? 0))
        await createSale({
          customerId:     chosenCustomerId,
          subtotalCents,
          discountCents:  command.discountCents ?? 0,
          shippingCents:  command.shippingCents ?? 0,
          totalCents,
          paymentMethod:  command.paymentMethod ?? 'cash',
          paymentDetails: null,
          items,
          saleChannel:    command.saleChannel ?? null,
        })
        setDoneMsg(`Venda de R$ ${(totalCents / 100).toFixed(2)} registrada (${items.length} item${items.length > 1 ? 's' : ''}).`)
      }
      setPhase('done')
      // Auto-fecha após 2.5s
      setTimeout(() => onClose(), 2500)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Erro ao salvar')
      setPhase('error')
    }
  }

  function reset() {
    setPhase('idle')
    setTranscript('')
    setCommand(null)
    setProductMatches([])
    setChosenProductId(null)
    setErrMsg(null)
    setDoneMsg(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-zinc-900 sm:rounded-xl border-t sm:border border-zinc-800 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Comando por voz</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 max-h-[80vh] overflow-y-auto">
          {phase === 'idle' && (
            <IdleView onStart={startRecording} />
          )}
          {phase === 'recording' && (
            <RecordingView elapsed={recElapsed} onStop={stopRecording} />
          )}
          {phase === 'processing' && (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-400 mb-3" />
              <p className="text-sm text-zinc-300">Transcrevendo e analisando...</p>
              <p className="text-xs text-zinc-500 mt-1">~3-5 segundos</p>
            </div>
          )}
          {phase === 'review' && command && (
            <ReviewView
              transcript={transcript}
              command={command}
              setCommand={setCommand}
              productMatches={productMatches}
              chosenProductId={chosenProductId}
              setChosenProductId={setChosenProductId}
              saleItemsMatched={saleItemsMatched}
              chosenItemIds={chosenItemIds}
              setChosenItemIds={setChosenItemIds}
              customerMatches={customerMatches}
              chosenCustomerId={chosenCustomerId}
              setChosenCustomerId={setChosenCustomerId}
              cashSessionOpen={cashSessionOpen}
              costUsd={costUsd}
              onConfirm={confirmSubmit}
              onReset={reset}
            />
          )}
          {phase === 'submitting' && (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-emerald-400 mb-3" />
              <p className="text-sm text-zinc-300">Salvando...</p>
            </div>
          )}
          {phase === 'done' && (
            <div className="py-8 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-zinc-100">Pronto!</p>
              <p className="text-xs text-zinc-400 mt-1">{doneMsg}</p>
            </div>
          )}
          {phase === 'error' && (
            <div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 mb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{errMsg}</p>
                </div>
                {transcript && (
                  <p className="text-[11px] text-zinc-500 mt-2">Transcrição: &quot;{transcript}&quot;</p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
                  Fechar
                </button>
                <button onClick={reset} className="px-3 py-1.5 text-xs rounded-md bg-emerald-500 text-white hover:bg-emerald-600">
                  Tentar de novo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────

function IdleView({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-4">
      <p className="text-sm text-zinc-300 mb-1">Toque pra começar a gravar</p>
      <p className="text-xs text-zinc-500 mb-5">Diga o que quer lançar — despesa, entrada de estoque ou balanço</p>
      <button
        type="button"
        onClick={onStart}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-500/30"
      >
        <Mic className="h-8 w-8" />
      </button>
      <div className="mt-5 text-[11px] text-zinc-500 leading-relaxed text-left bg-zinc-950/50 rounded-lg p-3 border border-zinc-800">
        <p className="font-medium text-zinc-400 mb-1">Exemplos:</p>
        <ul className="space-y-0.5">
          <li>💸 &quot;200 reais de tinta hoje&quot;</li>
          <li>📦 &quot;deu entrada de 5 iPhone 13 a 1500 reais cada&quot;</li>
          <li>📊 &quot;balanço, tem 3 capinhas no estoque&quot;</li>
        </ul>
      </div>
    </div>
  )
}

function RecordingView({ elapsed, onStop }: { elapsed: number; onStop: () => void }) {
  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')
  return (
    <div className="text-center py-4">
      <p className="text-xs text-zinc-500 mb-3">Gravando...</p>
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white animate-pulse mb-3">
        <Mic className="h-8 w-8" />
      </div>
      <p className="text-2xl font-mono text-zinc-100 mb-4">{mm}:{ss}</p>
      <button
        type="button"
        onClick={onStop}
        className="mx-auto inline-flex items-center gap-2 rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
      >
        <Square className="h-4 w-4" /> Parar e processar
      </button>
    </div>
  )
}

// ── ReviewView (UI editável por tipo) ────────────────────────────────────

function ReviewView({
  transcript, command, setCommand, productMatches, chosenProductId, setChosenProductId,
  saleItemsMatched, chosenItemIds, setChosenItemIds,
  customerMatches, chosenCustomerId, setChosenCustomerId,
  cashSessionOpen,
  costUsd, onConfirm, onReset,
}: {
  transcript:           string
  command:              CommandData
  setCommand:           (c: CommandData) => void
  productMatches:       VoiceProductMatch[]
  chosenProductId:      string | null
  setChosenProductId:   (id: string | null) => void
  saleItemsMatched:     VoiceSaleItemMatched[]
  chosenItemIds:        (string | null)[]
  setChosenItemIds:     (ids: (string | null)[]) => void
  customerMatches:      VoiceCustomerMatch[]
  chosenCustomerId:     string | null
  setChosenCustomerId:  (id: string | null) => void
  cashSessionOpen:      boolean | null
  costUsd:              number
  onConfirm:            () => void
  onReset:              () => void
}) {
  const isSale = command.type === 'sale'
  const blockSave = isSale && cashSessionOpen === false

  return (
    <div>
      <div className="rounded-lg bg-zinc-950/50 border border-zinc-800 p-2.5 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Você disse</p>
        <p className="text-xs text-zinc-300 italic">&quot;{transcript}&quot;</p>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Pencil className="h-3 w-3 text-emerald-400" />
          <p className="text-[10px] uppercase tracking-wider text-emerald-400">
            {command.type === 'expense'        && 'Despesa identificada'}
            {command.type === 'stock_in'       && 'Entrada de estoque'}
            {command.type === 'stock_balance'  && 'Ajuste de balanço'}
            {command.type === 'sale'           && 'Venda identificada'}
          </p>
          {command.confidence < 0.7 && (
            <span className="ml-auto text-[10px] text-amber-400">⚠ Confira tudo</span>
          )}
        </div>

        {command.type === 'expense' && (
          <ExpenseForm command={command} setCommand={setCommand} />
        )}
        {(command.type === 'stock_in' || command.type === 'stock_balance') && (
          <StockForm
            command={command}
            setCommand={setCommand}
            productMatches={productMatches}
            chosenProductId={chosenProductId}
            setChosenProductId={setChosenProductId}
          />
        )}
        {command.type === 'sale' && (
          <SaleForm
            command={command}
            setCommand={setCommand}
            saleItemsMatched={saleItemsMatched}
            chosenItemIds={chosenItemIds}
            setChosenItemIds={setChosenItemIds}
            customerMatches={customerMatches}
            chosenCustomerId={chosenCustomerId}
            setChosenCustomerId={setChosenCustomerId}
            cashSessionOpen={cashSessionOpen}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-600">~US$ {costUsd.toFixed(4)}</span>
        <div className="flex gap-2">
          <button onClick={onReset} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
            Refazer
          </button>
          <button
            onClick={onConfirm}
            disabled={blockSave}
            className="px-4 py-1.5 text-xs rounded-md bg-emerald-500 text-white font-medium hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
            title={blockSave ? 'Caixa fechado — abra o caixa em /pos primeiro' : ''}
          >
            Confirmar e salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function ExpenseForm({ command, setCommand }: { command: CommandData; setCommand: (c: CommandData) => void }) {
  return (
    <div className="space-y-2.5">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Valor (R$)</label>
        <input
          type="number" step="0.01"
          value={(command.amountCents / 100).toFixed(2)}
          onChange={e => setCommand({ ...command, amountCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
          className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Data</label>
          <input
            type="date"
            value={command.occurredAt}
            onChange={e => setCommand({ ...command, occurredAt: e.target.value })}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Pagamento</label>
          <select
            value={command.paymentMethod ?? ''}
            onChange={e => setCommand({ ...command, paymentMethod: (e.target.value || null) as 'cash' | 'pix' | 'card' | null })}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          >
            <option value="">—</option>
            <option value="cash">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="card">Cartão</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Categoria</label>
        <select
          value={command.category}
          onChange={e => setCommand({ ...command, category: e.target.value as VariableExpenseCategory })}
          className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
        >
          {VARIABLE_EXPENSE_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.group} · {c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Descrição</label>
        <input
          type="text"
          value={command.description ?? ''}
          onChange={e => setCommand({ ...command, description: e.target.value || null })}
          placeholder="Opcional"
          className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
        />
      </div>
    </div>
  )
}

function StockForm({
  command, setCommand, productMatches, chosenProductId, setChosenProductId,
}: {
  command:           CommandData
  setCommand:        (c: CommandData) => void
  productMatches:    VoiceProductMatch[]
  chosenProductId:   string | null
  setChosenProductId: (id: string | null) => void
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">
          Produto {productMatches.length === 0 && <span className="text-amber-400">(nenhum encontrado)</span>}
        </label>
        {productMatches.length > 0 ? (
          <select
            value={chosenProductId ?? ''}
            onChange={e => setChosenProductId(e.target.value || null)}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          >
            {productMatches.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ''} — estoque: {p.stock_qty}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-zinc-500 mt-1">
            Você falou: <strong className="text-zinc-300">{command.productQuery}</strong>.
            Cadastre esse produto antes em /estoque.
          </p>
        )}
      </div>

      {command.type === 'stock_in' ? (
        <>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Quantidade</label>
            <input
              type="number" min={1}
              value={command.quantity}
              onChange={e => setCommand({ ...command, quantity: parseInt(e.target.value || '1') })}
              className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Preço de compra (R$ unidade — opcional)</label>
            <input
              type="number" step="0.01"
              value={command.purchasePriceCents != null ? (command.purchasePriceCents / 100).toFixed(2) : ''}
              onChange={e => setCommand({ ...command, purchasePriceCents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
              placeholder="Opcional"
              className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Quantidade contada (final)</label>
          <input
            type="number" min={0}
            value={command.newQty}
            onChange={e => setCommand({ ...command, newQty: parseInt(e.target.value || '0') })}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          />
          {chosenProductId && (() => {
            const p = productMatches.find(x => x.id === chosenProductId)
            if (!p) return null
            const delta = command.newQty - p.stock_qty
            return (
              <p className="text-[10px] text-zinc-500 mt-1">
                Estoque atual: <strong>{p.stock_qty}</strong> → ficará <strong>{command.newQty}</strong>
                {delta !== 0 && <span className={delta > 0 ? 'text-emerald-400' : 'text-red-400'}> ({delta > 0 ? '+' : ''}{delta})</span>}
              </p>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ── SaleForm ─────────────────────────────────────────────────────────────

function SaleForm({
  command, setCommand,
  saleItemsMatched, chosenItemIds, setChosenItemIds,
  customerMatches, chosenCustomerId, setChosenCustomerId,
  cashSessionOpen,
}: {
  command:             CommandData
  setCommand:          (c: CommandData) => void
  saleItemsMatched:    VoiceSaleItemMatched[]
  chosenItemIds:       (string | null)[]
  setChosenItemIds:    (ids: (string | null)[]) => void
  customerMatches:     VoiceCustomerMatch[]
  chosenCustomerId:    string | null
  setChosenCustomerId: (id: string | null) => void
  cashSessionOpen:     boolean | null
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = command.items ?? []

  function updateItem(idx: number, patch: Partial<{ quantity: number; unitPriceCents: number | null }>) {
    const next = items.map((it, i) => i === idx ? { ...it, ...patch } : it)
    setCommand({ ...command, items: next })
  }

  function removeItem(idx: number) {
    const next = items.filter((_, i) => i !== idx)
    setCommand({ ...command, items: next })
    setChosenItemIds(chosenItemIds.filter((_, i) => i !== idx))
  }

  function setItemId(idx: number, id: string | null) {
    const copy = [...chosenItemIds]
    copy[idx] = id
    setChosenItemIds(copy)
  }

  // Soma subtotal a partir dos itens (com fallback do price_cents do produto)
  const subtotalCents = items.reduce((acc, it, idx) => {
    const cand = saleItemsMatched[idx]?.candidates.find(c => c.id === chosenItemIds[idx])
    const unit = it.unitPriceCents ?? cand?.price_cents ?? 0
    return acc + unit * (it.quantity || 1)
  }, 0)
  const totalCents = command.totalCents ?? (subtotalCents - (command.discountCents ?? 0) + (command.shippingCents ?? 0))

  return (
    <div className="space-y-3">
      {cashSessionOpen === false && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-300">
          ⚠ Caixa fechado. Abra o caixa em <code>/pos</code> antes de confirmar.
        </div>
      )}

      {/* Itens */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
          Itens ({items.length})
        </p>
        <div className="space-y-2">
          {items.map((it, idx) => {
            const matched = saleItemsMatched[idx]
            const candidates = matched?.candidates ?? []
            return (
              <div key={idx} className="rounded-md border border-zinc-700 bg-zinc-950/50 p-2">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-zinc-500 mb-0.5">
                      Você falou: <span className="text-zinc-300">&quot;{matched?.productQuery ?? it.productQuery}&quot;</span>
                    </p>
                    {candidates.length > 0 ? (
                      <select
                        value={chosenItemIds[idx] ?? ''}
                        onChange={e => setItemId(idx, e.target.value || null)}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                      >
                        {candidates.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sku ? `(${p.sku})` : ''} — R$ {((p.price_cents ?? 0) / 100).toFixed(2)} · estoque: {p.stock_qty}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[11px] text-amber-400">Produto não encontrado no estoque.</p>
                    )}
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500">Qtd</label>
                    <input
                      type="number" min={1}
                      value={it.quantity}
                      onChange={e => updateItem(idx, { quantity: parseInt(e.target.value || '1') })}
                      className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500">Preço unit. (R$)</label>
                    <input
                      type="number" step="0.01"
                      value={it.unitPriceCents != null ? (it.unitPriceCents / 100).toFixed(2) :
                             (saleItemsMatched[idx]?.candidates.find(c => c.id === chosenItemIds[idx])?.price_cents ?? 0) / 100}
                      onChange={e => updateItem(idx, { unitPriceCents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null })}
                      className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cliente */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Cliente</label>
        {customerMatches.length > 0 ? (
          <select
            value={chosenCustomerId ?? ''}
            onChange={e => setChosenCustomerId(e.target.value || null)}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          >
            <option value="">— Consumidor final —</option>
            {customerMatches.map(c => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.whatsapp ? `· ${c.whatsapp}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-zinc-500 mt-0.5">
            {command.customerQuery
              ? <>Você falou: <strong className="text-zinc-300">{command.customerQuery}</strong>. Não achei nenhum cliente — venda vai como Consumidor Final.</>
              : 'Consumidor Final (sem cliente cadastrado)'}
          </p>
        )}
      </div>

      {/* Pagamento + canal + desconto + frete */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Pagamento</label>
          <select
            value={command.paymentMethod ?? 'cash'}
            onChange={e => setCommand({ ...command, paymentMethod: e.target.value })}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          >
            <option value="cash">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="card">Cartão</option>
            <option value="mixed">Misto</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Canal</label>
          <select
            value={command.saleChannel ?? ''}
            onChange={e => setCommand({ ...command, saleChannel: e.target.value || null })}
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          >
            <option value="">—</option>
            <option value="fisica_balcao">Balcão (loja)</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram_dm">Instagram</option>
            <option value="delivery_online">Delivery / Site</option>
            <option value="fisica_retirada">Retirada na loja</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Desconto (R$)</label>
          <input
            type="number" step="0.01" min={0}
            value={command.discountCents ? (command.discountCents / 100).toFixed(2) : ''}
            onChange={e => setCommand({ ...command, discountCents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0 })}
            placeholder="0,00"
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Frete (R$)</label>
          <input
            type="number" step="0.01" min={0}
            value={command.shippingCents ? (command.shippingCents / 100).toFixed(2) : ''}
            onChange={e => setCommand({ ...command, shippingCents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0 })}
            placeholder="0,00"
            className="w-full mt-0.5 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100"
          />
        </div>
      </div>

      {/* Total */}
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-zinc-300">Total da venda</span>
        <span className="text-base font-semibold text-emerald-300 tabular-nums">
          R$ {(totalCents / 100).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const dataUrl = reader.result as string
      const idx = dataUrl.indexOf(',')
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl)
    }
    reader.readAsDataURL(blob)
  })
}
