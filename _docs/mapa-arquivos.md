# Mapa de Arquivos — SmartERP & CheckSmart

> Atualizado em: 23/04/2026

---

## SmartERP — `/Users/uedson/smarterp/src/`

### Autenticação e configuração de tenant

| Arquivo | O que faz |
|---------|-----------|
| `lib/supabase/server.ts` | `requireAuth()` — valida sessão e retorna `{ supabase, user }`. Obrigatório em toda Server Action e Route Handler |
| `lib/supabase/client.ts` | Cliente Supabase para uso em componentes client-side |
| `lib/tenant.ts` | `getTenantId(user)` — extrai o `tenant_id` do usuário logado |

### Server Actions — `src/actions/`

| Arquivo | O que faz |
|---------|-----------|
| `actions/clientes.ts` | `importCustomersFromBling(csvText)` — parser de CSV do Bling + UPSERT paginado no banco |
| `actions/pos.ts` | `createCustomer()`, `updateCustomer()` — criação e edição de clientes usadas no modal |
| `actions/products.ts` | CRUD de produtos do estoque |
| `actions/stock-movements.ts` | Lançamentos de entrada e saída de estoque |
| `actions/financeiro.ts` | Consultas e operações do módulo financeiro |
| `actions/settings.ts` | Salva configurações da empresa |

### Páginas do dashboard — `src/app/(dashboard)/`

| Arquivo | O que faz |
|---------|-----------|
| `app/(dashboard)/page.tsx` | Dashboard principal com KPIs gerais |
| `app/(dashboard)/clientes/page.tsx` | Listagem server-side de clientes — paginação, busca, ordenação por nome |
| `app/(dashboard)/clientes/clientes-client.tsx` | Componente client — tabela, modal de cadastro/edição, botões Importar/Exportar, autocomplete |
| `app/(dashboard)/clientes/exportar/route.ts` | `GET /clientes/exportar` — baixa todos os clientes em CSV formato Bling |
| `app/(dashboard)/clientes/busca/route.ts` | `GET /clientes/busca?q=...` — retorna até 8 clientes em JSON para o autocomplete |
| `app/(dashboard)/pos/page.tsx` | Frente de Caixa — registro de venda com seleção de cliente |
| `app/(dashboard)/estoque/page.tsx` | Listagem de produtos com filtros |
| `app/(dashboard)/estoque/[id]/page.tsx` | Detalhe do produto com histórico de lançamentos |
| `app/(dashboard)/financeiro/page.tsx` | Visão unificada de receitas (SmartERP + CheckSmart) |
| `app/(dashboard)/configuracoes/page.tsx` | Configurações da conta |
| `app/(dashboard)/crm/page.tsx` | Placeholder "Em breve" |
| `app/(dashboard)/relatorios/page.tsx` | Placeholder "Em breve" |
| `app/(dashboard)/meta-ads/page.tsx` | Placeholder "Em breve" |

### Componentes — `src/components/`

| Arquivo | O que faz |
|---------|-----------|
| `components/layout/sidebar.tsx` | Menu lateral com todos os links de navegação |
| `components/layout/topbar.tsx` | Barra superior com avatar do usuário e botão de logout |
| `components/layout/coming-soon.tsx` | Tela de "Em breve" usada pelos módulos não iniciados |
| `components/estoque/produto-modal.tsx` | Modal de cadastro e edição de produto |
| `components/estoque/lancamentos-modal.tsx` | Modal de lançamento de entrada/saída de estoque |
| `components/estoque/stock-popover.tsx` | Popover de estoque rápido (mini-visualização) |
| `components/ui/address-fields.tsx` | Campos de cidade/UF com auto-preenchimento pelo CEP via API do IBGE |

---

## CheckSmart — `/Users/uedson/checksmart/src/`

### Server Actions — `src/actions/`

