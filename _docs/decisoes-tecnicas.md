# Decisões Técnicas — SmartERP / CheckSmart

> Atualizado em: **24/04/2026**

---

**DECISÃO-001 — Next.js fullstack sem backend separado**
- 📅 Data: início do projeto
- 🎯 Contexto: Escolha da arquitetura geral do SmartERP
- ✅ O que foi escolhido: Next.js 16 fullstack com Server Actions e Route Handlers — tudo em um único projeto
- ❌ O que foi descartado: FastAPI (Python) como backend separado — foi cogitado inicialmente mas descartado por complexidade desnecessária
- ⚡ Impacto: Toda lógica de servidor vive em `src/actions/` e `src/app/**/route.ts`. Não há servidor separado para manter.

---

**DECISÃO-002 — Supabase como banco + auth**
- 📅 Data: início do projeto
- 🎯 Contexto: Escolha de banco de dados e autenticação
- ✅ O que foi escolhido: Supabase (PostgreSQL gerenciado + Auth + Storage + REST API automática via PostgREST)
- ❌ O que foi descartado: Banco auto-hospedado, Firebase
- ⚡ Impacto: SmartERP e CheckSmart compartilham o mesmo banco — qualquer alteração em `customers` reflete nos dois sistemas imediatamente. O `tenant_id` separa os dados por empresa.

---

**DECISÃO-003 — Multi-tenant por `tenant_id` na mesma tabela**
- 📅 Data: início do projeto
- 🎯 Contexto: Como separar dados de múltiplos clientes no mesmo banco
- ✅ O que foi escolhido: Coluna `tenant_id UUID` em todas as tabelas principais. `getTenantId(user)` retorna `user.app_metadata.tenant_id ?? user.id`
- ❌ O que foi descartado: Schema separado por tenant (mais isolado mas operacionalmente mais complexo)
- ⚡ Impacto: Toda query **deve** incluir `.eq('tenant_id', tenantId)` — esquecer isso expõe dados de outros tenants

---

**DECISÃO-004 — Paginação de 1000 registros por request no Supabase**
- 📅 Data: 23/04/2026
- 🎯 Contexto: Importação de CSV falhava por não carregar todos os clientes existentes (banco tinha 2.129, API retornava 1.000)
- ✅ O que foi escolhido: Loop `while(true)` com `range(page * 1000, page * 1000 + 999)` para carregar dados em lotes de 1.000 até acabar
- ❌ O que foi descartado: Usar `.limit()` alto sem paginação — PostgREST tem hard limit de 1.000 rows por request que não pode ser ultrapassado
- ⚡ Impacto: **Regra obrigatória:** qualquer query que possa retornar mais de 1.000 registros precisa de paginação. Afeta importação (`clientes.ts`), exportação (`exportar/route.ts`) e scripts Python.

---

**DECISÃO-005 — UPSERT manual (sem ON CONFLICT) na importação do Bling**
- 📅 Data: 23/04/2026
- 🎯 Contexto: Importar clientes do Bling sem duplicar os que já existiam
- ✅ O que foi escolhido: Carregar todos os existentes antes, fazer match por CPF → WhatsApp → Nome, então UPDATE ou INSERT individualmente
- ❌ O que foi descartado: `ON CONFLICT DO NOTHING` — exige UNIQUE constraint, e a tabela `customers` não tem constraint única por nome. `ON CONFLICT (cpf_cnpj) DO UPDATE` — não cobre clientes sem CPF
- ⚡ Impacto: A importação é mais lenta (O(n) requests) mas correta. Para 1.700 clientes leva ~30 segundos.

---

**DECISÃO-006 — Insert individual em vez de lote no Supabase**
- 📅 Data: 23/04/2026
- 🎯 Contexto: PostgREST retornava `"All object keys must match"` no insert em lote
- ✅ O que foi escolhido: Insert um registro por vez com `supabase.from('customers').insert(payload)` em loop
- ❌ O que foi descartado: Insert em lote (`supabase.from('customers').insert([payload1, payload2, ...])`) — PostgREST exige que todos os objetos do array tenham exatamente as mesmas chaves, o que é impossível quando alguns campos são `null` e são filtrados
- ⚡ Impacto: Mais requests ao banco, mas sem erro de schema. Aceitável porque inserts ocorrem raramente (só na primeira importação).

