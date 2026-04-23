# Mapa de Arquivos — SmartERP & CheckSmart

> Atualizado em: 23/04/2026

---

## SmartERP — `/Users/uedson/smarterp/`

### Configuração e raiz

| Arquivo | O que faz |
|---------|-----------|
| `.env.local` | Variáveis de ambiente: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sem service role key) |
| `next.config.ts` | Configuração do Next.js |
| `package.json` | Dependências: Next.js 16.2.4, Supabase JS 2.103.3, Tailwind, Sonner (toasts), Lucide Icons |
| `SESSAO_CONTEXTO.md` | Handoff da sessão anterior (na raiz, gerado automaticamente) |
| `_docs/` | Esta pasta — documentação completa do projeto |

### Lib / Utilitários — `src/lib/`

| Arquivo | O que faz |
|---------|-----------|
| `src/lib/supabase/server.ts` | `requireAuth()` — valida sessão e retorna `{ supabase, user }`. Usar em toda Server Action e Route Handler |
| `src/lib/supabase/client.ts` | Cliente Supabase para uso no browser (componentes client) |
| `src/lib/tenant.ts` | `getTenantId(user)` — retorna `user.app_metadata.tenant_id ?? user.id` |

### Server Actions — `src/actions/`

| Arquivo | O que faz |
|---------|-----------|
| `src/actions/clientes.ts` | `importCustomersFromBling(csvText)` — parser de CSV + UPSERT paginado. Tipo `ImportResult` |
| `src/actions/pos.ts` | `createCustomer()`, `updateCustomer()` — usadas pelo modal de cadastro/edição de clientes |
| `src/actions/products.ts` | CRUD de produtos do estoque |
| `src/actions/stock-movements.ts` | Lançamentos de entrada/saída de estoque |
| `src/actions/financeiro.ts` | Consultas e ações do módulo financeiro |
| `src/actions/settings.ts` | Configurações da empresa |

### Páginas — `src/app/(dashboard)/`

| Arquivo | O que faz |
|---------|-----------|
| `src/app/(dashboard)/page.tsx` | Dashboard principal com KPIs |
| `src/app/(dashboard)/clientes/page.tsx` | Página de listagem de clientes — server-side, paginação, query ordenada por `full_name ASC` |
| `src/app/(dashboard)/clientes/clientes-client.tsx` | Client component — tabela, modal de cadastro/edição, botões Importar/Exportar, **autocomplete dropdown** |
| `src/app/(dashboard)/clientes/exportar/route.ts` | `GET /clientes/exportar` — exporta todos os clientes em CSV formato Bling com BOM UTF-8 |
| `src/app/(dashboard)/clientes/busca/route.ts` | `GET /clientes/busca?q=...` — retorna até 8 clientes em JSON para autocomplete (leve, sem dados completos) |
| `src/app/(dashboard)/pos/page.tsx` | Frente de Caixa — venda com seleção de cliente e Consumidor Final |
| `src/app/(dashboard)/estoque/page.tsx` | Listagem de produtos do estoque |
| `src/app/(dashboard)/estoque/[id]/page.tsx` | Detalhe do produto com histórico de lançamentos |
| `src/app/(dashboard)/financeiro/page.tsx` | Visão unificada financeira (SmartERP + CheckSmart) |
| `src/app/(dashboard)/crm/page.tsx` | Placeholder "Em breve" |
| `src/app/(dashboard)/relatorios/page.tsx` | Placeholder "Em breve" |
| `src/app/(dashboard)/meta-ads/page.tsx` | Placeholder "Em breve" |
| `src/app/(dashboard)/configuracoes/page.tsx` | Configurações da conta |

### Componentes — `src/components/`

| Arquivo | O que faz |
|---------|-----------|
| `src/components/layout/sidebar.tsx` | Sidebar de navegação com links dos módulos |
| `src/components/layout/topbar.tsx` | Barra superior com avatar e logout |
| `src/components/layout/coming-soon.tsx` | Componente de placeholder "Em breve" |
| `src/components/estoque/produto-modal.tsx` | Modal de cadastro/edição de produto |
| `src/components/estoque/lancamentos-modal.tsx` | Modal de lançamento de estoque |
| `src/components/estoque/stock-popover.tsx` | Popover de estoque rápido |
| `src/components/ui/address-fields.tsx` | `AddressCityState` — campos de cidade/UF com auto-fill pelo CEP via IBGE |

---

## CheckSmart — `/Users/uedson/checksmart/`

### Configuração

| Arquivo | O que faz |
|---------|-----------|
| `.env.local` | `SUPABASE_SERVICE_ROLE_KEY` está aqui — usar quando precisar de acesso admin ao banco |

### Server Actions — `src/actions/`