| Arquivo | O que faz |
|---------|-----------|
| `actions/create-order.ts` | Cria nova Ordem de Serviço |
| `actions/update-order.ts` | Atualiza dados gerais da OS |
| `actions/update-order-status.ts` | Muda o status da OS com log automático |
| `actions/update-order-financials.ts` | Atualiza valores financeiros da OS |
| `actions/fetch-orders.ts` | Busca lista de OS com filtros aplicados |
| `actions/cancel-order.ts` | Cancela uma OS individual |
| `actions/bulk-cancel-orders.ts` | Cancela múltiplas OS de uma vez |
| `actions/bulk-delete-orders.ts` | Deleta múltiplas OS de uma vez |
| `actions/delete-order.ts` | Deleta uma OS individual |
| `actions/reactivate-order.ts` | Reativa uma OS que estava cancelada |
| `actions/search-customers.ts` | Busca clientes ordenados por nome A→Z |
| `actions/upsert-customer.ts` | Cria ou atualiza um cliente |
| `actions/import-customers.ts` | Importa clientes via CSV |
| `actions/search-devices.ts` | Autocomplete de dispositivos na abertura de OS |
| `actions/parts-catalog.ts` | Catálogo de peças para adicionar a uma OS |
| `actions/add-order-part.ts` | Adiciona peça a uma OS |
| `actions/update-order-part.ts` | Atualiza preço ou quantidade de uma peça na OS |
| `actions/update-checklist-item.ts` | Marca item do checklist de diagnóstico |
| `actions/save-signature.ts` | Salva assinatura digital do cliente na OS |
| `actions/send-whatsapp.ts` | Envia link da OS via WhatsApp |
| `actions/upload-order-photo.ts` | Faz upload de foto na OS |
| `actions/upload-order-video.ts` | Faz upload de vídeo na OS |
| `actions/update-tenant-settings.ts` | Salva configurações do negócio |
| `actions/create-tenant-member.ts` | Adiciona membro da equipe |
| `actions/update-tenant-member.ts` | Atualiza dados de membro da equipe |

### Páginas — `src/app/`

| Arquivo | O que faz |
|---------|-----------|
| `app/(dashboard)/page.tsx` | Dashboard com KPIs de OS abertas, receita e técnicos |
| `app/(dashboard)/orders/page.tsx` | Listagem de OS com filtros por status, técnico e data |
| `app/(dashboard)/orders/new/page.tsx` | Formulário de abertura de nova OS |
| `app/(dashboard)/orders/[id]/page.tsx` | Detalhe completo da OS — checklist, peças, fotos, log |
| `app/(dashboard)/orders/[id]/exit/page.tsx` | Tela de entrega do aparelho com assinatura |
| `app/(dashboard)/customers/page.tsx` | Listagem de clientes (mesma base do SmartERP) |
| `app/(dashboard)/customers/new/page.tsx` | Formulário de novo cliente |
| `app/(dashboard)/customers/[id]/page.tsx` | Perfil do cliente com histórico de OS |
| `app/(dashboard)/customers/[id]/edit/page.tsx` | Edição do cadastro do cliente |
| `app/(dashboard)/financial/page.tsx` | Resumo financeiro das OS |
| `app/(dashboard)/reports/page.tsx` | Relatórios (dados limitados) |
| `app/(dashboard)/settings/page.tsx` | Configurações da empresa e equipe |
| `app/onboarding/page.tsx` | Setup inicial do tenant (primeiro acesso) |
| `app/orders/[id]/remote-sign/page.tsx` | Página pública de assinatura remota — sem login, acesso do cliente pelo celular |

---

## Banco de Dados — Supabase

**URL:** `https://yhpogptfhjqwaetysboj.supabase.co`
**Credenciais:** `/Users/uedson/checksmart/.env.local` (contém `SUPABASE_SERVICE_ROLE_KEY`)

| Tabela | O que armazena |
|--------|---------------|
| `customers` | Clientes — compartilhada entre SmartERP e CheckSmart. 1.792 registros. |
| `service_orders` | Ordens de serviço do CheckSmart. FK `customer_id → customers.id` (sem CASCADE) |
| `sales` | Vendas do POS do SmartERP. FK `customer_id → customers.id` (sem CASCADE) |
| `products` | Catálogo de produtos e estoque |
| `stock_movements` | Histórico de entradas e saídas de estoque |

| Índice | Status |
|--------|--------|
| `customers_tenant_cpf_unique` | ✅ Ativo — garante CPF único por tenant |
| `customers_tenant_whatsapp_unique` | ❌ Removido em 23/04/2026 — não garante mais unicidade de WhatsApp |

---

## CSVs do Bling (Downloads)

| Arquivo | O que é |
|---------|---------|
| `/Users/uedson/Downloads/contatos_2026-04-22-19-26-24.csv` | Export principal do Bling com 1.702 clientes — é o arquivo mais completo |
| `/Users/uedson/Downloads/contatos_2026-04-16-*.csv` | 7 exports parciais anteriores — usados como fonte adicional de datas |
