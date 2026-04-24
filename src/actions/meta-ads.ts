'use server'

/**
 * Meta Ads API — integração com Meta Graph API v19.0
 *
 * Funções principais:
 *   - saveMetaAdsCredentials()       → salva/atualiza credenciais do tenant
 *   - getMetaAdsCredentials()        → retorna credenciais (sem expor access_token ao client)
 *   - testMetaAdsConnection()        → valida o token fazendo chamada simples
 *   - fetchMetaAdsInsights()         → gasto/impressões/cliques agregados
 *   - fetchMetaAdsCampaigns()        → lista de campanhas com métricas
 *
 * Tudo roda server-side. Access token nunca vai pro client.
 */

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'
import { revalidatePath } from 'next/cache'

const META_API_VERSION = 'v19.0'
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// ── Types ──────────────────────────────────────────────────────────────────

export type MetaAdsCredentialsInput = {
  appId:        string
  appSecret:    string
  accessToken:  string
  adAccountId:  string
  businessId?:  string
}

export type MetaAdsCredentialsSafe = {
  appId:          string
  adAccountId:    string
  businessId:     string | null
  tokenExpiresAt: string | null
  lastSyncAt:     string | null
  lastError:      string | null
  hasToken:       boolean
  createdAt:      string
  updatedAt:      string
}

export type MetaAdsInsights = {
  spendCents:    number
  impressions:   number
  clicks:        number
  reach:         number
  ctr:           number       // %
  cpmCents:      number       // custo por 1000 impressões
  cpcCents:      number       // custo por clique
  frequency:     number
  dateStart:     string
  dateEnd:       string
}

export type MetaAdsCampaign = {
  id:           string
  name:         string
  status:       string        // ACTIVE, PAUSED, DELETED…
  objective:    string | null
  spendCents:   number
  impressions:  number
  clicks:       number
  ctr:          number
  cpcCents:     number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toCents(strValue: string | number | undefined | null): number {
  if (strValue === null || strValue === undefined || strValue === '') return 0
  const n = typeof strValue === 'string' ? parseFloat(strValue) : strValue
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

function toNumber(strValue: string | number | undefined | null): number {
  if (strValue === null || strValue === undefined || strValue === '') return 0
  const n = typeof strValue === 'string' ? parseFloat(strValue) : strValue
  return isNaN(n) ? 0 : n
}

async function metaApi<T>(path: string, params: Record<string, string>, accessToken: string): Promise<T> {
  const url = new URL(`${META_BASE}${path}`)
  url.searchParams.set('access_token', accessToken)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  const body = await res.json().catch(() => ({}))

  if (!res.ok || body.error) {
    const msg = body.error?.message || `HTTP ${res.status}`
    const type = body.error?.type ? ` (${body.error.type})` : ''
    throw new Error(`Meta API: ${msg}${type}`)
  }
  return body as T
}

// ── Credentials CRUD ───────────────────────────────────────────────────────

export async function saveMetaAdsCredentials(input: MetaAdsCredentialsInput): Promise<{ ok: true }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // Validação básica
  if (!input.appId.trim())        throw new Error('App ID é obrigatório')
  if (!input.appSecret.trim())    throw new Error('App Secret é obrigatório')
  if (!input.accessToken.trim())  throw new Error('Access Token é obrigatório')
  if (!input.adAccountId.trim())  throw new Error('Ad Account ID é obrigatório')
  if (!input.adAccountId.startsWith('act_')) {
    throw new Error('Ad Account ID deve começar com "act_" (ex: act_1234567890)')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { error } = await sb
    .from('meta_ads_credentials')
    .upsert(
      {
        tenant_id:     tenantId,
        app_id:        input.appId.trim(),
        app_secret:    input.appSecret.trim(),
        access_token:  input.accessToken.trim(),
        ad_account_id: input.adAccountId.trim(),
        business_id:   input.businessId?.trim() || null,
        updated_at:    new Date().toISOString(),
        last_error:    null,
      },
      { onConflict: 'tenant_id' },
    )

  if (error) throw new Error(`Erro ao salvar: ${error.message}`)

  revalidatePath('/meta-ads')
  revalidatePath('/meta-ads/configuracoes')
  return { ok: true }
}

export async function getMetaAdsCredentials(): Promise<MetaAdsCredentialsSafe | null> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data } = await sb
    .from('meta_ads_credentials')
    .select('app_id, ad_account_id, business_id, token_expires_at, last_sync_at, last_error, access_token, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) return null

  return {
    appId:          data.app_id,
    adAccountId:    data.ad_account_id,
    businessId:     data.business_id,
    tokenExpiresAt: data.token_expires_at,
    lastSyncAt:     data.last_sync_at,
    lastError:      data.last_error,
    hasToken:       !!data.access_token,
    createdAt:      data.created_at,
    updatedAt:      data.updated_at,
  }
}

export async function deleteMetaAdsCredentials(): Promise<{ ok: true }> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { error } = await sb
    .from('meta_ads_credentials')
    .delete()
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
  revalidatePath('/meta-ads')
  revalidatePath('/meta-ads/configuracoes')
  return { ok: true }
}

