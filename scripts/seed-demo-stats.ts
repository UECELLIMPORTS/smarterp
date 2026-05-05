/**
 * Mostra estatísticas do tenant demo "UÉ CELL IMPORTSS" — útil pra verificar
 * que o seed populou tudo certo antes de gravar o vídeo.
 *
 * Uso: npx tsx scripts/seed-demo-stats.ts
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync(`${process.cwd()}/.env.local`, 'utf-8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const { data: t } = await sb.from('tenants').select('id, name').eq('slug', 'ue-cell-importss').single()
  if (!t) { console.error('Tenant demo não existe. Rode npx tsx scripts/seed-demo.ts'); process.exit(1) }
  const tid = t.id

  const counts = await Promise.all([
    sb.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    sb.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    sb.from('sales').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    sb.from('customer_coupons').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    sb.from('scheduled_whatsapp_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    sb.from('whatsapp_templates').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
    sb.from('recurring_expenses').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
  ])
  const labels = ['products', 'customers', 'sales', 'customer_coupons', 'wa_msgs_sent', 'wa_templates', 'recurring_expenses']
  console.log(`\n📊 Tenant "${t.name}" (${tid})`)
  counts.forEach((c, i) => console.log(`  ${labels[i].padEnd(20)} ${c.count}`))

  const { data: byOrigin } = await sb.from('customers').select('origin').eq('tenant_id', tid)
  const distO: Record<string, number> = {}
  byOrigin?.forEach(r => { const k = r.origin ?? 'null'; distO[k] = (distO[k] ?? 0) + 1 })
  console.log('\n  customers por origem:')
  Object.entries(distO).sort(([, a], [, b]) => b - a).forEach(([k, v]) => console.log(`    ${k.padEnd(20)} ${v}`))

  const { data: sales } = await sb.from('sales').select('total_cents, sale_channel, created_at').eq('tenant_id', tid)
  const phys = sales!.filter(s => ['fisica_balcao', 'fisica_retirada'].includes(s.sale_channel))
  const onln = sales!.filter(s => ['whatsapp', 'instagram_dm', 'delivery_online'].includes(s.sale_channel))
  const total = sales!.reduce((a, s) => a + s.total_cents, 0)
  const physTotal = phys.reduce((a, s) => a + s.total_cents, 0)
  const onlnTotal = onln.reduce((a, s) => a + s.total_cents, 0)
  const monthly = total / 2 // 60 dias / 30
  console.log(`\n  receita 60d total: R$ ${(total / 100).toFixed(2)}`)
  console.log(`  → faturamento mensal estimado: R$ ${(monthly / 100).toFixed(2)}`)
  console.log(`  físico (${phys.length} vendas): R$ ${(physTotal / 100).toFixed(2)} (${((physTotal / total) * 100).toFixed(0)}%)`)
  console.log(`  online (${onln.length} vendas): R$ ${(onlnTotal / 100).toFixed(2)} (${((onlnTotal / total) * 100).toFixed(0)}%)`)

  const today = new Date().toISOString().slice(5, 10)
  const { data: bds } = await sb.from('customers').select('full_name, birth_date').eq('tenant_id', tid).not('birth_date', 'is', null)
  const todayBirth = bds!.filter(b => b.birth_date.slice(5, 10) === today)
  console.log(`\n  🎂 aniversariantes HOJE: ${todayBirth.length}`)
  todayBirth.slice(0, 5).forEach(b => console.log(`    - ${b.full_name}`))
}
main().catch(e => { console.error(e); process.exit(1) })
