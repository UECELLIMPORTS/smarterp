# Handoff de Sessão — SmartERP / CheckSmart

## 📅 Data da Sessão
**23/04/2026 (noite) → 24/04/2026 (madrugada)**

## 🏗️ Projetos Trabalhados
- **SmartERP** — `/Users/uedson/smarterp` (Next.js 16.2.4, TypeScript, Supabase) — 19 commits
- **CheckSmart** — `/Users/uedson/checksmart` (Next.js 15.3.9, TypeScript, Supabase) — 3 commits
- Banco Supabase compartilhado entre os dois
- Deploys Vercel: `UECELLIMPORTS/smarterp` e `UECELLIMPORTS/checksmart-grok`

---

## ✅ O que foi feito e FUNCIONOU

### Origem do Cliente ("Como nos conheceu?") — em ambos os sistemas
- Migração SQL 007: coluna `origin` em `customers` com CHECK (7 valores válidos) + índice parcial
- Módulo compartilhado `src/lib/customer-origin.ts` com opções, helpers e tipo `CustomerOrigin`
- Campo obrigatório com label dourada em TODAS as telas de cadastro:
  - SmartERP: **Clientes** (seção Comercial), **POS** (cadastro rápido), **POS** (coleta inline para cliente existente sem origem)
  - CheckSmart: **Clientes** (nova card dourada), **OS → Novo Cliente**, **OS → Cliente Existente** (caixa dourada quando falta origem)
- Action leve `updateCustomerOrigin()` em ambos — só atualiza origem sem mexer no resto
- Bloqueia finalização de venda/OS se cliente real não tiver origem
- **Arquivos principais:**
  - `infra/supabase/migrations/007_customer_origin.sql` (SmartERP)
  - `src/lib/customer-origin.ts` (ambos)
  - `src/actions/pos.ts`, `src/actions/update-customer-origin.ts`
  - `src/components/customers/customer-form.tsx`, `src/components/orders/new-order-form.tsx` (CheckSmart)
  - `src/app/(dashboard)/clientes/clientes-client.tsx`, `src/app/(dashboard)/pos/pos-client.tsx` (SmartERP)

### Paridade total de campos CheckSmart ↔ SmartERP
- Tipo `customers` do CheckSmart ganhou 17 colunas que o SmartERP já usava (trade_name, person_type, ie_rg, is_active, phone, nfe_email, website, birth_date, gender, marital_status, profession, father_name/cpf, mother_name/cpf, salesperson, contact_type, credit_limit_cents)
- CustomerForm redesenhado em 8 seções (Dados Básicos, Contato, Endereço com CEP auto-preenche, Dados Pessoais, Filiação, Comercial, Origem, Observações)
- Data de nascimento com máscara DD/MM/AAAA via novo componente `DateTextInput`
- Mesmo formulário aplicado em `Novo Cliente` da OS
- **Arquivos:** `src/types/database.ts`, `src/actions/upsert-customer.ts`, `src/actions/create-order.ts`, `src/lib/validations/order.ts`, `src/components/customers/customer-form.tsx`, `src/components/orders/new-order-form.tsx`, `src/components/ui/date-text-input.tsx` (todos no CheckSmart)

### Seção "Origem dos Clientes" no ERP Clientes
- Ranking completo com share %, faturamento, lucro, clientes únicos, ticket médio e transações por canal
- Banner de insight destacando canal #1 (ex: "Instagram Pago é seu principal canal — 45% do faturamento")
- Cores fixas por canal (Instagram rosa, Google azul Google, Facebook azul Facebook, Indicação verde, etc.)
- Filtros Ambos/SmartERP/CheckSmart + Faturamento/Lucro

### Heatmap por Dia da Semana — expandido e melhor
- Cada card mostra **Faturamento + Lucro (verde) + Número de Vendas** juntos
- Toggle Sistema (Ambos/SmartERP/CheckSmart) — cada dia tem métricas separadas por sistema
- Toggle Métrica (Faturamento/Lucro) — controla ordenação e destaque TOP
- Filtro de datas customizadas no header (`?period=custom&from=X&to=Y`)
- Alerta âmbar quando métrica=Lucro avisando sobre custos não cadastrados

