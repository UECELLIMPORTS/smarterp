# Status de Desenvolvimento — SmartERP & CheckSmart

> Atualizado em: 23/04/2026

---

## SmartERP — `/Users/uedson/smarterp`

| Módulo | Status | Observação | Última atualização |
|--------|--------|------------|-------------------|
| **Dashboard** | ✅ Concluído | KPIs gerais, cards de resumo | — |
| **Frente de Caixa (POS)** | ✅ Concluído | Venda, seleção de cliente, Consumidor Final pré-selecionado, cadastro rápido de cliente | — |
| **Clientes — listagem** | ✅ Concluído | Paginação server-side (100/pág), ordenação por nome A→Z, busca por nome/CPF/WhatsApp | 23/04/2026 |
| **Clientes — autocomplete** | ✅ Concluído | Dropdown em <300ms ao digitar 3+ letras via `/clientes/busca` | 23/04/2026 |
| **Clientes — cadastro/edição** | ✅ Concluído | Modal completo: dados pessoais, endereço (CEP auto-fill), observações | — |
| **Clientes — importar Bling** | ✅ Concluído | UPSERT via CSV do Bling; match CPF→WhatsApp→Nome | 23/04/2026 |
| **Clientes — exportar CSV** | ✅ Concluído | Formato Bling, BOM UTF-8, todos os campos | 23/04/2026 |
| **Estoque — listagem** | ✅ Concluído | Grid de produtos com filtros | — |
| **Estoque — cadastro/edição** | ✅ Concluído | Modal de produto com imagem | — |
| **Estoque — lançamentos** | ✅ Concluído | Entrada/saída com histórico | — |
| **Financeiro** | ✅ Concluído | Visão unificada SmartERP + CheckSmart, registro de pagamento de OS | — |
| **CRM** | ⏳ Não iniciado | Exibe placeholder "Em breve" | — |
| **Relatórios** | ⏳ Não iniciado | Exibe placeholder "Em breve" | — |
| **Meta Ads** | ⏳ Não iniciado | Exibe placeholder "Em breve" | — |
| **Configurações** | 🔄 Em andamento | Parcialmente implementado | — |
| **Autenticação** | ✅ Concluído | Login/logout via Supabase Auth, middleware de proteção de rotas | — |

---

## CheckSmart — `/Users/uedson/checksmart`

| Módulo | Status | Observação | Última atualização |
|--------|--------|------------|-------------------|
| **Dashboard** | ✅ Concluído | KPIs de OS, receita, ranking de técnicos | — |
| **Ordens de Serviço — listagem** | ✅ Concluído | Filtros por status, técnico, data; paginação | — |
| **Ordens de Serviço — nova** | ✅ Concluído | Formulário completo: cliente, dispositivo, checklist, peças | — |
| **Ordens de Serviço — detalhe** | ✅ Concluído | Visualização completa, log de status, fotos, vídeos, assinatura | — |
| **Ordens de Serviço — saída** | ✅ Concluído | Tela de entrega do aparelho com assinatura digital | — |
| **OS — assinatura remota** | ✅ Concluído | Link público para cliente assinar no celular sem login | — |
| **OS — envio WhatsApp** | ✅ Concluído | Envia link da OS via WhatsApp | — |
| **OS — cancelamento em lote** | ✅ Concluído | Bulk cancel/delete de múltiplas OS | — |
| **Clientes — listagem** | ✅ Concluído | Busca por nome (A→Z), integrada ao mesmo banco do SmartERP | — |
| **Clientes — novo/editar** | ✅ Concluído | Formulário completo, validação de duplicatas | — |
| **Clientes — importar** | ✅ Concluído | Import via CSV (action `import-customers.ts`) | — |
| **Financeiro** | ✅ Concluído | Resumo de receitas por OS | — |
| **Relatórios** | 🔄 Em andamento | Página existe mas dados limitados | — |
| **Configurações** | ✅ Concluído | Dados da empresa, membros da equipe | — |
| **Onboarding** | ✅ Concluído | Fluxo de setup inicial do tenant | — |
| **Autenticação** | ✅ Concluído | Login, registro, proteção de rotas via middleware | — |

---

## Banco de Dados — Supabase

| Tabela | Status | Observação |
|--------|--------|------------|
| `customers` | ✅ OK | 1.792 registros; 516 com `created_at` = hoje sem data real disponível |
| `service_orders` | ✅ OK | Referencia `customers.id` com FK NOT NULL (sem CASCADE) |
| `sales` | ✅ OK | Vendas do POS |
| `products` | ✅ OK | Catálogo de produtos/estoque |
| `stock_movements` | ✅ OK | Entradas e saídas de estoque |
| Índice `customers_tenant_whatsapp_unique` | ❌ Removido | Foi dropado durante importação do Bling; não recriado |
| Índice `customers_tenant_cpf_unique` | ✅ Presente | Parcial (WHERE cpf_cnpj IS NOT NULL) |
