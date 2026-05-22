/**
 * Wrapper do Evolution Go (whatsmeow).
 *
 * Centralizado: 1 Evolution Go hospedado na VPS. Cada tenant tem
 * 1 instância nominada + token próprio (= instanceName por convenção).
 *
 * ENV vars necessárias:
 *   EVOLUTION_API_URL  — URL base (ex: https://evolution-go.felipeferreira.online)
 *   EVOLUTION_API_KEY  — global API key (para criar/listar instâncias)
 *
 * Diferenças vs Evolution API v2 (Baileys):
 *   - Operações por instância usam o TOKEN da instância no header apikey
 *     (não a chave global). Token = instanceName por convenção (sem precisar guardar no DB).
 *   - Estado via GET /instance/all (sem endpoint individual por instância)
 *   - QR: GET /instance/qr retorna { data: { Qrcode, Code } }
 *   - Send: POST /send/text (não /message/sendText/{name})
 *   - Sem endpoint separado de delete — logout serve para ambos os casos
 */

const API_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY = process.env.EVOLUTION_API_KEY

export type EvolutionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

export type ConnectionState = 'open' | 'connecting' | 'close' | 'unknown'

function isConfigured(): boolean {
  return Boolean(API_URL && API_KEY)
}

async function _fetch(
  path: string,
  apikey: string,
  init: RequestInit = {},
): Promise<EvolutionResult<unknown>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'apikey': apikey,
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    })

    const text = await res.text()
    let body: unknown = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }

    if (!res.ok) {
      const msg =
        (body && typeof body === 'object' && 'error' in body)
          ? String((body as { error: unknown }).error)
          : (body && typeof body === 'object' && 'message' in body)
            ? String((body as { message: unknown }).message)
            : `HTTP ${res.status}`
      return { ok: false, error: msg }
    }

    return { ok: true, data: body }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'erro desconhecido' }
  }
}

/** Fetch com a chave GLOBAL (criar/listar instâncias). */
function globalFetch(path: string, init: RequestInit = {}): Promise<EvolutionResult<unknown>> {
  if (!isConfigured()) {
    return Promise.resolve({ ok: false, error: 'Evolution Go não configurado (faltam EVOLUTION_API_URL/EVOLUTION_API_KEY).' })
  }
  return _fetch(path, API_KEY!, init)
}

/** Fetch com o TOKEN da instância (qr, logout, send). Token = instanceName por convenção. */
function instanceFetch(path: string, instanceName: string, init: RequestInit = {}): Promise<EvolutionResult<unknown>> {
  if (!isConfigured()) {
    return Promise.resolve({ ok: false, error: 'Evolution Go não configurado.' })
  }
  return _fetch(path, instanceName, init)
}

// ──────────────────────────────────────────────────────────────────────────
// Instance management
// ──────────────────────────────────────────────────────────────────────────

/**
 * Cria instância no Evolution Go.
 * Usa instanceName como token (previsível — não precisa armazenar separado no DB).
 */
export async function createInstance(instanceName: string): Promise<EvolutionResult<{ instanceName: string }>> {
  const res = await globalFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ name: instanceName, token: instanceName }),
  })
  if (!res.ok) return res
  return { ok: true, data: { instanceName } }
}

/**
 * Pega QR code da instância (base64).
 * Evolution Go retorna: { data: { Qrcode: "data:image/png;base64,...", Code: "..." } }
 * Usa o token da instância no header (não a chave global).
 */
export async function getInstanceQr(instanceName: string): Promise<EvolutionResult<{ qrBase64: string | null; pairingCode: string | null }>> {
  const res = await instanceFetch('/instance/qr', instanceName)
  if (!res.ok) return res

  type QrBody = { data?: { Qrcode?: string } }
  const body = (res.data ?? {}) as QrBody
  return {
    ok: true,
    data: {
      qrBase64:    body.data?.Qrcode ?? null,
      pairingCode: null,
    },
  }
}

/**
 * Verifica estado da conexão via GET /instance/all (Evolution Go não tem endpoint individual).
 *
 * Estado inferido:
 *   connected:true               → 'open'
 *   connected:false, jid vazio   → 'connecting' (instância criada, aguardando QR scan)
 *   connected:false, jid preench → 'close' (estava conectada, agora desconectada)
 *
 * Retorna error com '404' se a instância não existir (compatível com
 * instanceExistsInEvolution que procura '404' no erro).
 */
export async function getInstanceState(instanceName: string): Promise<EvolutionResult<{ state: ConnectionState; phone: string | null }>> {
  const res = await globalFetch('/instance/all')
  if (!res.ok) return res

  type Instance = { name: string; connected: boolean; jid: string }
  type Body = { data?: Instance[] }
  const body = (res.data ?? {}) as Body
  const instance = (body.data ?? []).find(i => i.name === instanceName)

  if (!instance) {
    return { ok: false, error: '404 instance not found' }
  }

  const state: ConnectionState =
    instance.connected ? 'open'
    : instance.jid     ? 'close'       // tinha jid = já foi conectada = agora offline
    :                    'connecting'   // sem jid = nunca conectou = aguardando QR

  let phone: string | null = null
  if (instance.jid) {
    const match = instance.jid.match(/^(\d+)/)
    if (match) phone = match[1]
  }

  return { ok: true, data: { state, phone } }
}

/**
 * Desconecta a instância (logout).
 * Evolution Go: DELETE /instance/logout com token da instância no header.
 */
export async function logoutInstance(instanceName: string): Promise<EvolutionResult> {
  const res = await instanceFetch('/instance/logout', instanceName, { method: 'DELETE' })
  return res.ok ? { ok: true } : res
}

/**
 * Evolution Go não tem endpoint de delete separado — logout serve para ambos os casos.
 */
export async function deleteInstance(instanceName: string): Promise<EvolutionResult> {
  return logoutInstance(instanceName)
}

// ──────────────────────────────────────────────────────────────────────────
// Send message
// ──────────────────────────────────────────────────────────────────────────

/**
 * Normaliza um telefone pro formato esperado pela Evolution Go.
 * Aceita: "(79) 99999-9999", "79999999999", "5579999999999"
 * Retorna: "5579999999999" (só dígitos com 55 prefixo)
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.startsWith('55') ? digits : `55${digits}`
}

/**
 * Envia mensagem de texto via Evolution Go.
 * POST /send/text com token da instância no header.
 * Body: { number, text }
 */
export async function sendTextMessage(args: {
  instanceName: string
  phone:        string
  text:         string
}): Promise<EvolutionResult<{ messageId: string | null }>> {
  const res = await instanceFetch('/send/text', args.instanceName, {
    method: 'POST',
    body: JSON.stringify({
      number: args.phone,
      text:   args.text,
    }),
  })
  if (!res.ok) return res

  type SendBody = { data?: { key?: { id?: string } } }
  const body = (res.data ?? {}) as SendBody
  return { ok: true, data: { messageId: body.data?.key?.id ?? null } }
}

export function isEvolutionConfigured(): boolean {
  return isConfigured()
}