### Top Clientes — filtros por sistema + lucro
- Filtro Ambos/SmartERP/CheckSmart reordena ranking pelo sistema escolhido
- Novas colunas **Faturamento** e **Lucro** lado a lado
- Server manda top 30, client filtra top 10 dinamicamente

### Clientes em Risco de Perda — 4 melhorias grandes
1. Coluna **Contato**: ícone verde WhatsApp (abre `wa.me` com mensagem pré-pronta), ícone azul Telefone (`tel:`), número formatado
2. Filtro por **origem** (incluindo "Sem origem informada")
3. Botão **Exportar CSV** (BOM UTF-8, separador `;`, respeita filtros, nome do arquivo tem a data)
4. Threshold **configurável** (1-180 dias) em vez de fixo em 60
- Server agora manda até 100 clientes ativos nos últimos 6m (filter no client)

### KPI Cards Recorrentes vs Novos
- Mostram lucro em verde abaixo do faturamento + margem em %
- Ex: "Recorrentes R$ 5.200 / Lucro R$ 1.800 · margem 35%"

### Evolução Mensal (BarChart)
- Toggle Faturamento/Lucro no canto do gráfico
- Altura das barras recalcula conforme métrica

### Fix: OS só conta no ERP Clientes quando entregue
- Query trocou `.neq('status', 'Cancelado')` por `.in('status', ['delivered', 'Entregue'])`
- Antes: cliente aparecia no ranking assim que entregava aparelho pra conserto
- Agora: só depois de receber de volta

### Fix: estoque — saída aparece no histórico ao vender
- Venda no PDV chamava RPC `decrement_product_stock` que não criava `stock_movement`
- Todas as 7 operações de venda foram refatoradas para **criar stock_movements** com origem (`sale:...`, `sale-cancel:...`, `sale-reactivate:...`, etc.) — a trigger do banco cuida do decremento
- UI do histórico traduz origem em labels (Manual, Balanço, Venda PDV, Venda cancelada, etc.)

### Layout estilo Bling no histórico de estoque
- 3 cards de totalizadores (Entradas qty+R$, Saídas qty+R$, Saldo atual)
- Colunas: Data | **Entrada** | **Saída** | Pr. Venda | Pr. Compra | Pr. Custo | Saldo | Observação | Origem
- Origem virou badge colorido por tipo

### Botão "Reconciliar vendas antigas"
- Aparece no aviso amarelo de divergência
- Busca sale_items sem stock_movement correspondente e cria retroativamente (com `created_at` da venda original para manter cronologia)
- Seguro contra duplicação

### Fix: lucro atualiza ao editar custo no estoque
- Editar cost_price em um stock_movement não atualizava `products.cost_cents` (a trigger só roda em INSERT)
- `updateMovement` agora sincroniza manualmente quando a entrada muda preço de compra/custo
- `updateProduct` e `updateProductPrice` ganharam `revalidatePath('/erp-clientes')`

### Fix: nome de produto cortado no Estoque
- `truncate` → `break-words`, coluna 1fr → minmax(280px, 2fr), minWidth 900→1100

### Fix: busca de produto ao Registrar Venda no Financeiro
- Input perdia foco após adicionar primeiro produto — agora re-foca automaticamente
- Dropdown mostra estado "Buscando…" e "Nenhum produto encontrado" (com atalho pra adicionar manual)
- z-index 10→30

### Fix: botão "Editar venda" não abria modal
- Bug sutil: tipo `FinanceiroRow.date` era `Date`, mas Next.js serializa Date como string em props Server→Client
- `row.date.toISOString()` lançava TypeError silencioso e `setEsRow` nunca era chamado
- Reativar funcionava porque não tocava em `row.date`
- Corrigido com normalização `row.date instanceof Date ? row.date : new Date(row.date)` em `openEditSale` e `openEditDate`

### Melhoria visual do menu de ações do Financeiro
- Fundo transparente deixava texto da tabela atrás vazar — agora sólido `#0F1A2B`
- Hover usa cor da ação (ciano/verde/vermelho/amarelo)
- Separador + `font-semibold` no "Excluir venda" pra sinalizar ação destrutiva

### Badge Novo/Recorrente na tabela do Financeiro
- Ao lado do nome do cliente, badge verde "Recorrente" ou roxo "Novo"
- Lógica: registrado nos últimos 30 dias = Novo

