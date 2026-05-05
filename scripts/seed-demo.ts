/**
 * Seed de demonstração — tenant "UÉ CELL IMPORTSS" pra gravação de vídeo.
 *
 * Cria:
 *  - 1 tenant + 1 user owner
 *  - 15 produtos (celulares + acessórios)
 *  - 150 customers com origens variadas + aniversariantes
 *  - 200 sales em 60 dias (R$ 64k/mês)
 *  - Despesas recorrentes (aluguel, salários)
 *  - 25 cupons (aniversário + win-back)
 *  - Templates de WhatsApp + 50 mensagens enviadas
 *
 * Idempotente: se rodar de novo, apaga e recria tudo.
 *
 * Uso:  npx tsx scripts/seed-demo.ts
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ─── Carrega .env.local ─────────────────────────────────────────────────────
const env = readFileSync(`${process.cwd()}/.env.local`, 'utf-8')
for (const line of env.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const k = trimmed.slice(0, eq).trim()
  let v = trimmed.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1)
  }
  process.env[k] = v
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

// ─── Configuração ──────────────────────────────────────────────────────────
const DEMO_EMAIL = 'demo@gestaosmarterp.online'
const DEMO_PASSWORD = 'Demo1234!'
const TENANT_NAME = 'UÉ CELL IMPORTSS'
const TENANT_SLUG = 'ue-cell-importss'
const TENANT_CNPJ = '00.000.000/0001-99'

const NOW = new Date()
const DAYS_BACK = 60

// ─── Helpers ───────────────────────────────────────────────────────────────
function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function randDate(daysBack: number): Date { return new Date(NOW.getTime() - randInt(0, daysBack) * 86400000 - randInt(0, 86400000)) }

const FIRST_NAMES = ['João','Maria','Pedro','Ana','Carlos','Lucia','Felipe','Juliana','Rafael','Camila','Bruno','Larissa','Diego','Patricia','Marcos','Aline','Thiago','Vanessa','Lucas','Beatriz','Eduardo','Mariana','Fernando','Carla','Rodrigo','Renata','Gustavo','Daniela','André','Fernanda','Leandro','Tatiana','Ricardo','Cristina','Marcelo','Priscila','Vinicius','Adriana','Gabriel','Roberta','Henrique','Sandra','Paulo','Letícia','Luiz','Bianca','Caio','Amanda','Murilo','Natália']
const LAST_NAMES = ['Silva','Santos','Souza','Oliveira','Pereira','Costa','Rodrigues','Almeida','Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha','Ribeiro','Alves','Monteiro','Cardoso','Reis','Mendes','Cavalcanti','Dias','Castro','Campos','Freitas','Pinto','Moura','Andrade']

const ORIGINS = [
  { v: 'instagram_pago',    weight: 30, repurchase: 0.18 },  // tráfego pago: muito volume, pouca recompra
  { v: 'indicacao',         weight: 25, repurchase: 0.55 },  // indicação: alta recompra
  { v: 'google',            weight: 20, repurchase: 0.30 },
  { v: 'whatsapp_dm',       weight: 12, repurchase: 0.40 },  // mapeia pra customer.origin='outros' (não tem whatsapp_dm em customers.origin) — vou usar 'outros' aqui
  { v: 'instagram_organico',weight: 8,  repurchase: 0.35 },
  { v: 'passou_na_porta',   weight: 5,  repurchase: 0.45 },
] as const

// customers.origin aceita só esses 7 valores (do migration 007)
const CUSTOMER_ORIGINS = ['instagram_pago','instagram_organico','indicacao','passou_na_porta','google','facebook','outros']

// sales.sale_channel
const ONLINE_CHANNELS = ['whatsapp', 'instagram_dm', 'delivery_online'] as const
const PHYSICAL_CHANNELS = ['fisica_balcao', 'fisica_retirada'] as const

const PRODUCTS = [
  { name: 'iPhone 13 64GB Seminovo',   price: 3500_00, cost: 2700_00 },
  { name: 'iPhone 14 128GB Seminovo',  price: 4500_00, cost: 3700_00 },
  { name: 'iPhone 12 64GB Seminovo',   price: 2900_00, cost: 2200_00 },
  { name: 'iPhone 11 64GB Seminovo',   price: 2200_00, cost: 1700_00 },
  { name: 'Capa Silicone iPhone',      price:   89_00, cost:   25_00 },
  { name: 'Capa AntiImpacto Premium',  price:  149_00, cost:   45_00 },
  { name: 'Película 3D Vidro',         price:   49_00, cost:   12_00 },
  { name: 'Película Privacidade',      price:   79_00, cost:   25_00 },
  { name: 'Fone Bluetooth Pro',        price:  159_00, cost:   55_00 },
  { name: 'Fone com Fio',              price:   39_00, cost:   12_00 },
  { name: 'Carregador USB-C 20W',      price:   89_00, cost:   30_00 },
  { name: 'Cabo Lightning Reforçado',  price:   49_00, cost:   15_00 },
  { name: 'Power Bank 10.000mAh',      price:  179_00, cost:   80_00 },
  { name: 'Suporte Veicular Magnético',price:   69_00, cost:   25_00 },
  { name: 'Smartwatch Fitness',        price:  299_00, cost:  130_00 },
]

// ─── 1) Limpa execução anterior ─────────────────────────────────────────────
async function cleanup() {
  console.log('🧹 Limpando seed anterior (se houver)…')
  const { data: existing } = await supabase.from('tenants').select('id, owner_user_id').eq('slug', TENANT_SLUG).maybeSingle()
  if (existing) {
    const tid = existing.id
    // Apaga em ordem reversa de dependência — tabelas com tenant_id
    for (const t of ['scheduled_whatsapp_messages', 'whatsapp_templates', 'customer_coupons',
                     'variable_expenses', 'recurring_expenses',
                     'sale_items', 'sales', 'cash_sessions',
                     'customers', 'products',
                     'tenant_member_permissions', 'tenant_members']) {
      // sale_items não tem tenant_id direto — apaga via sale_id
      if (t === 'sale_items') {
        const { data: salesIds } = await supabase.from('sales').select('id').eq('tenant_id', tid)
        if (salesIds && salesIds.length > 0) {
          await supabase.from('sale_items').delete().in('sale_id', salesIds.map(s => s.id))
        }
        continue
      }
      await supabase.from(t).delete().eq('tenant_id', tid)
    }
    await supabase.from('tenants').delete().eq('id', tid)
    if (existing.owner_user_id) {
      await supabase.auth.admin.deleteUser(existing.owner_user_id).catch(() => null)
    }
    console.log(`  → tenant ${tid} apagado`)
  } else {
    console.log('  → nada pra limpar')
  }

  // Garante que o user demo não está órfão (pode existir sem tenant se seed anterior falhou)
  const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 200 })
  const orphan = usersData?.users.find(u => u.email === DEMO_EMAIL)
  if (orphan) {
    await supabase.auth.admin.deleteUser(orphan.id).catch(() => null)
    console.log(`  → user órfão ${DEMO_EMAIL} apagado`)
  }
}

// ─── 2) Cria user + profile + tenant ───────────────────────────────────────
async function createTenantAndUser(): Promise<{ tenantId: string; userId: string }> {
  console.log('👤 Criando user demo…')
  const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Demo UÉ CELL' },
  })
  if (userErr) throw userErr
  const userId = userData.user!.id

  // Profile (em algumas configs é trigger automático, mas garante)
  await supabase.from('profiles').upsert({
    id: userId,
    full_name: 'Demo UÉ CELL',
    phone: '+5579999999999',
  }, { onConflict: 'id' })

  console.log('🏢 Criando tenant…')
  const { data: tenant, error: terr } = await supabase.from('tenants').insert({
    name: TENANT_NAME,
    slug: TENANT_SLUG,
    cnpj: TENANT_CNPJ,
    phone: '(79) 99999-9999',
    whatsapp: '+5579999999999',
    email: DEMO_EMAIL,
    address_street: 'Av. Demo',
    address_number: '100',
    address_complement: 'Sala 1',
    address_district: 'Centro',
    address_city: 'Aracaju',
    address_state: 'SE',
    address_zip: '49000-000',
    logo_url: '',
    warranty_days: 90,
    pickup_days: 30,
    is_active: true,
    contract_text: '',
    require_signature: false,
    owner_user_id: userId,
    business_phone: '(79) 99999-9999',
    business_email: DEMO_EMAIL,
    instagram_handle: '@uecellimportss',
    birthday_discount_percent: 10,
    whatsapp_instance_name: '',
    whatsapp_status: 'disconnected',
  }).select('id').single()
  if (terr) throw terr

  // Liga user ao tenant como OWNER
  await supabase.from('tenant_members').insert({
    tenant_id: tenant.id,
    user_id: userId,
    role: 'OWNER',
    is_active: true,
    joined_at: NOW.toISOString(),
  })

  // app_metadata é onde o sistema lê tenant_id + tenant_role (vai pro JWT)
  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { tenant_id: tenant.id, tenant_role: 'owner' },
  })

  // Permissões de TODOS os módulos pro OWNER (lista canônica de src/lib/permissions-shared.ts)
  const ALL_MODULES = [
    'dashboard', 'pos', 'estoque', 'financeiro', 'clientes', 'erp_clientes',
    'analytics_canais', 'relatorios', 'meta_ads', 'crm', 'notas_fiscais',
    'gastos', 'aniversariantes',
  ]
  await supabase.from('tenant_member_permissions').insert(
    ALL_MODULES.map(module_key => ({
      tenant_id: tenant.id,
      user_id: userId,
      module_key,
      granted_at: NOW.toISOString(),
    }))
  )

  return { tenantId: tenant.id, userId }
}

// ─── 3) Produtos ───────────────────────────────────────────────────────────
async function createProducts(tenantId: string): Promise<{ id: string; price: number; cost: number }[]> {
  console.log('📦 Criando 15 produtos…')
  const rows = PRODUCTS.map(p => ({
    tenant_id: tenantId,
    name: p.name,
    price_cents: p.price,
    cost_cents: p.cost,
    purchase_price_cents: p.cost,
    stock_qty: randInt(5, 50),
    active: true,
    unit: 'UN',
    format: 'simple',
    condition: p.name.includes('Seminovo') ? 'used' : 'new',
    cfop: '5102',
    cst_csosn: '102',
    unidade: 'UN',
    origem: '0',
    image_urls: [],
  }))
  const { data, error } = await supabase.from('products').insert(rows).select('id, price_cents, cost_cents')
  if (error) throw error
  return data!.map(d => ({ id: d.id, price: d.price_cents, cost: d.cost_cents }))
}

// ─── 4) Customers ──────────────────────────────────────────────────────────
async function createCustomers(tenantId: string, userId: string) {
  console.log('👥 Criando 150 customers…')
  const rows: any[] = []
  // Soma de pesos = 100
  for (let i = 0; i < 150; i++) {
    const r = Math.random() * 100
    let acc = 0
    let chosen = ORIGINS[0]
    for (const o of ORIGINS) {
      acc += o.weight
      if (r <= acc) { chosen = o; break }
    }
    // Mapeia 'whatsapp_dm' (não existe em customers.origin) pra 'outros'
    const origin = chosen.v === 'whatsapp_dm' ? 'outros' : chosen.v

    // Aniversário: 5 com aniversário HOJE, 5 amanhã, resto aleatório
    let birth: string | null = null
    if (i < 5) {
      const d = new Date(NOW); d.setFullYear(NOW.getFullYear() - randInt(20, 55))
      birth = d.toISOString().slice(0, 10)
    } else if (i < 10) {
      const d = new Date(NOW); d.setDate(NOW.getDate() + 1); d.setFullYear(NOW.getFullYear() - randInt(20, 55))
      birth = d.toISOString().slice(0, 10)
    } else if (Math.random() < 0.7) {
      const d = new Date(NOW.getFullYear() - randInt(18, 65), randInt(0, 11), randInt(1, 28))
      birth = d.toISOString().slice(0, 10)
    }

    const fn = `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`
    rows.push({
      tenant_id: tenantId,
      full_name: fn,
      whatsapp: `+557999${String(randInt(100000, 999999)).padStart(6, '0')}`,
      email: `${fn.toLowerCase().replace(/\s/g, '.').normalize('NFD').replace(/[̀-ͯ]/g, '')}@email.demo`,
      origin,
      person_type: 'PF',
      is_active: true,
      created_by: userId,
      birth_date: birth,
      address_city: 'Aracaju',
      address_state: 'SE',
      credit_limit_cents: 0,
    })
  }
  const { data, error } = await supabase.from('customers').insert(rows).select('id, origin')
  if (error) throw error
  return data!
}

// ─── 5) Sales (200 vendas distribuídas em 60 dias) ─────────────────────────
async function createSales(
  tenantId: string,
  userId: string,
  products: { id: string; price: number; cost: number }[],
  customers: { id: string; origin: string | null }[],
) {
  console.log('💰 Criando 200 sales (R$ 64k/mês target)…')

  // Distribuição alvo: 60% físico, 40% online → físico R$ 38k/mês, online R$ 26k/mês
  // Volume calibrado pra ~R$ 64k/mês = R$ 128k em 60d (ticket médio ~R$ 850)
  const totalSales = 150
  const physicalCount = Math.floor(totalSales * 0.6)  // 90
  const onlineCount = totalSales - physicalCount      // 60

  const allSales: any[] = []
  const allItems: any[] = []

  function pickProducts(isHighValue: boolean) {
    // High value: tem 1 celular (>R$ 2k) + alguns acessórios
    // Low value: só acessórios
    const items: { product: typeof products[0]; qty: number }[] = []
    if (isHighValue) {
      const phones = products.filter(p => p.price > 2000_00)
      items.push({ product: rand(phones), qty: 1 })
      // Combo phone + 1 acessório
      const accessories = products.filter(p => p.price < 200_00)
      items.push({ product: rand(accessories), qty: 1 })
      return items
    }
    // Vendas só de acessórios — 1 a 4 itens
    const accessories = products.filter(p => p.price < 500_00)
    const accQty = randInt(1, 4)
    for (let i = 0; i < accQty; i++) {
      items.push({ product: rand(accessories), qty: randInt(1, 3) })
    }
    return items.length > 0 ? items : [{ product: rand(accessories), qty: 1 }]
  }

  // Algumas customers fazem múltiplas compras (recompra) — focando em indicacao/whatsapp
  const repeatCustomers = customers.filter(c =>
    c.origin === 'indicacao' || c.origin === 'outros' || c.origin === 'instagram_organico'
  )

  function pickCustomer(): typeof customers[0] {
    // 30% das vendas vão pra repeat customers
    if (Math.random() < 0.30 && repeatCustomers.length > 0) return rand(repeatCustomers)
    return rand(customers)
  }

  for (let i = 0; i < totalSales; i++) {
    const isPhysical = i < physicalCount
    const channel = isPhysical ? rand(PHYSICAL_CHANNELS) : rand(ONLINE_CHANNELS)
    const delivery = isPhysical ? 'counter' : (Math.random() < 0.7 ? 'shipping' : 'pickup')
    // 14% das vendas tem aparelho (high value), resto só acessório
    // Calibrado pra ticket médio ~R$ 850 → R$ 64k/mês com 150 vendas em 60d
    const hasPhone = Math.random() < 0.14
    const items = pickProducts(hasPhone)

    let subtotal = 0
    for (const it of items) subtotal += it.product.price * it.qty

    const discount = Math.random() < 0.20 ? Math.floor(subtotal * 0.05) : 0
    const total = subtotal - discount

    const customer = pickCustomer()
    const saleDate = randDate(DAYS_BACK)

    const saleId = crypto.randomUUID()
    allSales.push({
      id: saleId,
      tenant_id: tenantId,
      customer_id: customer.id,
      user_id: userId,
      subtotal_cents: subtotal,
      discount_cents: discount,
      shipping_cents: 0,
      total_cents: total,
      payment_method: rand(['cash', 'pix', 'credit_card', 'debit_card']),
      status: 'completed',
      sale_channel: channel,
      delivery_type: delivery,
      customer_origin: customer.origin,
      created_at: saleDate.toISOString(),
      updated_at: saleDate.toISOString(),
    })

    for (const it of items) {
      allItems.push({
        sale_id: saleId,
        product_id: it.product.id,
        name: PRODUCTS[products.findIndex(p => p.id === it.product.id)]?.name ?? 'Produto',
        quantity: it.qty,
        unit_price_cents: it.product.price,
        subtotal_cents: it.product.price * it.qty,
        cost_snapshot_cents: it.product.cost,
      })
    }
  }

  // Insert em chunks pra não estourar payload
  for (let i = 0; i < allSales.length; i += 50) {
    const chunk = allSales.slice(i, i + 50)
    const { error } = await supabase.from('sales').insert(chunk)
    if (error) throw error
  }
  for (let i = 0; i < allItems.length; i += 100) {
    const chunk = allItems.slice(i, i + 100)
    const { error } = await supabase.from('sale_items').insert(chunk)
    if (error) throw error
  }

  // Calcula total
  const totalRevenue = allSales.reduce((acc, s) => acc + s.total_cents, 0)
  const physicalRevenue = allSales.filter(s => PHYSICAL_CHANNELS.includes(s.sale_channel)).reduce((acc, s) => acc + s.total_cents, 0)
  const onlineRevenue = totalRevenue - physicalRevenue
  console.log(`  → ${allSales.length} vendas, R$ ${(totalRevenue/100).toFixed(2)} total em 60d`)
  console.log(`     físico: R$ ${(physicalRevenue/100).toFixed(2)} | online: R$ ${(onlineRevenue/100).toFixed(2)}`)
}

// ─── 5.5) Subscription PREMIUM ativa ────────────────────────────────────────
async function createSubscription(tenantId: string) {
  console.log('💎 Ativando plano Premium…')
  const start = new Date(NOW.getTime() - 5 * 86400000)  // 5 dias atrás
  const end = new Date(NOW.getTime() + 25 * 86400000)   // 25 dias daqui
  await supabase.from('subscriptions').insert({
    tenant_id: tenantId,
    product: 'gestao_smart',
    status: 'active',
    plan_name: 'premium',
    price_cents: 19700,
    billing_cycle: 'MONTHLY',
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    last_payment_at: start.toISOString(),
    next_payment_at: end.toISOString(),
  })
}

// ─── 6) Despesas recorrentes (dilui o lucro físico) ────────────────────────
async function createExpenses(tenantId: string) {
  console.log('💸 Criando despesas recorrentes…')
  await supabase.from('recurring_expenses').insert([
    { tenant_id: tenantId, name: 'Aluguel loja física', category: 'aluguel',     value_cents: 4500_00, active: true },
    { tenant_id: tenantId, name: 'Salário Vendedor 1',  category: 'salario',     value_cents: 2200_00, active: true },
    { tenant_id: tenantId, name: 'Salário Vendedor 2',  category: 'salario',     value_cents: 2200_00, active: true },
    { tenant_id: tenantId, name: 'Energia + Internet',  category: 'utilidades',  value_cents: 850_00,  active: true },
    { tenant_id: tenantId, name: 'Sistema Gestão Smart',category: 'software',    value_cents: 47_00,   active: true },
    { tenant_id: tenantId, name: 'Tráfego Pago Meta',   category: 'marketing',   value_cents: 1500_00, active: true },
  ])
}

// ─── 7) Cupons ─────────────────────────────────────────────────────────────
async function createCoupons(tenantId: string, customers: { id: string }[]) {
  console.log('🎁 Criando 25 cupons…')
  const rows = []
  for (let i = 0; i < 25; i++) {
    const c = rand(customers)
    const isBirthday = i < 10
    const valid = new Date(NOW); valid.setDate(NOW.getDate() + randInt(7, 30))
    const used = i < 7  // 7 cupons já usados (mostra retorno)
    rows.push({
      tenant_id: tenantId,
      customer_id: c.id,
      code: isBirthday ? `ANIV${randInt(1000, 9999)}` : `VOLTA${randInt(1000, 9999)}`,
      type: isBirthday ? 'birthday' : 'winback',
      discount_pct: isBirthday ? 10 : 15,
      valid_until: valid.toISOString(),
      used_at: used ? randDate(15).toISOString() : null,
      notes: isBirthday ? 'Cupom de aniversário' : 'Win-back cliente inativo',
    })
  }
  await supabase.from('customer_coupons').insert(rows)
}

// ─── 8) Templates + Mensagens enviadas ─────────────────────────────────────
async function createWhatsAppData(tenantId: string, customers: { id: string }[]) {
  console.log('📱 Criando templates + 60 mensagens enviadas…')
  await supabase.from('whatsapp_templates').insert([
    { tenant_id: tenantId, type: 'birthday_day',   enabled: true, delay_minutes: 0,
      body: '🎂 Parabéns, {nome}! Hoje é seu dia! Use o cupom {cupom} pra ganhar 10% em qualquer produto. 🎁', send_email: true,
      email_subject: '🎂 Parabéns!', delay_hours: 0 },
    { tenant_id: tenantId, type: 'inactive_customer', enabled: true, delay_minutes: 0,
      body: 'Oi {nome}! 😢 Faz {dias} dias que você não compra com a gente. Olha esse cupom: {cupom} — 15% off!', send_email: true,
      email_subject: 'Sentimos sua falta!', inactivity_days: 90, coupon_code: 'VOLTA15', coupon_discount_pct: 15, coupon_valid_days: 30, delay_hours: 0 },
    { tenant_id: tenantId, type: 'post_sale',      enabled: true, delay_minutes: 1440,
      body: 'Oi {nome}! 😊 Como tá tudo com o produto que comprou? Qualquer dúvida me chama!', send_email: false, delay_hours: 24 },
  ])

  const msgs = []
  for (let i = 0; i < 60; i++) {
    const c = rand(customers)
    const sentAt = randDate(7)
    msgs.push({
      tenant_id: tenantId,
      type: rand(['birthday_day', 'inactive_customer', 'post_sale']),
      reference_id: c.id,
      customer_id: c.id,
      recipient_phone: `+557999${randInt(100000, 999999)}`,
      body: 'Mensagem automática enviada pelo Gestão Smart.',
      scheduled_for: sentAt.toISOString(),
      status: 'sent',
      sent_at: sentAt.toISOString(),
      attempt_count: 1,
      evolution_message_id: `MSG${randInt(100000, 999999)}`,
    })
  }
  await supabase.from('scheduled_whatsapp_messages').insert(msgs)
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  await cleanup()
  const { tenantId, userId } = await createTenantAndUser()
  const products = await createProducts(tenantId)
  const customers = await createCustomers(tenantId, userId)
  await createSales(tenantId, userId, products, customers)
  await createSubscription(tenantId)
  await createExpenses(tenantId)
  await createCoupons(tenantId, customers)
  await createWhatsAppData(tenantId, customers)

  console.log('\n✅ Seed completo!')
  console.log(`   Tenant ID: ${tenantId}`)
  console.log(`   Login:     ${DEMO_EMAIL}`)
  console.log(`   Senha:     ${DEMO_PASSWORD}`)
  console.log(`   Slug:      ${TENANT_SLUG}`)
}

main().catch(e => { console.error('❌ Erro:', e.message ?? e); console.error(e); process.exit(1) })
