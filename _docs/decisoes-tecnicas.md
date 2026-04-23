# Decisões Técnicas — SmartERP / CheckSmart

> Atualizado em: 23/04/2026

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