### Outros fixes
- Paginação/busca em `/clientes` do SmartERP (key no ClientesClient)
- Campo "Cliente desde" editável no modal (atualiza `created_at` — propaga para relatórios)
- DateTextInput com máscara DD/MM/AAAA (elimina calendário nativo confuso)
- Labels visíveis em "Dados Pessoais" (antes era só ícone)

---

## ⚠️ O que foi feito mas NÃO funcionou

### Deploy CheckSmart `92eeexqg7` — erro de clonagem GitHub
- **O que aconteceu:** Vercel retornou HTTP 500 ao tentar clonar o repo
- **Causa:** problema temporário do GitHub (não do código)
- **Resolvido:** na tentativa seguinte subiu normal

### Join aninhado `sale_items → products(cost_cents)`
- **O que aconteceu:** query retornava vazia
- **Causa:** `sale_items.product_id` aponta pra `products` OU `parts_catalog`, Supabase REST não resolve a ambiguidade
- **Descartado:** join aninhado
- **Aplicado:** query separada paralela nas duas tabelas + `Map<id, cost_cents>` em memória

---

## 🔄 O que está pela metade

### Lucro "snapshot" em vendas históricas
- Hoje o ERP Clientes usa `products.cost_cents` (custo atual) × qty — se o custo mudar depois, o lucro recalcula retroativamente
- Próximo passo: migration pra `sale_items.cost_snapshot_cents`, preencher em `createSale` com o custo corrente, usar no ERP Clientes com fallback pro custo atual
- Motivação: auditoria contábil fidedigna

### Origem nas listagens do CheckSmart e filtro em Relatórios
- ERP Clientes já mostra origem. Falta: coluna origem no CheckSmart e filtro de origem em Relatórios do SmartERP

### Vault Obsidian
- Usuário mencionou que queria enviar resumos de sessão pro Obsidian, mas isso ainda não foi feito
- Ação: perguntar o caminho do vault, estrutura desejada, e configurar

---

## 📋 Fila para a próxima sessão

1. Contato clicável (WhatsApp/telefone) em **Top Clientes** também
2. Filtro por origem no módulo **Relatórios**
3. **Dashboard principal (`/`)** com gráfico de rosca de origem e destaques de margem
4. **Dashboard do CheckSmart** com analytics similares (origem, RFM)
5. `sale_items.cost_snapshot_cents` para lucro histórico fidedigno
6. Configurar vault do Obsidian para resumos de sessão
7. Módulos CRM e Meta Ads ainda estão "Em breve"

---

## ⚡ Prompt pronto para retomar amanhã

```
Continuando o desenvolvimento do SmartERP + CheckSmart.

Caminhos:
- SmartERP: /Users/uedson/smarterp
- CheckSmart: /Users/uedson/checksmart
Stack: Next.js 16 (SmartERP) / 15 (CheckSmart), Supabase, TypeScript
Supabase: banco compartilhado entre os dois sistemas

O QUE ESTÁ PRONTO (ver _docs/status-desenvolvimento.md):
✅ Origem do Cliente obrigatório em todas as telas (SmartERP + CheckSmart)
✅ ERP Clientes completo com filtros sistema + lucro + datas customizadas
✅ Origem dos Clientes com ranking e insights
✅ Top Clientes, Churn, Heatmap, KPIs e Evolução com filtros completos
✅ Clientes em Risco com WhatsApp clicável, origem, CSV e threshold
✅ CheckSmart com todos os campos do SmartERP
✅ Fix de saída de estoque aparecendo no histórico
✅ Layout Bling no histórico de estoque
✅ Fix de "Editar venda" no Financeiro
✅ OS do CheckSmart só conta no ERP Clientes quando entregue

O QUE ESTÁ PENDENTE (ver _docs/pendencias.md):
🟡 Contato clicável em Top Clientes
🟡 Filtro de origem em Relatórios
🟡 Dashboard principal com gráficos de origem
🟡 Dashboard CheckSmart com analytics
🟢 sale_items.cost_snapshot_cents para lucro histórico
🟢 Vault Obsidian para resumos de sessão

Leia _docs/pendencias.md e _docs/bugs.md antes de começar.
O que você quer trabalhar hoje?
```
