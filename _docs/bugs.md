# Registro de Bugs — SmartERP / CheckSmart

> Atualizado em: **24/04/2026**

---

**BUG-001** *(resolvido)*
- 📍 Onde: Banco `customers`
- 🔴 Descrição: 987 clientes importados ficaram com `created_at = 16/04/2026`
- 🛠️ Status: Resolvido parcialmente — 986 deletados e reimportados. 1 mantido (ver BUG-003)
- 📅 Data: 23/04/2026

**BUG-002** *(contornado)*
- 📍 Onde: Banco `customers` (516 registros)
- 🔴 Descrição: 516 clientes com `created_at = 23/04/2026`; Bling não tem a data real
- 🛠️ Status: Contornado com ordenação alfabética + campo "Cliente desde" editável no modal
- 📅 Data: 23/04/2026

**BUG-003** *(aberto)*
- 📍 Onde: 1 cliente com `created_at = 16/04/2026`
- 🔴 Descrição: Tem venda vinculada, FK `sales.customer_id` sem CASCADE impede deleção
- 📋 Próximo passo: `UPDATE customers SET created_at = 'YYYY-MM-DDT12:00:00+00:00' WHERE id = '<uuid>'`
- 📅 Data: 23/04/2026

**BUG-004** *(contornado)*
- 📍 Índice `customers_tenant_whatsapp_unique`
- 🔴 Descrição: Clientes Bling com mesmo WhatsApp batiam no unique
- 🛠️ Status: Índice removido pelo usuário. Banco não garante mais unicidade de WhatsApp
- 📅 Data: 23/04/2026

**BUG-005** *(resolvido)*
- 📍 `src/actions/clientes.ts`
- 🔴 Descrição: Insert em lote falhava com "All object keys must match"
- ✅ Solução: insert individual por registro
- 📅 Data: 23/04/2026

**BUG-006** *(resolvido)*
- 📍 `src/actions/clientes.ts`
- 🔴 Descrição: Clientes existentes parecendo novos (limite 1.000 do REST)
- ✅ Solução: Carregamento paginado em loop
- 📅 Data: 23/04/2026

**BUG-007** *(resolvido)*
- 📍 SmartERP → busca de Clientes
- 🔴 Descrição: Busca lenta (debounce de 400ms + reload de página)
- ✅ Solução: Autocomplete leve via `/clientes/busca` (200ms)
- 📅 Data: 23/04/2026

---

## Bugs descobertos/corrigidos em 23-24/04/2026

**BUG-008** *(resolvido)*
- 📍 SmartERP → lista de Clientes
- 🔴 Descrição: Ao paginar ou buscar, a lista não atualizava — contador mudava mas as linhas permaneciam as mesmas
- 🔍 Causa: `useState(initial)` só usa o valor inicial no primeiro mount. Server mandava nova página mas o componente stale state no client
- ✅ Solução: `key={`${page}-${q}`}` no `ClientesClient` força remount quando page/query muda
- 📅 Data: 23/04/2026

**BUG-009** *(resolvido)*
- 📍 SmartERP → modal "Editar Cliente"
- 🔴 Descrição: Campo de data (Data de nascimento) usava `<input type="date">` com calendário nativo difícil de navegar
- ✅ Solução: Novo componente `DateTextInput` com máscara DD/MM/AAAA (só dígitos)
- 📅 Data: 23/04/2026

**BUG-010** *(resolvido)*
- 📍 ERP Clientes → filtro "SmartERP" do Heatmap
- 🔴 Descrição: Ao filtrar por SmartERP no Heatmap, nenhum dado aparecia — só "Ambos" e "CheckSmart" funcionavam
- 🔍 Causa: Join aninhado `sale_items → products(cost_cents)` no Supabase REST retornava vazio — `sale_items.product_id` aponta pra `products` OU `parts_catalog`, Supabase não resolve ambiguidade
- ✅ Solução: Query separada paralela das duas tabelas + `Map<id, cost_cents>` em memória
- 📅 Data: 24/04/2026