---

**DECISÃO-007 — Autocomplete via Route Handler GET (não Server Action)**
- 📅 Data: 23/04/2026
- 🎯 Contexto: Implementar busca instantânea de clientes sem reload de página
- ✅ O que foi escolhido: Route Handler GET em `/clientes/busca/route.ts` retornando JSON — chamado com `fetch()` no cliente
- ❌ O que foi descartado: Server Action POST — funciona, mas é mais pesado (overhead de serialização, POST não é cacheável). Busca client-side com todos os dados em memória — inviável com 1.792 clientes
- ⚡ Impacto: Autocomplete responde em ~200ms. O GET pode ser cacheado pelo Next.js em produção para queries repetidas.

---

**DECISÃO-008 — Ordenação por `full_name ASC` em ambos os sistemas**
- 📅 Data: 23/04/2026
- 🎯 Contexto: SmartERP ordenava por `created_at DESC`, exibindo 516 clientes com data de hoje no topo. CheckSmart já usava `full_name ASC`
- ✅ O que foi escolhido: Mudar SmartERP para `full_name ASC` — consistência com CheckSmart, ambos mostram a mesma visão
- ❌ O que foi descartado: Manter `created_at DESC` — fazia sentido para ver "novos clientes primeiro" mas causou confusão visual com os 516 clientes importados hoje sem data histórica
- ⚡ Impacto: A lista de clientes em ambos os sistemas agora é idêntica na ordem. Perda: não dá mais pra ver "clientes mais recentes" no topo.

---

**DECISÃO-009 — Remoção do índice único de WhatsApp**
- 📅 Data: 23/04/2026
- 🎯 Contexto: Importação bloqueava com `duplicate key violates unique constraint customers_tenant_whatsapp_unique`
- ✅ O que foi escolhido: Remover o índice via `DROP INDEX IF EXISTS public.customers_tenant_whatsapp_unique`
- ❌ O que foi descartado: Manter o índice e deduplicar os WhatsApps no CSV antes de importar — mais correto, mas impraticável manualmente para 1.700 registros
- ⚡ Impacto: O banco não garante mais unicidade de WhatsApp por tenant. O código de importação gerencia isso em memória (`usedWhats` Set). **Recriar o índice após confirmação de dados limpos:** `CREATE UNIQUE INDEX customers_tenant_whatsapp_unique ON customers(tenant_id, whatsapp) WHERE whatsapp IS NOT NULL;`

---

**DECISÃO-010 — Origem do cliente em `customers`, não em `sales`/`service_orders`**
- 📅 Data: 23/04/2026
- 🎯 Contexto: "Como nos conheceu?" — onde armazenar o canal de aquisição
- ✅ O que foi escolhido: Coluna `origin` na tabela `customers` com CHECK constraint (7 valores: instagram_pago, instagram_organico, indicacao, passou_na_porta, google, facebook, outros) + índice parcial
- ❌ O que foi descartado: Criar coluna em cada transação (sales e service_orders) — daria origem diferente por compra, mas não faz sentido: um cliente tem UM canal de aquisição (como chegou na loja a primeira vez)
- ⚡ Impacto: Fonte única de verdade. Reports no ERP Clientes fazem JOIN com customers.origin. Mudança de origem em qualquer UI (Clientes, POS, OS, CheckSmart) atualiza esse único ponto.

---

**DECISÃO-011 — Query separada de custos em vez de join aninhado**
- 📅 Data: 24/04/2026
- 🎯 Contexto: Calcular lucro por venda precisa de `products.cost_cents` × quantidade
- ✅ O que foi escolhido: Query principal traz `sale_items.product_id`, depois duas queries paralelas (`products` e `parts_catalog`) filtrando pelos ids coletados, montando um `Map<id, cost>` em memória
- ❌ O que foi descartado: Join aninhado `sale_items → products(cost_cents)` direto no select — Supabase REST retornava vazio porque `sale_items.product_id` aponta pra `products` OU `parts_catalog` (ambiguidade de FK não resolvida pelo PostgREST)
- ⚡ Impacto: Mais robusto. Cobre itens que podem vir de qualquer das duas tabelas. Duas queries extra em paralelo — overhead aceitável.

