'use client'

/**
 * <CampaignCodePicker>
 *
 * Picker inline que aparece quando um cliente tem origem = instagram_pago ou
 * facebook e ainda não tem campaign_code preenchido.
 *
 * Mostra sugestões de 2 fontes:
 *   - Campanhas do Meta Ads (nome → código derivado)
 *   - Códigos já usados por outros clientes (histórico)
 * + Opção de digitar um código customizado.
 *
 * Usado no POS e em qualquer outro fluxo que selecione cliente.
 */

import { useState } from 'react'
import { Tag, Check, Loader2, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { updateCustomerCampaignCode } from '@/actions/pos'
import {
  getCampaignCodeSuggestions,
  type CampaignCodeSuggestion,
} from '@/actions/meta-ads'

const META_ORIGINS = ['instagram_pago', 'facebook']

type Props = {
  customerId:  string
  currentCode: string | null
  origin:      string | null
  onUpdated?:  (code: string | null) => void
  compact?:    boolean     // layout mais compacto (pra sidebar do POS)
}

export function CampaignCodePicker({
  customerId, currentCode, origin, onUpdated, compact = false,
}: Props) {
  type LoadState = { status: 'idle' | 'loading' | 'loaded'; suggestions: CampaignCodeSuggestion[] }
  const [open, setOpen]               = useState(false)
  const [saving, setSaving]           = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [loadState, setLoadState]     = useState<LoadState>({ status: 'idle', suggestions: [] })

  // Se origem não é Meta, não mostra nada
  const isMetaOrigin = origin ? META_ORIGINS.includes(origin) : false
  if (!isMetaOrigin) return null

  async function openPicker() {
    setOpen(true)
    if (loadState.status !== 'idle') return   // já carregado ou carregando
    setLoadState(s => ({ ...s, status: 'loading' }))
    try {
      const list = await getCampaignCodeSuggestions()
      setLoadState({ status: 'loaded', suggestions: list })
    } catch {
      setLoadState({ status: 'loaded', suggestions: [] })
    }
  }

  function closePicker() {
    setOpen(false)
    setCustomInput('')
  }

  async function apply(code: string) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return
    setSaving(true)
    try {
      await updateCustomerCampaignCode(customerId, normalized)
      toast.success(`Código "${normalized}" atribuído ao cliente`)
      onUpdated?.(normalized)
      setOpen(false)
      setCustomInput('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    setSaving(true)
    try {
      await updateCustomerCampaignCode(customerId, '')
      toast.success('Código removido')
      onUpdated?.(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  // Estado 1: já tem código → chip compacto com trocar/remover
  if (currentCode) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono font-bold ${compact ? 'text-[10px]' : 'text-[11px]'}`}
          style={{ background: 'rgba(255,170,0,.15)', color: '#FFAA00' }}>
          <Tag className="h-3 w-3" />
          {currentCode}
        </span>
        <button
          onClick={openPicker}
          disabled={saving}
          title="Trocar código"
          className="p-0.5 opacity-50 hover:opacity-100 disabled:opacity-30"
        >
          <Pencil className="h-3 w-3" style={{ color: '#8AA8C8' }} />
        </button>
        <button
          onClick={clear}
          disabled={saving}
          title="Remover código"
          className="p-0.5 opacity-50 hover:opacity-100 disabled:opacity-30"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" style={{ color: '#FF4D6D' }} />}
        </button>
        {open && (
          <PickerPopover
            loading={loadState.status === 'loading'}
            suggestions={loadState.suggestions}
            customInput={customInput}
            onCustomChange={setCustomInput}
            onPick={apply}
            saving={saving}
            onClose={closePicker}
          />
        )}
      </div>
    )
  }

  // Estado 2: sem código, origem Meta → botão pra abrir picker
  return (
    <div className="relative">
      <button
        onClick={openPicker}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 rounded-md border font-bold transition-colors hover:bg-white/5 disabled:opacity-40 ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
        style={{ borderColor: 'rgba(0,229,255,.3)', color: '#00E5FF', background: 'rgba(0,229,255,.05)' }}
      >
        <Tag className="h-3.5 w-3.5" />
        Definir código da campanha
      </button>
      {open && (
        <PickerPopover
          loading={loadState.status === 'loading'}
          suggestions={loadState.suggestions}
          customInput={customInput}
          onCustomChange={setCustomInput}
          onPick={apply}
          saving={saving}
          onClose={closePicker}
        />
      )}
    </div>
  )
}

function PickerPopover({
  loading, suggestions, customInput, onCustomChange, onPick, saving, onClose,
}: {
  loading:        boolean
  suggestions:    CampaignCodeSuggestion[]
  customInput:    string
  onCustomChange: (v: string) => void
  onPick:         (code: string) => void
  saving:         boolean
  onClose:        () => void
}) {
  const metas     = suggestions.filter(s => s.source === 'meta')
  const histories = suggestions.filter(s => s.source === 'history')

  return (
    <div
      className="absolute z-40 mt-1 w-72 rounded-xl border shadow-2xl overflow-hidden"
      style={{ background: '#111827', borderColor: '#1E2D45', right: 0 }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#1E2D45' }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5A7A9A' }}>
          Código da campanha
        </span>
        <button onClick={onClose} className="text-muted hover:text-coral">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#00E5FF' }} />
        </div>
      ) : (
        <div className="max-h-[280px] overflow-y-auto">
          {/* Seção: Campanhas Meta */}
          {metas.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider sticky top-0"
                style={{ color: '#FFAA00', background: 'rgba(255,170,0,.05)' }}>
                Campanhas Meta Ads
              </div>
              {metas.map(s => (
                <button
                  key={`meta-${s.code}`}
                  onClick={() => onPick(s.code)}
                  disabled={saving}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5 mt-0.5 opacity-0 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-mono font-bold" style={{ color: '#FFAA00' }}>{s.code}</span>
                      {s.status === 'ACTIVE' && (
                        <span className="text-[8px] font-bold px-1 rounded uppercase" style={{ background: 'rgba(0,255,148,.15)', color: '#00FF94' }}>
                          Ativa
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] truncate mt-0.5" style={{ color: '#8AA8C8' }}>{s.campaignName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Seção: Histórico */}
          {histories.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider sticky top-0"
                style={{ color: '#8AA8C8', background: 'rgba(138,168,200,.05)' }}>
                Já usados
              </div>
              {histories.map(s => (
                <button
                  key={`hist-${s.code}`}
                  onClick={() => onPick(s.code)}
                  disabled={saving}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5 opacity-0 shrink-0" />
                  <span className="text-xs font-mono" style={{ color: '#E8F0FE' }}>{s.code}</span>
                </button>
              ))}
            </div>
          )}

          {/* Seção: Digitar novo */}
          <div className="border-t" style={{ borderColor: '#1E2D45' }}>
            <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider"
              style={{ color: '#00E5FF', background: 'rgba(0,229,255,.05)' }}>
              Outro código
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                value={customInput}
                onChange={e => onCustomChange(e.target.value.toUpperCase())}
                placeholder="Ex: HJ-VAI-1"
                maxLength={40}
                className="flex-1 rounded border px-2 py-1 text-xs font-mono outline-none"
                style={{ background: '#0D1320', borderColor: '#1E2D45', color: '#E8F0FE' }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && customInput.trim()) onPick(customInput.trim())
                }}
              />
              <button
                onClick={() => customInput.trim() && onPick(customInput.trim())}
                disabled={saving || !customInput.trim()}
                className="rounded px-2 py-1 text-[10px] font-bold text-black disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #00E5FF, #00FF94)' }}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
              </button>
            </div>
          </div>

          {metas.length === 0 && histories.length === 0 && !loading && (
            <p className="px-3 py-4 text-[11px] text-center" style={{ color: '#5A7A9A' }}>
              Nenhuma sugestão — digite o código acima
            </p>
          )}
        </div>
      )}
    </div>
  )
}
