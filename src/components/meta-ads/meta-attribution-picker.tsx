'use client'

/**
 * <MetaAttributionPicker>
 *
 * Picker em cascata 3 níveis: Campanha → Conjunto de Anúncio → Anúncio
 *
 * Só aparece quando origin é instagram_pago ou facebook.
 * Retorna via onUpdated — não persiste nada no banco diretamente.
 */

import { useState, useEffect, useRef } from 'react'
import { Tag, ChevronRight, Check, Loader2, Pencil, X } from 'lucide-react'
import {
  fetchMetaAdsCampaigns,
  fetchAdSetsForCampaign,
  fetchAdsForAdSet,
  type MetaAdsCampaign,
  type MetaAdsAdSet,
  type MetaAdsAd,
  type MetaAttribution,
} from '@/actions/meta-ads'

const META_ORIGINS = ['instagram_pago', 'facebook']

type Props = {
  current:   MetaAttribution | null
  origin:    string | null
  onUpdated: (attr: MetaAttribution | null) => void
  compact?:  boolean
}

export function MetaAttributionPicker({ current, origin, onUpdated, compact = false }: Props) {
  const [open, setOpen] = useState(false)

  const [campaigns, setCampaigns] = useState<MetaAdsCampaign[]>([])
  const [adSets, setAdSets]       = useState<MetaAdsAdSet[]>([])
  const [ads, setAds]             = useState<MetaAdsAd[]>([])

  const [selCampaign, setSelCampaign] = useState<{ id: string; name: string } | null>(null)
  const [selAdSet, setSelAdSet]       = useState<{ id: string; name: string } | null>(null)
  const [selAd, setSelAd]             = useState<{ id: string; name: string } | null>(null)

  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [loadingAdSets, setLoadingAdSets]       = useState(false)
  const [loadingAds, setLoadingAds]             = useState(false)

  const isMetaOrigin = origin ? META_ORIGINS.includes(origin) : false
  if (!isMetaOrigin) return null

  async function openPicker() {
    setOpen(true)
    setSelCampaign(null); setSelAdSet(null); setSelAd(null)
    setAdSets([]); setAds([])

    if (campaigns.length > 0) return

    setLoadingCampaigns(true)
    try {
      const list = await fetchMetaAdsCampaigns('30d')
      setCampaigns(
        list
          .filter(c => c.status === 'ACTIVE' || c.status === 'PAUSED')
          .sort((a, b) => {
            if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1
            return b.spendCents - a.spendCents
          })
      )
    } catch {
      setCampaigns([])
    } finally {
      setLoadingCampaigns(false)
    }
  }

  async function selectCampaign(id: string, name: string) {
    setSelCampaign({ id, name })
    setSelAdSet(null); setSelAd(null)
    setAds([])

    setLoadingAdSets(true)
    try {
      setAdSets(await fetchAdSetsForCampaign(id))
    } catch {
      setAdSets([])
    } finally {
      setLoadingAdSets(false)
    }
  }

  async function selectAdSet(id: string, name: string) {
    setSelAdSet({ id, name })
    setSelAd(null)

    setLoadingAds(true)
    try {
      setAds(await fetchAdsForAdSet(id))
    } catch {
      setAds([])
    } finally {
      setLoadingAds(false)
    }
  }

  function selectAd(id: string, name: string) {
    setSelAd({ id, name })
  }

  function apply() {
    if (!selCampaign) return
    onUpdated({
      campaignId:   selCampaign.id,
      campaignName: selCampaign.name,
      adsetId:      selAdSet?.id   ?? null,
      adsetName:    selAdSet?.name ?? null,
      adId:         selAd?.id      ?? null,
      adName:       selAd?.name    ?? null,
    })
    setOpen(false)
  }

  // ── Atribuição definida — mostra resumo vertical ──────────────────────────
  if (current) {
    return (
      <div className="w-full space-y-1.5">
        {/* Linhas de resumo */}
        <AttributionLine
          color="#F59E0B"
          label="Campanha"
          name={current.campaignName}
          compact={compact}
        />
        {current.adsetName && (
          <AttributionLine
            color="#60A5FA"
            label="Conjunto"
            name={current.adsetName}
            compact={compact}
          />
        )}
        {current.adName && (
          <AttributionLine
            color="#A78BFA"
            label="Anúncio"
            name={current.adName}
            compact={compact}
          />
        )}

        {/* Ações */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={openPicker}
            title="Trocar atribuição"
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-white/5"
            style={{ color: '#94A3B8', border: '1px solid #2A3650' }}
          >
            <Pencil className="h-2.5 w-2.5" />
            Trocar
          </button>
          <button
            onClick={() => onUpdated(null)}
            title="Remover atribuição"
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-red-500/10"
            style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,.25)' }}
          >
            <X className="h-2.5 w-2.5" />
            Remover
          </button>
        </div>

        {open && (
          <PickerPopover
            campaigns={campaigns} adSets={adSets} ads={ads}
            loadingCampaigns={loadingCampaigns} loadingAdSets={loadingAdSets} loadingAds={loadingAds}
            selCampaign={selCampaign} selAdSet={selAdSet} selAd={selAd}
            onCampaign={selectCampaign} onAdSet={selectAdSet} onAd={selectAd}
            onApply={apply} onClose={() => setOpen(false)}
          />
        )}
      </div>
    )
  }

  // ── Sem atribuição — botão para abrir ─────────────────────────────────────
  return (
    <div className="relative w-full">
      <button
        onClick={openPicker}
        className="w-full flex items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition-colors hover:bg-white/5"
        style={{ borderColor: 'rgba(34,197,94,.3)', color: '#22C55E', background: 'rgba(34,197,94,.04)' }}
      >
        <Tag className="h-3.5 w-3.5 shrink-0" />
        Vincular campanha Meta Ads
      </button>
      {open && (
        <PickerPopover
          campaigns={campaigns} adSets={adSets} ads={ads}
          loadingCampaigns={loadingCampaigns} loadingAdSets={loadingAdSets} loadingAds={loadingAds}
          selCampaign={selCampaign} selAdSet={selAdSet} selAd={selAd}
          onCampaign={selectCampaign} onAdSet={selectAdSet} onAd={selectAd}
          onApply={apply} onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// ── Linha de atribuição ────────────────────────────────────────────────────

function AttributionLine({ color, label, name, compact }: {
  color:   string
  label:   string
  name:    string
  compact: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className="shrink-0 text-[9px] font-bold uppercase tracking-wider w-14 text-right"
        style={{ color: `${color}99` }}
      >
        {label}
      </span>
      <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-30" style={{ color }} />
      <span
        className={`truncate font-semibold ${compact ? 'text-[10px]' : 'text-[11px]'}`}
        style={{ color }}
        title={name}
      >
        {name}
      </span>
    </div>
  )
}

// ── Popover ────────────────────────────────────────────────────────────────

type PopoverProps = {
  campaigns:        MetaAdsCampaign[]
  adSets:           MetaAdsAdSet[]
  ads:              MetaAdsAd[]
  loadingCampaigns: boolean
  loadingAdSets:    boolean
  loadingAds:       boolean
  selCampaign:      { id: string; name: string } | null
  selAdSet:         { id: string; name: string } | null
  selAd:            { id: string; name: string } | null
  onCampaign:       (id: string, name: string) => void
  onAdSet:          (id: string, name: string) => void
  onAd:             (id: string, name: string) => void
  onApply:          () => void
  onClose:          () => void
}

function PickerPopover({
  campaigns, adSets, ads,
  loadingCampaigns, loadingAdSets, loadingAds,
  selCampaign, selAdSet, selAd,
  onCampaign, onAdSet, onAd, onApply, onClose,
}: PopoverProps) {
  // Fecha ao clicar fora
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <>
      {/* Overlay escuro em mobile */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
      />

      {/* Painel — bottom sheet em mobile, popover em desktop */}
      <div
        ref={ref}
        className={[
          'z-50 rounded-t-2xl md:rounded-xl border shadow-2xl overflow-hidden',
          // Mobile: fixo na base da tela, largura total
          'fixed bottom-0 left-0 right-0 md:static md:bottom-auto md:left-auto md:right-auto',
          // Desktop: posicionamento relativo ao botão
          'md:absolute md:mt-2 md:w-80',
        ].join(' ')}
        style={{ background: '#1B2638', borderColor: '#2A3650' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#2A3650' }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
            Atribuição Meta Ads
          </span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/5"
          >
            <X className="h-4 w-4" style={{ color: '#94A3B8' }} />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>

          {/* ── Nível 1: Campanhas ── */}
          <SectionHeader color="#F59E0B" bg="rgba(255,170,0,.05)" label="Campanha" />
          {loadingCampaigns ? <LoadingRow /> : campaigns.length === 0
            ? <EmptyRow text="Nenhuma campanha ativa/pausada" />
            : campaigns.map(c => (
              <ItemRow
                key={c.id}
                selected={selCampaign?.id === c.id}
                onClick={() => onCampaign(c.id, c.name)}
                label={c.name}
                badge={c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                badgeColor={c.status === 'ACTIVE' ? '#10B981' : '#F59E0B'}
              />
            ))
          }

          {/* ── Nível 2: Conjuntos ── */}
          {selCampaign && (
            <>
              <div className="border-t" style={{ borderColor: '#2A3650' }} />
              <SectionHeader color="#60A5FA" bg="rgba(96,165,250,.05)" label="Conjunto de Anúncio" />
              {loadingAdSets ? <LoadingRow /> : adSets.length === 0
                ? <EmptyRow text="Nenhum conjunto encontrado" />
                : adSets.map(s => (
                  <ItemRow
                    key={s.id}
                    selected={selAdSet?.id === s.id}
                    onClick={() => onAdSet(s.id, s.name)}
                    label={s.name}
                    badge={s.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}
                    badgeColor={s.status === 'ACTIVE' ? '#10B981' : '#F59E0B'}
                  />
                ))
              }
            </>
          )}

          {/* ── Nível 3: Anúncios ── */}
          {selAdSet && (
            <>
              <div className="border-t" style={{ borderColor: '#2A3650' }} />
              <SectionHeader color="#A78BFA" bg="rgba(167,139,250,.05)" label="Anúncio / Criativo" />
              {loadingAds ? <LoadingRow /> : ads.length === 0
                ? <EmptyRow text="Nenhum anúncio encontrado" />
                : ads.map(a => (
                  <ItemRow
                    key={a.id}
                    selected={selAd?.id === a.id}
                    onClick={() => onAd(a.id, a.name)}
                    label={a.name}
                    badge={a.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}
                    badgeColor={a.status === 'ACTIVE' ? '#10B981' : '#F59E0B'}
                  />
                ))
              }
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex items-center justify-between gap-3" style={{ borderColor: '#2A3650' }}>
          <p className="text-[11px]" style={{ color: '#64748B' }}>
            {selCampaign
              ? selAd    ? 'Campanha + Conjunto + Anúncio'
              : selAdSet ? 'Campanha + Conjunto'
                         : 'Só a campanha'
              : 'Selecione uma campanha'
            }
          </p>
          <button
            onClick={onApply}
            disabled={!selCampaign}
            className="rounded-lg px-4 py-2 text-xs font-bold text-black disabled:opacity-40 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #22C55E, #10B981)' }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function SectionHeader({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider sticky top-0"
      style={{ color, background: bg }}>
      {label}
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#64748B' }} />
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{text}</p>
  )
}

function ItemRow({ selected, onClick, label, badge, badgeColor }: {
  selected:   boolean
  onClick:    () => void
  label:      string
  badge:      string
  badgeColor: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 active:bg-white/10"
      style={selected ? { background: 'rgba(255,255,255,.06)' } : undefined}
    >
      <div
        className="h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center"
        style={{
          borderColor: selected ? '#22C55E' : '#2A3650',
          background:  selected ? '#22C55E' : 'transparent',
        }}
      >
        {selected && <Check className="h-2.5 w-2.5 text-black" />}
      </div>
      <span className="flex-1 text-xs truncate" style={{ color: '#F8FAFC' }} title={label}>
        {label}
      </span>
      <span
        className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
        style={{ background: `${badgeColor}22`, color: badgeColor }}
      >
        {badge}
      </span>
    </button>
  )
}