---

**DECISÃO-012 — stock_movements em vez de RPC direta para decremento**
- 📅 Data: 24/04/2026
- 🎯 Contexto: Vendas no PDV não apareciam no histórico de movimentações do produto
- ✅ O que foi escolhido: Todas as operações que mexem em estoque por venda inserem `stock_movement` type='saida' com `origin` rastreável (ex: `sale:{id}`, `sale-cancel:{id}`). A trigger `trg_sync_product_after_movement` do Postgres cuida do decremento automaticamente
- ❌ O que foi descartado: RPC `decrement_product_stock` que só atualizava `products.stock_qty` sem registrar movimento — era rápido mas quebrava auditoria e divergia do saldo calculado
- ⚡ Impacto: Toda venda é rastreável no histórico. Divergência de saldo pode ser reconciliada retroativamente via botão "Reconciliar vendas antigas". Custo: mais insert no banco por venda, mas nada crítico.

---

**DECISÃO-013 — Data vira string ao passar Server→Client Component**
- 📅 Data: 24/04/2026
- 🎯 Contexto: Bug sutil em `openEditSale` do Financeiro — `row.date.toISOString()` lançava TypeError silencioso
- ✅ O que foi escolhido: Normalizar dates em qualquer função client que as consome: `const d = row.date instanceof Date ? row.date : new Date(row.date)`
- ❌ O que foi descartado: Mudar o tipo para `date: string` globalmente — refactor grande. Conversão no componente raiz — esquecimento fácil
- ⚡ Impacto: Cilada conhecida de Next.js App Router. Cada função que consome `Date` vindo de Server Component precisa normalizar. Regra: NUNCA confiar em `instanceof Date` vindo de props SSR.

---

**DECISÃO-014 — Sincronização manual de `products.cost_cents` ao editar entrada de estoque**
- 📅 Data: 24/04/2026
- 🎯 Contexto: Trigger `trg_sync_product_after_movement` só roda em INSERT — editar custo de entrada não propagava
- ✅ O que foi escolhido: `updateMovement` aplica manualmente `products.purchase_price_cents` e `products.cost_cents` quando a entrada tem esses valores alterados
- ❌ O que foi descartado: Criar uma trigger `AFTER UPDATE` no banco — mais limpo mas exige migration + lógica condicional em SQL
- ⚡ Impacto: Lucro do ERP Clientes reflete imediatamente a mudança de custo. Solução aplicação-side aceita porque `updateMovement` é o único lugar que edita preços de entrada.

---

**DECISÃO-015 — ERP Clientes só conta OS com status `delivered`/`Entregue`**
- 📅 Data: 24/04/2026
- 🎯 Contexto: Cliente aparecia no ranking assim que deixava aparelho pra conserto, antes de pagar
- ✅ O que foi escolhido: `.in('status', ['delivered', 'Entregue'])` nas duas queries de service_orders do ERP Clientes (inclui legado em PT)
- ❌ O que foi descartado: Exibir "OS em andamento" como receita potencial (não realizada) — podia confundir o usuário
- ⚡ Impacto: Dashboard analítico só reflete receita realizada. O Financeiro continua mostrando todas as OS (exceto canceladas) porque ali o objetivo é operacional.

---

**DECISÃO-016 — `revalidatePath('/erp-clientes')` em actions que afetam lucro**
- 📅 Data: 24/04/2026
- 🎯 Contexto: Editar custo de produto ou movement não invalidava o cache do dashboard
- ✅ O que foi escolhido: Adicionar `revalidatePath('/erp-clientes')` em `updateProduct`, `updateProductPrice`, `updateMovement`
- ⚡ Impacto: ERP Clientes sempre reflete mudanças recentes. Custo: próximo request refaz toda a query do dashboard — aceitável.
