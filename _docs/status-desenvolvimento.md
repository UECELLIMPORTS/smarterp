# Status de Desenvolvimento — SmartERP & CheckSmart

> Atualizado em: **24/04/2026**

---

## SmartERP — `/Users/uedson/smarterp`

| Módulo | Status | Observação | Última atualização |
|--------|--------|------------|-------------------|
| **Dashboard** | ✅ Concluído | KPIs gerais, cards de resumo | — |
| **Frente de Caixa (POS)** | ✅ Concluído | Venda, seleção de cliente, Consumidor Final pré-selecionado, cadastro rápido com **origem obrigatória**, badge de origem no card do cliente, coleta inline quando cliente existente está sem origem | 23/04/2026 |
| **Clientes — listagem** | ✅ Concluído | Paginação server-side (100/pág), ordenação por nome A→Z, busca por nome/CPF/WhatsApp | 23/04/2026 |
| **Clientes — autocomplete** | ✅ Concluído | Dropdown em <300ms ao digitar 3+ letras via `/clientes/busca` | 23/04/2026 |
| **Clientes — cadastro/edição** | ✅ Concluído | Modal com 7 seções; campos **Cliente desde** editável (máscara DD/MM/AAAA) e **origem obrigatória**; Data de nascimento via DateTextInput | 23/04/2026 |
| **Clientes — importar Bling** | ✅ Concluído | UPSERT via CSV do Bling; match CPF→WhatsApp→Nome | 23/04/2026 |
| **Clientes — exportar CSV** | ✅ Concluído | Formato Bling, BOM UTF-8, todos os campos | 23/04/2026 |
| **Estoque — listagem** | ✅ Concluído | Grid de produtos com filtros, nome quebra em múltiplas linhas (sem truncate) | 23/04/2026 |
| **Estoque — cadastro/edição** | ✅ Concluído | Modal de produto com imagem | — |
| **Estoque — lançamentos/histórico** | ✅ Concluído | Layout estilo Bling: 3 cards de totalizadores, colunas Entrada/Saída/Pr.Venda/Pr.Compra/Pr.Custo, badge de origem colorido, botão reconciliar vendas antigas. Edição de custo sincroniza com `products.cost_cents` | 24/04/2026 |
| **Financeiro** | ✅ Concluído | Visão unificada SmartERP + CheckSmart; badge Novo/Recorrente no cliente; menu de ações com fundo sólido e hover colorido; Editar venda funcional (fix Date Server→Client); busca de produto com estados claros (Buscando/Nenhum/Lista) | 24/04/2026 |
| **ERP Clientes** | ✅ Concluído | Dashboard analítico completo com filtros Ambos/SmartERP/CheckSmart + Faturamento/Lucro + datas customizadas. Seções: Comparativo de Sistemas, Origem dos Clientes, KPIs Recorrentes vs Novos, Evolução Mensal, RFM, Heatmap, Clientes em Risco (com WhatsApp clicável + CSV + threshold), Top Clientes | 24/04/2026 |
| **CRM** | ⏳ Não iniciado | Exibe placeholder "Em breve" | — |
| **Relatórios** | ⏳ Não iniciado | Exibe placeholder "Em breve" — falta filtro por origem | — |
| **Meta Ads** | ⏳ Não iniciado | Exibe placeholder "Em breve" | — |
| **Configurações** | 🔄 Em andamento | Parcialmente implementado | — |
| **Autenticação** | ✅ Concluído | Login/logout via Supabase Auth, middleware de proteção de rotas | — |

---

## CheckSmart — `/Users/uedson/checksmart`

| Módulo | Status | Observação | Última atualização |
|--------|--------|------------|-------------------|
| **Dashboard** | ✅ Concluído | KPIs de OS, receita, ranking de técnicos | — |
| **Ordens de Serviço — listagem** | ✅ Concluído | Filtros por status, técnico, data; paginação | — |
| **Ordens de Serviço — nova** | ✅ Concluído | Formulário completo com **mesmos campos do SmartERP** (8 seções), incluindo endereço com CEP auto-preenche e **origem obrigatória** | 23/04/2026 |
| **Ordens de Serviço — detalhe** | ✅ Concluído | Visualização completa, log de status, fotos, vídeos, assinatura | — |
| **Ordens de Serviço — saída** | ✅ Concluído | Tela de entrega do aparelho com assinatura digital | — |
| **OS — assinatura remota** | ✅ Concluído | Link público para cliente assinar no celular sem login | — |
| **OS — envio WhatsApp** | ✅ Concluído | Envia link da OS via WhatsApp | — |
| **OS — cancelamento em lote** | ✅ Concluído | Bulk cancel/delete de múltiplas OS | — |
| **Clientes — listagem** | ✅ Concluído | Busca por nome (A→Z), integrada ao mesmo banco do SmartERP | — |
| **Clientes — novo/editar** | ✅ Concluído | Formulário com paridade total ao SmartERP — 8 seções (Básicos, Contato, Endereço, Dados Pessoais, Filiação, Comercial, Origem, Observações) | 23/04/2026 |
| **Clientes — importar** | ✅ Concluído | Import via CSV (action `import-customers.ts`) | — |
| **Financeiro** | ✅ Concluído | Resumo de receitas por OS | — |
| **Relatórios** | 🔄 Em andamento | Página existe mas dados limitados | — |
| **Configurações** | ✅ Concluído | Dados da empresa, membros da equipe | — |
| **Onboarding** | ✅ Concluído | Fluxo de setup inicial do tenant | — |
| **Autenticação** | ✅ Concluído | Login, registro, proteção de rotas via middleware | — |

---

## Banco de Dados — Supabase

| Tabela / Índice | Status | Observação |
|----|--------|------------|
| `customers` | ✅ OK | Coluna `origin` adicionada (migração 007); CHECK constraint com 7 valores válidos; índice parcial |
| `service_orders` | ✅ OK | Status usados: `received`, `diagnosing`, `waiting_parts`, `in_repair`, `ready`, `delivered`, `cancelled` |
| `sales` | ✅ OK | Vendas do POS; `sale_items` com `product_id` aponta pra `products` OU `parts_catalog` |
| `products` | ✅ OK | Catálogo de produtos/estoque; `cost_cents` usado pelo ERP Clientes para calcular lucro |
| `parts_catalog` | ✅ OK | Peças de OS, separado de `products` |
| `stock_movements` | ✅ OK | Toda venda agora cria movement `saida` com origem `sale:{id}`; trigger faz decremento automático |
| Índice `customers_tenant_whatsapp_unique` | ❌ Removido | Dropado durante importação Bling; não recriado |
| Índice `customers_tenant_cpf_unique` | ✅ Presente | Parcial (WHERE cpf_cnpj IS NOT NULL) |
| Índice `customers_origin_idx` | ✅ Presente | Parcial (WHERE origin IS NOT NULL) |