// ── Internal: lê credenciais completas (com access_token) pra uso nas chamadas
async function readCredentialsInternal(): Promise<{ accessToken: string; adAccountId: string } | null> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data } = await sb
    .from('meta_ads_credentials')
    .select('access_token, ad_account_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!data) return null
  return { accessToken: data.access_token, adAccountId: data.ad_account_id }
}

async function recordSync(success: boolean, error?: string) {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  await sb
    .from('meta_ads_credentials')
    .update({
      last_sync_at: success ? new Date().toISOString() : undefined,
      last_error:   success ? null : (error?.slice(0, 500) ?? 'Erro desconhecido'),
      updated_at:   new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
}

// ── Test connection ────────────────────────────────────────────────────────

export async function testMetaAdsConnection(): Promise<{ ok: boolean; message: string; accountName?: string }> {
  const creds = await readCredentialsInternal()
  if (!creds) return { ok: false, message: 'Configure suas credenciais primeiro' }

  try {
    const res = await metaApi<{ id: string; name: string; account_status: number; currency: string }>(
      `/${creds.adAccountId}`,
      { fields: 'id,name,account_status,currency' },
      creds.accessToken,
    )
    await recordSync(true)
    return {
      ok:          true,
      message:     `Conectado a "${res.name}" (${res.currency})`,
      accountName: res.name,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    await recordSync(false, msg)
    return { ok: false, message: msg }
  }
}

// ── Fetch insights ─────────────────────────────────────────────────────────

export type MetaAdsPeriod = '7d' | '30d' | '90d' | 'today' | 'yesterday'

function periodToRange(period: MetaAdsPeriod): { since: string; until: string } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  if (period === 'today')     return { since: today, until: today }
  if (period === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    const ys = y.toISOString().slice(0, 10)
    return { since: ys, until: ys }
  }

  const days = period === '7d' ? 6 : period === '30d' ? 29 : 89
  const start = new Date(now); start.setDate(start.getDate() - days)
  return { since: start.toISOString().slice(0, 10), until: today }
}

export async function fetchMetaAdsInsights(period: MetaAdsPeriod = '30d'): Promise<MetaAdsInsights | null> {
  const creds = await readCredentialsInternal()
  if (!creds) return null

  const range = periodToRange(period)

  try {
    type InsightRow = {
      spend?: string; impressions?: string; clicks?: string; reach?: string
      ctr?: string; cpm?: string; cpc?: string; frequency?: string
      date_start?: string; date_stop?: string
    }
    const res = await metaApi<{ data: InsightRow[] }>(
      `/${creds.adAccountId}/insights`,
      {
        fields:     'spend,impressions,clicks,reach,ctr,cpm,cpc,frequency',
        time_range: JSON.stringify(range),
        level:      'account',
      },
      creds.accessToken,
    )
    await recordSync(true)

    const row = res.data[0]
    if (!row) {
      return {
        spendCents: 0, impressions: 0, clicks: 0, reach: 0,
        ctr: 0, cpmCents: 0, cpcCents: 0, frequency: 0,
        dateStart: range.since, dateEnd: range.until,
      }
    }

    return {
      spendCents:  toCents(row.spend),
      impressions: toNumber(row.impressions),
      clicks:      toNumber(row.clicks),
      reach:       toNumber(row.reach),
      ctr:         toNumber(row.ctr),
      cpmCents:    toCents(row.cpm),
      cpcCents:    toCents(row.cpc),
      frequency:   toNumber(row.frequency),
      dateStart:   row.date_start ?? range.since,
      dateEnd:     row.date_stop  ?? range.until,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    await recordSync(false, msg)
    throw err
  }
}

// ── Fetch campaigns ────────────────────────────────────────────────────────

export async function fetchMetaAdsCampaigns(period: MetaAdsPeriod = '30d'): Promise<MetaAdsCampaign[]> {
  const creds = await readCredentialsInternal()
  if (!creds) return []

  const range = periodToRange(period)

  try {
    type CampaignRow = {
      id: string; name: string; status: string; objective?: string
      insights?: {
        data?: Array<{ spend?: string; impressions?: string; clicks?: string; ctr?: string; cpc?: string }>
      }
    }
    const res = await metaApi<{ data: CampaignRow[] }>(
      `/${creds.adAccountId}/campaigns`,
      {
        fields: `id,name,status,objective,insights.time_range(${JSON.stringify(range)}){spend,impressions,clicks,ctr,cpc}`,
        limit:  '50',
      },
      creds.accessToken,
    )
    await recordSync(true)

    return (res.data ?? []).map(c => {
      const ins = c.insights?.data?.[0]
      return {
        id:          c.id,
        name:        c.name,
        status:      c.status,
        objective:   c.objective ?? null,
        spendCents:  toCents(ins?.spend),
        impressions: toNumber(ins?.impressions),
        clicks:      toNumber(ins?.clicks),
        ctr:         toNumber(ins?.ctr),
        cpcCents:    toCents(ins?.cpc),
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    await recordSync(false, msg)
    throw err
  }
}
