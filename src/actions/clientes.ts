'use server'

import { requireAuth } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/tenant'

export type ImportResult = {
  imported: number
  skipped: number
  errors: string[]
}

function cleanDigits(s: string) { return s.replace(/\D/g, '') }
function toDate(s: string): string | null {
  s = s.trim()
  if (!s) return null
  const [d, m, y] = s.split('/')
  if (!d || !m || !y) return null
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}
function toCents(s: string): number {
  const n = parseFloat(s.trim().replace(',', '.'))
  return isNaN(n) ? 0 : Math.round(n * 100)
}
function toPersonType(s: string) {
  return s.toLowerCase().includes('jur') ? 'juridica' : 'fisica'
}
function toGender(s: string): string | null {
  const l = s.trim().toLowerCase()
  if (l === 'masculino') return 'M'
  if (l === 'feminino')  return 'F'
  return null
}

function parseBlingCsv(csv: string): Record<string, string>[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  // Parse header — values wrapped in quotes, semicolon-delimited
  function parseLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQ  = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ; continue }
      if (c === ';' && !inQ) { result.push(cur); cur = ''; continue }
      cur += c
    }
    result.push(cur)
    return result
  }

  const headers = parseLine(lines[0])
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = parseLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })
    rows.push(row)
  }

  return rows
}

export async function importCustomersFromBling(csvText: string): Promise<ImportResult> {
  const { supabase, user } = await requireAuth()
  const tenantId = getTenantId(user)

  const rows = parseBlingCsv(csvText)
  if (!rows.length) return { imported: 0, skipped: 0, errors: ['Arquivo vazio ou formato inválido'] }

  // Load existing CPFs and names+whatsapps for dedup
  const { data: existing } = await supabase
    .from('customers')
    .select('cpf_cnpj, full_name, whatsapp')
    .eq('tenant_id', tenantId)

  const existingCpfs   = new Set((existing ?? []).map(r => r.cpf_cnpj).filter(Boolean))
  const existingKeys   = new Set(
    (existing ?? [])
      .filter(r => !r.cpf_cnpj)
      .map(r => `${(r.full_name ?? '').toLowerCase()}|${r.whatsapp ?? ''}`)
  )

  let imported = 0
  let skipped  = 0
  const errors: string[] = []

  const BATCH = 50
  const toInsert: object[] = []

  for (const r of rows) {
    const nome      = (r['Nome'] ?? '').trim()
    if (!nome) { skipped++; continue }

    const cpfDigits = cleanDigits(r['CNPJ / CPF'] ?? '')
    const whats     = cleanDigits(r['Celular'] ?? '')

    // Dedup check
    if (cpfDigits && existingCpfs.has(cpfDigits)) { skipped++; continue }
    if (!cpfDigits) {
      const key = `${nome.toLowerCase()}|${whats}`
      if (existingKeys.has(key)) { skipped++; continue }
    }

    const since = toDate(r['Cliente desde'] ?? '')
    const bd    = toDate(r['Data nascimento'] ?? '')

    const record: Record<string, unknown> = {
      tenant_id:          tenantId,
      full_name:          nome,
      person_type:        toPersonType(r['Tipo pessoa'] ?? ''),
      is_active:          (r['Situação'] ?? '').trim().toLowerCase() === 'ativo',
      credit_limit_cents: toCents(r['Limite de crédito'] ?? '0'),
    }

    if (r['Fantasia']?.trim())             record.trade_name        = r['Fantasia'].trim()
    if (cpfDigits)                         record.cpf_cnpj          = cpfDigits
    if (r['IE / RG']?.trim())             record.ie_rg             = r['IE / RG'].trim()
    if (whats)                             record.whatsapp          = whats
    if (r['E-mail']?.trim())              record.email             = r['E-mail'].trim()
    if (r['E-mail para envio NFe']?.trim()) record.nfe_email        = r['E-mail para envio NFe'].trim()
    if (r['Web Site']?.trim())            record.website           = r['Web Site'].trim()
    if (bd)                               record.birth_date        = bd
    const gnd = toGender(r['Sexo'] ?? '')
    if (gnd)                              record.gender            = gnd
    if (r['Estado civil']?.trim())        record.marital_status    = r['Estado civil'].trim()
    if (r['Profissão']?.trim())           record.profession        = r['Profissão'].trim()
    if (r['Nome pai']?.trim())            record.father_name       = r['Nome pai'].trim()
    if (cleanDigits(r['CPF pai'] ?? ''))  record.father_cpf        = cleanDigits(r['CPF pai'])
    if (r['Nome mãe']?.trim())            record.mother_name       = r['Nome mãe'].trim()
    if (cleanDigits(r['CPF mãe'] ?? '')) record.mother_cpf        = cleanDigits(r['CPF mãe'])
    if (r['Vendedor']?.trim())            record.salesperson       = r['Vendedor'].trim()
    if (r['Tipo contato']?.trim())        record.contact_type      = r['Tipo contato'].trim()
    if (r['Observações']?.trim())         record.notes             = r['Observações'].trim()
    if (r['Endereço']?.trim())            record.address_street    = r['Endereço'].trim()
    if (r['Número']?.trim())              record.address_number    = r['Número'].trim()
    if (r['Complemento']?.trim())         record.address_complement = r['Complemento'].trim()
    if (r['Bairro']?.trim())              record.address_district  = r['Bairro'].trim()
    const cep = cleanDigits(r['CEP'] ?? '')
    if (cep)                              record.address_zip       = cep
    if (r['Cidade']?.trim())              record.address_city      = r['Cidade'].trim()
    if (r['UF']?.trim())                  record.address_state     = r['UF'].trim()
    if (since)                            record.created_at        = `${since}T12:00:00+00:00`

    toInsert.push(record)

    // Mark as seen so duplicates within the CSV itself are skipped
    if (cpfDigits) existingCpfs.add(cpfDigits)
    else existingKeys.add(`${nome.toLowerCase()}|${whats}`)
  }

  // Insert in batches
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('customers').insert(batch)
    if (error) {
      errors.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`)
    } else {
      imported += batch.length
    }
  }

  return { imported, skipped, errors }
}
