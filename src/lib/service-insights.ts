/**
 * Rankings de serviços das OS (aparelhos, reparos, modelos por reparo, bairros).
 *
 * O tipo de reparo não é um campo estruturado: vem do texto livre da OS
 * (problema relatado, diagnóstico, descrição do reparo) + nome das peças
 * usadas. Classificamos por palavras-chave — uma OS pode cair em mais de uma
 * categoria (ex.: "tela quebrada e bateria inchada" conta nas duas).
 *
 * Arquivo puro (sem Supabase/React): o mesmo código existe no CheckSmart e no
 * Gestão Smart. Ao mudar aqui, copiar pro outro repo.
 */

export type InsightOrder = {
  brand_name:         string | null
  model_name:         string | null
  reported_issue:     string | null
  diagnosis:          string | null
  repair_description: string | null
  district:           string | null
  parts:              string[]
}

export type RankRow = { label: string; count: number }

export type ServiceInsights = {
  totalOrders:      number
  classifiedOrders: number          // OS que caíram em ao menos 1 categoria
  topDevices:       RankRow[]
  topRepairs:       RankRow[]
  batteryModels:    RankRow[]
  screenModels:     RankRow[]
  topDistricts:     RankRow[]
  withDistrict:     number          // OS cujo cliente tem bairro preenchido
}

export const REPAIR_SCREEN  = 'Tela'
export const REPAIR_BATTERY = 'Bateria'

/** Ordem importa só para desempate visual; cada regra é independente. */
const REPAIR_RULES: { label: string; re: RegExp }[] = [
  { label: REPAIR_SCREEN,          re: /\b(tela|telas|display|frontal|touch|lcd|oled|tela fantasma)\b/ },
  { label: REPAIR_BATTERY,         re: /\b(bateria|baterias|bat|descarregando|descarrega)\b/ },
  { label: 'Conector de carga',    re: /\b(conector|carregamento|nao carrega|nao carregava|parou de carregar|sem carregar|nao esta carregando|pegando carga|dock|flex de carga|porta de carga)\b/ },
  { label: 'Tampa / carcaça',      re: /\b(tampa|traseira|carcaca|vidro traseiro|chassi|fundo)\b/ },
  { label: 'Câmera',               re: /\b(camera|cameras|lente|lentes)\b/ },
  { label: 'Placa / não liga',     re: /\b(placa|nao liga|apagou|apagado|apagao|desligou|parou de funcionar|reiniciando|reinicia|curto|reballing|logo|loop)\b/ },
  { label: 'Oxidação / água',      re: /\b(agua|molhou|molhado|oxidacao|oxidado|oxid|banho|limpeza quimica)\b/ },
  { label: 'Botões / flex',        re: /\b(botao|botoes|flex power|power|volume|home)\b/ },
  { label: 'Áudio',                re: /\b(alto falante|auto falante|altofalante|autofalante|microfone|auricular|som|audio)\b/ },
  { label: 'Face ID / biometria',  re: /\b(face id|faceid|touch id|biometria|digital)\b/ },
  { label: 'Software / desbloqueio', re: /\b(software|sistema|atualizacao|atualizar|desbloqueio|icloud|conta google|frp|formatar|formatacao|virus)\b/ },
  { label: 'Película',             re: /\b(pelicula|peliculas)\b/ },
]

const BRAND_WORDS = new Set([
  'apple', 'samsung', 'galaxy', 'xiaomi', 'redmi', 'motorola', 'realme',
  'infinix', 'lg', 'asus', 'oppo', 'huawei', 'nokia', 'positivo', 'tecno', 'poco',
])

/** minúsculas, sem acento, só letras/números/espaço. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function classifyRepairs(o: Pick<InsightOrder, 'reported_issue' | 'diagnosis' | 'repair_description' | 'parts'>): string[] {
  const text = normalizeText(
    [o.reported_issue, o.diagnosis, o.repair_description, ...o.parts].filter(Boolean).join(' . '),
  )
  if (!text) return []
  // "película da tela" é película, não troca de tela
  const textForScreen = text.replace(/\bpeliculas? (3d |de |da |privacidade )*(tela )?/g, ' ')
  const out: string[] = []
  for (const rule of REPAIR_RULES) {
    const target = rule.label === REPAIR_SCREEN ? textForScreen : text
    if (rule.re.test(target)) out.push(rule.label)
  }
  return out
}

/**
 * Chave do modelo: marca + modelo sem palavras de marca, para juntar
 * "SAMSUNG A32" e "Galaxy A32". iPhone fica como está ("iphone 13 pro max").
 */
export function modelKey(brand: string | null, model: string | null): string {
  const b = normalizeText(brand)
  const words = normalizeText(model).split(' ').filter(w => w && !BRAND_WORDS.has(w))
  const m = words.join(' ')
  if (!m) return ''
  return `${b}|${m}`
}

function modelLabel(brand: string | null, model: string | null): string {
  const b = (brand ?? '').trim()
  const m = (model ?? '').trim()
  if (!m) return b || 'Sem modelo'
  // Evita "Apple iPhone 13" → mostra só "iPhone 13"; "Samsung A32" fica com a marca
  if (!b || normalizeText(m).startsWith(normalizeText(b)) || /^iphone/i.test(m)) return m
  return `${b} ${m}`
}

/** Contador que agrupa por chave normalizada e exibe a grafia mais usada. */
class Tally {
  private map = new Map<string, { count: number; labels: Map<string, number> }>()
  add(key: string, label: string) {
    if (!key) return
    let e = this.map.get(key)
    if (!e) { e = { count: 0, labels: new Map() }; this.map.set(key, e) }
    e.count++
    e.labels.set(label, (e.labels.get(label) ?? 0) + 1)
  }
  top(n: number): RankRow[] {
    return [...this.map.values()]
      .map(e => ({
        count: e.count,
        label: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0][0],
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
      .slice(0, n)
  }
}

function districtLabel(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ')
  // Só "conserta" caixa quando veio tudo maiúsculo/minúsculo
  if (t === t.toUpperCase() || t === t.toLowerCase()) {
    return t.toLowerCase().replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase())
  }
  return t
}

export function buildServiceInsights(orders: InsightOrder[], limit = 10): ServiceInsights {
  const devices   = new Tally()
  const repairs   = new Tally()
  const battery   = new Tally()
  const screen    = new Tally()
  const districts = new Tally()
  let classified = 0
  let withDistrict = 0

  for (const o of orders) {
    const key   = modelKey(o.brand_name, o.model_name)
    const label = modelLabel(o.brand_name, o.model_name)
    devices.add(key, label)

    const cats = classifyRepairs(o)
    if (cats.length > 0) classified++
    for (const c of cats) repairs.add(c, c)
    if (cats.includes(REPAIR_BATTERY)) battery.add(key, label)
    if (cats.includes(REPAIR_SCREEN))  screen.add(key, label)

    const d = normalizeText(o.district)
    if (d) {
      withDistrict++
      districts.add(d, districtLabel(o.district!))
    }
  }

  return {
    totalOrders:      orders.length,
    classifiedOrders: classified,
    topDevices:       devices.top(limit),
    topRepairs:       repairs.top(limit),
    batteryModels:    battery.top(limit),
    screenModels:     screen.top(limit),
    topDistricts:     districts.top(limit),
    withDistrict,
  }
}