| Arquivo | O que faz |
|---------|-----------|
| `src/actions/create-order.ts` | Cria nova OS |
| `src/actions/update-order.ts` | Atualiza dados da OS |
| `src/actions/update-order-status.ts` | Muda status da OS (com log automático) |
| `src/actions/update-order-financials.ts` | Atualiza valores financeiros da OS |
| `src/actions/fetch-orders.ts` | Busca lista de OS com filtros |
| `src/actions/cancel-order.ts` | Cancela OS individual |
| `src/actions/bulk-cancel-orders.ts` | Cancela múltiplas OS em lote |
| `src/actions/bulk-delete-orders.ts` | Deleta múltiplas OS em lote |
| `src/actions/delete-order.ts` | Deleta OS individual |
| `src/actions/reactivate-order.ts` | Reativa OS cancelada |
| `src/actions/search-customers.ts` | Busca clientes ordenados por `full_name ASC` |
| `src/actions/upsert-customer.ts` | Cria ou atualiza cliente |
| `src/actions/import-customers.ts` | Importa clientes via CSV |
| `src/actions/search-devices.ts` | Busca dispositivos para autocomplete na OS |
| `src/actions/parts-catalog.ts` | Catálogo de peças para OS |
| `src/actions/add-order-part.ts` | Adiciona peça a uma OS |
| `src/actions/update-order-part.ts` | Atualiza peça de OS |
| `src/actions/update-checklist-item.ts` | Marca item do checklist da OS |
| `src/actions/save-signature.ts` | Salva assinatura digital do cliente |
| `src/actions/send-whatsapp.ts` | Envia link da OS via WhatsApp |
| `src/actions/upload-order-photo.ts` | Upload de foto na OS |
| `src/actions/upload-order-video.ts` | Upload de vídeo na OS |
| `src/actions/create-tenant-member.ts` | Adiciona membro à equipe |
| `src/actions/update-tenant-member.ts` | Atualiza membro da equipe |
| `src/actions/update-tenant-settings.ts` | Atualiza configurações do tenant |

### Páginas — `src/app/(dashboard)/`

| Arquivo | O que faz |
|---------|-----------|
| `src/app/(dashboard)/page.tsx` | Dashboard com KPIs de OS |
| `src/app/(dashboard)/orders/page.tsx` | Listagem de OS com filtros |
| `src/app/(dashboard)/orders/new/page.tsx` | Formulário de nova OS |
| `src/app/(dashboard)/orders/[id]/page.tsx` | Detalhe da OS |
| `src/app/(dashboard)/orders/[id]/exit/page.tsx` | Tela de saída/entrega do aparelho |
| `src/app/(dashboard)/customers/page.tsx` | Listagem de clientes (mesma base do SmartERP) |
| `src/app/(dashboard)/customers/new/page.tsx` | Formulário de novo cliente |
| `src/app/(dashboard)/customers/[id]/page.tsx` | Detalhe do cliente |
| `src/app/(dashboard)/customers/[id]/edit/page.tsx` | Edição do cliente |
| `src/app/(dashboard)/financial/page.tsx` | Financeiro das OS |
| `src/app/(dashboard)/reports/page.tsx` | Relatórios |
| `src/app/(dashboard)/settings/page.tsx` | Configurações da empresa e equipe |
| `src/app/onboarding/page.tsx` | Setup inicial do tenant |
| `src/app/orders/[id]/remote-sign/page.tsx` | Página pública para assinatura remota (sem auth) |

---

## Banco de Dados — Supabase

**URL:** `https://yhpogptfhjqwaetysboj.supabase.co`
**Credenciais:** ver `/Users/uedson/checksmart/.env.local`

### Tabelas principais

| Tabela | Colunas relevantes |
|--------|-------------------|
| `customers` | `id, tenant_id, full_name, trade_name, person_type, cpf_cnpj, whatsapp, phone, email, is_active, created_at` + 18 campos extras do Bling |
| `service_orders` | `id, tenant_id, customer_id (FK → customers.id NOT NULL)` |
| `sales` | `id, tenant_id, customer_id (FK → customers.id NOT NULL)` |
| `products` | `id, tenant_id, name, sku, price_cents, stock_qty` |
| `stock_movements` | `id, tenant_id, product_id, type (entrada/saida), qty` |

### Índices importantes

| Índice | Status | Observação |
|--------|--------|------------|
| `customers_tenant_cpf_unique` | ✅ Presente | Parcial: `WHERE cpf_cnpj IS NOT NULL` |
| `customers_tenant_whatsapp_unique` | ❌ Removido | Foi dropado em 23/04/2026 durante importação |

---

## Arquivos temporários (fora do projeto)

| Arquivo | O que faz |
|---------|-----------|
| `/tmp/fix_dates2.py` | Script Python para corrigir `created_at` de clientes — pode não existir mais |
| `/Users/uedson/Downloads/contatos_2026-04-22-19-26-24.csv` | CSV principal do Bling (1.702 clientes) |
| `/Users/uedson/Downloads/contatos_2026-04-16-*.csv` | CSVs parciais anteriores do Bling (7 arquivos) |