**BUG-011** *(resolvido)*
- 📍 Estoque → histórico de movimentações do produto
- 🔴 Descrição: Ao vender um produto, a saída não aparecia no histórico. Saldo atual mudava mas stock_movements não registrava
- 🔍 Causa: `createSale` chamava RPC `decrement_product_stock` que só atualizava `stock_qty` sem criar movement
- ✅ Solução: Substituído RPC por insert em `stock_movements` type='saida' nas 7 operações que mexem em estoque (venda, cancelar, reativar, editar data, venda manual, bulkCancel). A trigger do banco cuida do decremento automático
- 📅 Data: 24/04/2026

**BUG-012** *(resolvido)*
- 📍 ERP Clientes → cálculo de lucro
- 🔴 Descrição: Ao editar o "Preço de Custo" de uma entrada no histórico, o lucro no ERP Clientes continuava usando o valor antigo
- 🔍 Causa: A trigger `trg_sync_product_after_movement` do Postgres só roda em INSERT, não em UPDATE. Edição de custo atualizava `stock_movements` mas `products.cost_cents` ficava defasado
- ✅ Solução: `updateMovement` agora sincroniza manualmente `products.purchase_price_cents` e `products.cost_cents` quando a entrada é editada. Também adicionado `revalidatePath('/erp-clientes')` em `updateProduct` e `updateMovement`
- 📅 Data: 24/04/2026

**BUG-013** *(resolvido)*
- 📍 ERP Clientes → todas as seções
- 🔴 Descrição: OS aparecia no ranking/faturamento/lucro assim que era aberta, mesmo antes de o aparelho ser entregue ao cliente
- 🔍 Causa: Query filtrava `.neq('status', 'Cancelado')` — qualquer status diferente de cancelado entrava
- ✅ Solução: Trocado por `.in('status', ['delivered', 'Entregue'])` nas duas queries de service_orders
- 📅 Data: 24/04/2026

**BUG-014** *(resolvido)*
- 📍 Financeiro → Registrar Venda → busca de produto
- 🔴 Descrição: Após adicionar o primeiro produto, o segundo produto "não funcionava" — dropdown não aparecia
- 🔍 Causa dupla: (1) Input perdia foco após adicionar; (2) Dropdown só aparecia com resultados — se vazio ou carregando, nada aparecia
- ✅ Solução: (1) Re-foca automaticamente via `useRef`+`.focus()`; (2) Dropdown visível com estados "Buscando…", "Nenhum produto encontrado" (+atalho manual) ou lista
- 📅 Data: 24/04/2026

**BUG-015** *(resolvido)*
- 📍 Financeiro → botão "Editar venda" em venda cancelada
- 🔴 Descrição: Clique em "Editar venda" não fazia nada. Reativar funcionava normalmente
- 🔍 Causa: `FinanceiroRow.date` tipado como `Date`, mas Next.js serializa Date como string ao passar de Server Component → Client Component. `row.date.toISOString()` na primeira linha de `openEditSale` lançava TypeError silencioso, interrompendo a função antes de `setEsRow(row)`
- ✅ Solução: Normalização em `openEditSale` e `openEditDate`: `const dateObj = row.date instanceof Date ? row.date : new Date(row.date as unknown as string)` com fallback para data atual se inválida
- 📅 Data: 24/04/2026

**BUG-016** *(resolvido)*
- 📍 Estoque → nome do produto na listagem
- 🔴 Descrição: Nome longo era cortado com "..."
- ✅ Solução: `truncate` → `break-words`, coluna 1fr → `minmax(280px, 2fr)`, minWidth 900→1100px
- 📅 Data: 23/04/2026

**BUG-017** *(resolvido)*
- 📍 Financeiro → menu de ações (3 pontinhos)
- 🔴 Descrição: Menu com fundo transparente deixava texto da tabela atrás aparecer; textos sem contraste; sem separador para ação destrutiva
- ✅ Solução: Fundo sólido `#0F1A2B`, z-index 20→40, hover com a cor da ação, separador visual + `font-semibold` antes do "Excluir venda"
- 📅 Data: 24/04/2026

**BUG-018** *(resolvido)*
- 📍 Financeiro → menu de ações
- 🔴 Descrição: Botões do menu às vezes não respondiam ao clique
- 🔍 Causa: Outside-click handler escutava `mousedown` mas botões usavam `onClick` — race condition podia fechar o menu antes do click ser processado
- ✅ Solução: Todos os botões agora usam `onMouseDown` com `preventDefault` + `stopPropagation`, `type="button"`
- 📅 Data: 24/04/2026
