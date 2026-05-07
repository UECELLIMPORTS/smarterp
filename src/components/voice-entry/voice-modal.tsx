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
import { Mic, Square, X, Loader2, Check, AlertTriangle, Pencil } from 'lucide-react'
import { processVoiceCommand, type VoiceProductMatch } from '@/actions/voice-entry'
import { createVariableExpense } from '@/actions/variable-expenses'
import { createMovement } from '@/actions/stock-movements'
import { adjustStock } from '@/actions/products'
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
  costUsd, onConfirm, onReset,
}: {
  transcript:        string
  command:           CommandData
  setCommand:        (c: CommandData) => void
  productMatches:    VoiceProductMatch[]
  chosenProductId:   string | null
  setChosenProductId: (id: string | null) => void
  costUsd:           number
  onConfirm:         () => void
  onReset:           () => void
}) {
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
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-zinc-600">~US$ {costUsd.toFixed(4)}</span>
        <div className="flex gap-2">
          <button onClick={onReset} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
            Refazer
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs rounded-md bg-emerald-500 text-white font-medium hover:bg-emerald-600"
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
