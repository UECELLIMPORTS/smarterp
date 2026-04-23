# Registro de Bugs — SmartERP / CheckSmart

> Atualizado em: 23/04/2026

---

**BUG-001**
- 📍 Onde: Banco de dados → tabela `customers`
- 🔴 Descrição: 987 clientes importados do Bling ficaram com `created_at = 16/04/2026` (data da importação) em vez da data real do campo "Cliente desde" do Bling
- 🔍 Causa identificada: Na importação inicial via SQL, o campo `created_at` não foi mapeado corretamente — todos receberam o valor padrão `NOW()` do Postgres
- 🛠️ Status: Resolvido parcialmente
- ✅ Solução aplicada: 986 clientes sem OS/vendas foram deletados e reimportados via botão "Importar Bling" com a data correta. 1 cliente com venda vinculada foi mantido (ainda com data errada — ver BUG-003)
- 📅 Data: 23/04/2026

---

**BUG-002**
- 📍 Onde: Banco de dados → tabela `customers` / `src/actions/clientes.ts`
- 🔴 Descrição: 516 clientes importados do Bling ficaram com `created_at = 23/04/2026` (data de hoje) em vez da data real
- 🔍 Causa identificada: Esses clientes existem no Bling com o campo "Cliente desde" **em branco** — o dado simplesmente não existe na fonte. Quando `created_at` é `null` no payload, o Postgres usa `DEFAULT NOW()`
- 🛠️ Status: Contornado (sem solução possível com dados disponíveis)
- ✅ Solução aplicada: Mudança de ordenação da lista para `full_name ASC` — os clientes com data errada ficam espalhados na lista em vez de aparecerem todos no topo. Não há como recuperar a data real pois o Bling não a registrou.
- 📅 Data: 23/04/2026

---

**BUG-003**
- 📍 Onde: Banco de dados → tabela `customers` (1 registro)
- 🔴 Descrição: 1 cliente com `created_at = 16/04/2026` (data errada) não pôde ser corrigido via deleção + reimportação
- 🔍 Causa identificada: Esse cliente tem uma venda vinculada na tabela `sales`. A FK `sales.customer_id` não tem `ON DELETE CASCADE`, então a deleção falha com violação de constraint
- 🛠️ Status: Aberto
- ✅ Solução aplicada: Nenhuma ainda
- 📋 Próximo passo: Identificar o cliente no Supabase com `SELECT * FROM customers WHERE created_at::date = '2026-04-16'`, buscar a data correta no CSV do Bling e fazer `UPDATE customers SET created_at = 'YYYY-MM-DDT12:00:00+00:00' WHERE id = '<uuid>'`
- 📅 Data: 23/04/2026

---

**BUG-004**
- 📍 Onde: Banco de dados → índice `customers_tenant_whatsapp_unique`
- 🔴 Descrição: Durante a importação do Bling, ocorria erro `duplicate key value violates unique constraint customers_tenant_whatsapp_unique` pois vários clientes no CSV tinham o mesmo WhatsApp
- 🔍 Causa identificada: O índice único foi criado com boa intenção, mas o Bling permite múltiplos cadastros com o mesmo número de celular
- 🛠️ Status: Contornado
- ✅ Solução aplicada: O índice foi removido pelo usuário no Supabase (`DROP INDEX IF EXISTS public.customers_tenant_whatsapp_unique`). O código de importação também foi atualizado para ignorar WhatsApp duplicado no insert (adiciona ao `usedWhats` set para não repetir)
- ⚠️ Efeito colateral: O banco não garante mais unicidade de WhatsApp. Recriar se quiser: `CREATE UNIQUE INDEX customers_tenant_whatsapp_unique ON customers(tenant_id, whatsapp) WHERE whatsapp IS NOT NULL;`
- 📅 Data: 23/04/2026

---

**BUG-005**
- 📍 Onde: `src/actions/clientes.ts` — função `importCustomersFromBling`
- 🔴 Descrição: A importação falhava com erro `"All object keys must match"` ao tentar inserir múltiplos clientes em lote
- 🔍 Causa identificada: PostgREST (API REST do Supabase) exige que todos os objetos de um array de insert tenham exatamente as mesmas chaves. Como os registros filtram campos `null` (`Object.fromEntries(...filter(v !== null))`), cada objeto tinha chaves diferentes
- 🛠️ Status: Resolvido
- ✅ Solução aplicada: Mudou de insert em lote para insert individual (`supabase.from('customers').insert(payload)` por registro)
- 📅 Data: 23/04/2026

---

**BUG-006**
- 📍 Onde: `src/actions/clientes.ts` — carregamento de clientes existentes
- 🔴 Descrição: A importação falhava com erro de CPF duplicado (`customers_tenant_cpf_unique`) mesmo para clientes que já existiam no banco
- 🔍 Causa identificada: A API REST do Supabase retorna no máximo 1.000 registros por request sem paginação. O banco tinha 2.129 clientes — os CPFs da segunda "página" não eram carregados, então esses clientes pareciam novos e tentavam ser inseridos
- 🛠️ Status: Resolvido
- ✅ Solução aplicada: Carregamento paginado dos clientes existentes em loop `while(true)` com `range(page * 1000, page * 1000 + 999)` antes de processar a importação
- 📅 Data: 23/04/2026

---

**BUG-007**
- 📍 Onde: SmartERP → módulo Clientes → busca
- 🔴 Descrição: A busca de clientes demorava muito para mostrar resultados — o usuário percebia um atraso notável ao digitar
- 🔍 Causa identificada: A busca disparava `router.push()` (reload completo da página com request ao servidor) a cada alteração no input, com apenas 400ms de debounce
- 🛠️ Status: Resolvido
- ✅ Solução aplicada: Adicionado autocomplete com dropdown: busca leve via `GET /clientes/busca` (200ms debounce, retorna JSON com 8 resultados). A busca full-page continua existindo mas com 600ms de debounce
- 📅 Data: 23/04/2026
