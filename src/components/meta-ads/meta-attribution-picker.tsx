'use client'

/**
 * <MetaAttributionPicker>
 *
 * Picker em cascata 3 níveis: Campanha → Conjunto de Anúncio → Anúncio
 *
 * Diferente do CampaignCodePicker antigo, este componente NÃO persiste nada
 * no banco — retorna via onUpdated a atribuição completa para o pai salvar
 * junto com a venda (sales.meta_campaign_id etc.).
 *
 * Fluxo:
 *   1. Abre popover → carrega campanhas ativas da Meta API
 *   2. Usuário seleciona campanha → carrega conjuntos daquela campanha
 *   3. Usuário seleciona conjunto → carrega anúncios daquele conjunto
 *   4. Pode aplicar em qualquer nível (só campanha, ou + conjunto, ou tudo)
 */

import { useState } from 'react'
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
  current:    MetaAttribution | null
  origin:     string | null
  onUpdated:  (attr: MetaAttribution | null) => void
  compact?:   boolean
}

export function MetaAttributionPicker({ current, origin, onUpdated, compact = false }: Props) {
  const [open, setOpen] = useState(false)

  // Dados carregados em cascata
  const [campaigns, setCampaigns]   = useState<MetaAdsCampaign[]>([])
  const [adSets, setAdSets]         = useState<MetaAdsAdSet[]>([])
  const [ads, setAds]               = useState<MetaAdsAd[]>([])

  // Seleções dentro do picker
  const [selCampaign, setSelCampaign] = useState<{ id: string; name: string } | null>(null)
  const [selAdSet, setSelAdSet]       = useState<{ id: string; name: string } | null>(null)
  const [selAd, setSelAd]             = useState<{ id: string; name: string } | null>(null)

  // Loading por nível
  const [loadingCampaigns, setLoadingCampaigns] = useState(false)
  const [loadingAdSets, setLoadingAdSets]       = useState(false)
  const [loadingAds, setLoadingAds]             = useState(false)

  const isMetaOrigin = origin ? META_ORIGINS.includes(origin) : false
  if (!isMetaOrigin) return null

  async function openPicker() {
    setOpen(true)
    setSelCampaign(null); setSelAdSet(null); setSelAd(null)
    setAdSets([]); setAds([])

    if (campaigns.length > 0) return // já carregado

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
      const list = await fetchAdSetsForCampaign(id)
      setAdSets(list)
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
      const list = await fetchAdsForAdSet(id)
      setAds(list)
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

  function clear() {
    onUpdated(null)
  }

  // ── Chip quando atribuição já está definida ────────────────────────────────
  if (current) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono font-bold ${compact ? 'text-[10px]' : 'text-[11px]'}`}
          style={{ background: 'rgba(255,170,0,.15)', color: '#F59E0B' }}>
          <Tag className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[120px]" title={current.campaignName}>{current.campaignName}</span>
          {current.adsetName && (
            <>
              <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
              <span className="truncate max-w-[100px]" title={current.adsetName}>{current.adsetName}</span>
            </>
          )}
          {current.adName && (
            <>
              <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
              <span className="truncate max-w-[100px]" title={current.adName}>{current.adName}</span>
            </>
          )}
        </div>
        <button onClick={openPicker} title="Trocar atribuição"
          className="p-0.5 opacity-50 hover:opacity-100">
          <Pencil className="h-3 w-3" style={{ color: '#CBD5E1' }} />
        </button>
        <button onClick={clear} title="Remover atribuição"
          className="p-0.5 opacity-50 hover:opacity-100">
          <X className="h-3 w-3" style={{ color: '#EF4444' }} />
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

  // ── Botão inicial (sem atribuição) ─────────────────────────────────────────
  return (
    <div className="relative">
      <button
        onClick={openPicker}
        className={`inline-flex items-center gap-1.5 rounded-md border font-bold transition-colors hover:bg-white/5 ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}
        style={{ borderColor: 'rgba(34,197,94,.3)', color: '#22C55E', background: 'rgba(34,197,94,.05)' }}
      >
        <Tag className="h-3.5 w-3.5" />
        Definir atribuição Meta Ads
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

// ── Popover interno ────────────────────────────────────────────────────────

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
  return (
    <div
      className="absolute z-40 mt-1 w-80 rounded-xl border shadow-2xl overflow-hidden"
      style={{ background: '#1B2638', borderColor: '#2A3650', right: 0 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: '#2A3650' }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
          Atribuição Meta Ads
        </span>
        <button onClick={onClose} className="opacity-50 hover:opacity-100">
          <X className="h-3.5 w-3.5" style={{ color: '#F8FAFC' }} />
        </button>
      </div>

      <div className="max-h-[340px] overflow-y-auto">

        {/* ── Nível 1: Campanhas ────────────────────────────────────────── */}
        <SectionHeader color="#F59E0B" bg="rgba(255,170,0,.05)" label="Campanha" />
        {loadingCampaigns ? (
          <LoadingRow />
        ) : campaigns.length === 0 ? (
          <EmptyRow text="Nenhuma campanha ativa/pausada encontrada" />
        ) : (
          campaigns.map(c => (
            <ItemRow
              key={c.id}
              selected={selCampaign?.id === c.id}
              onClick={() => onCampaign(c.id, c.name)}
              label={c.name}
              badge={c.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
              badgeColor={c.status === 'ACTIVE' ? '#10B981' : '#F59E0B'}
            />
          ))
        )}

        {/* ── Nível 2: Conjuntos (só aparece após campanha selecionada) ─── */}
        {selCampaign && (
          <>
            <div className="border-t" style={{ borderColor: '#2A3650' }} />
            <SectionHeader color="#60A5FA" bg="rgba(96,165,250,.05)" label="Conjunto de Anúncio" />
            {loadingAdSets ? (
              <LoadingRow />
            ) : adSets.length === 0 ? (
              <EmptyRow text="Nenhum conjunto encontrado" />
            ) : (
              adSets.map(s => (
                <ItemRow
                  key={s.id}
                  selected={selAdSet?.id === s.id}
                  onClick={() => onAdSet(s.id, s.name)}
                  label={s.name}
                  badge={s.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}
                  badgeColor={s.status === 'ACTIVE' ? '#10B981' : '#F59E0B'}
                />
              ))
            )}
          </>
        )}

        {/* ── Nível 3: Anúncios (só aparece após conjunto selecionado) ─── */}
        {selAdSet && (
          <>
            <div className="border-t" style={{ borderColor: '#2A3650' }} />
            <SectionHeader color="#A78BFA" bg="rgba(167,139,250,.05)" label="Anúncio / Criativo" />
            {loadingAds ? (
              <LoadingRow />
            ) : ads.length === 0 ? (
              <EmptyRow text="Nenhum anúncio encontrado" />
            ) : (
              ads.map(a => (
                <ItemRow
                  key={a.id}
                  selected={selAd?.id === a.id}
                  onClick={() => onAd(a.id, a.name)}
                  label={a.name}
                  badge={a.status === 'ACTIVE' ? 'Ativo' : 'Pausado'}
                  badgeColor={a.status === 'ACTIVE' ? '#10B981' : '#F59E0B'}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Footer: botão Aplicar */}
      <div className="border-t px-3 py-2.5 flex items-center justify-between gap-2" style={{ borderColor: '#2A3650' }}>
        <p className="text-[10px]" style={{ color: '#64748B' }}>
          {selCampaign
            ? selAd
              ? 'Campanha + Conjunto + Anúncio'
              : selAdSet
                ? 'Campanha + Conjunto'
                : 'Só campanha (sem conjunto/anúncio)'
            : 'Selecione uma campanha'
          }
        </p>
        <button
          onClick={onApply}
          disabled={!selCampaign}
          className="rounded-md px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-40 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #22C55E, #10B981)' }}
        >
          Aplicar
        </button>
      </div>
    </div>
  )
}

// ── Sub-componentes de UI ──────────────────────────────────────────────────

function SectionHeader({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider sticky top-0"
      style={{ color, background: bg }}>
      {label}
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-3">
      <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: '#64748B' }} />
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="px-3 py-2 text-[10px]" style={{ color: '#64748B' }}>{text}</p>
  )
}

function ItemRow({
  selected, onClick, label, badge, badgeColor,
}: {
  selected:   boolean
  onClick:    () => void
  label:      string
  badge:      string
  badgeColor: string
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5"
      style={selected ? { background: 'rgba(255,255,255,.06)' } : undefined}
    >
      <Check
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: '#22C55E', opacity: selected ? 1 : 0 }}
      />
      <span className="flex-1 text-[11px] truncate" style={{ color: '#F8FAFC' }} title={label}>
        {label}
      </span>
      <span className="text-[8px] font-bold px-1 rounded uppercase shrink-0"
        style={{ background: `${badgeColor}22`, color: badgeColor }}>
        {badge}
      </span>
    </button>
  )
}
