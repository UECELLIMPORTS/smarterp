# Contexto de Sessão — SmartERP / CheckSmart

## 📅 Data da Sessão
23 de abril de 2026

---

## 🏗️ Projetos Trabalhados
- **SmartERP** — `/Users/uedson/smarterp`
- **CheckSmart** — `/Users/uedson/checksmart`
- Ambos compartilham o mesmo banco Supabase: `https://yhpogptfhjqwaetysboj.supabase.co`

---

## ✅ O que foi feito e FUNCIONOU

### 1. Migração SQL — novos campos na tabela `customers`
- **Objetivo:** Adicionar 18 campos extras que o Bling exporta (fantasia, gênero, profissão, endereço completo, etc.)
- **Implementado:** Migration `017_customer_extra_fields.sql` rodada diretamente no Supabase SQL Editor pelo usuário
- **Arquivos modificados:** Apenas banco de dados (sem arquivo de migration no projeto)
- **Como testar:** Abrir qualquer cliente no SmartERP e ver campos como Fantasia, Profissão, Endereço preenchidos

---

### 2. Importação de clientes do Bling (CSV) via módulo Clientes
- **Objetivo:** Botão "Importar Bling" que lê CSV exportado do Bling e faz UPSERT (update se existe, insert se não existe)
- **Implementado:**
  - Server Action com parser de CSV semicolon-delimited, match por CPF → WhatsApp → nome
  - Carrega TODOS os clientes existentes paginado (1000/página) antes de processar
  - Evita whatsapp duplicado no insert
- **Arquivos criados/modificados:**
  - `src/actions/clientes.ts` — função `importCustomersFromBling(csvText)`
  - `src/app/(dashboard)/clientes/clientes-client.tsx` — botão "Importar Bling" com file input
- **Como testar:** Módulo Clientes → "Importar Bling" → selecionar CSV do Bling → toast "X atualizados, Y novos"

---

### 3. Exportação de clientes em CSV compatível com Bling
- **Objetivo:** Botão "Exportar CSV" que gera arquivo no mesmo formato do Bling (para importar de volta no Bling se necessário)
- **Implementado:** Route Handler GET com paginação, BOM UTF-8, separador ponto-e-vírgula, mesmo cabeçalho do Bling
- **Arquivos criados:**
  - `src/app/(dashboard)/clientes/exportar/route.ts` — GET handler
  - `src/app/(dashboard)/clientes/clientes-client.tsx` — link `<a href="/clientes/exportar" download>`
- **Como testar:** Módulo Clientes → "Exportar CSV" → arquivo baixa automaticamente

---

### 4. Correção de datas "cliente desde" — sincronização SmartERP e CheckSmart
- **Objetivo:** Clientes importados do Bling mostravam data 16/04/2026 ou 23/04/2026 em vez da data real do Bling
- **O que foi feito:**
  - Rodado script Python para identificar 987 clientes com data 16/04/2026
  - 986 foram deletados (sem OS, sem vendas), 1 mantido (tinha venda)
  - Reimportação completa do CSV do Bling: 1212 atualizados + 485 inseridos
  - Script Python adicional corrigiu mais 16 clientes com datas erradas cruzando todos os CSVs do Bling
- **Resultado atual no banco:**
  - Antes de 2023: 207 | 2023: 533 | 2024: 329 | 2025: 131 | Jan-Mar/2026: 52 | 16/04: 1 | Outros: ~539
- **Scripts Python usados (temporários, em `/tmp/`):**
  - `/tmp/fix_dates.py` — primeira tentativa (só CSV 22/04)
  - `/tmp/fix_dates2.py` — versão final (todos os CSVs + fallback para primeira OS)

---

### 5. Mudança de ordenação da lista de clientes
- **Objetivo:** SmartERP e CheckSmart mostrar clientes na mesma ordem
- **Implementado:** Mudou ordenação de `created_at DESC` para `full_name ASC` (igual ao CheckSmart)
- **Arquivo modificado:** `src/app/(dashboard)/clientes/page.tsx` — linhas 36 e 41
- **Commit:** `b7cff08`

---

### 6. Autocomplete na busca de clientes
- **Objetivo:** Ao digitar 3+ letras, mostrar dropdown instantâneo com sugestões (sem esperar reload de página)
- **Implementado:**
  - Novo endpoint `GET /clientes/busca?q=...` retorna até 8 clientes em JSON (campos leves)
  - Dropdown aparece em ~200ms com nome, fantasia, CPF formatado, WhatsApp
  - Clicar em sugestão navega direto para aquele cliente
  - Loading spinner, fechar ao clicar fora, tecla X para limpar
- **Arquivos criados/modificados:**
  - `src/app/(dashboard)/clientes/busca/route.ts` — GET handler leve
  - `src/app/(dashboard)/clientes/clientes-client.tsx` — autocomplete completo
- **Commit:** `d67b90f`
- **Como testar:** Módulo Clientes → digitar 3 letras → dropdown aparece em <300ms

---

## ⚠️ O que foi feito mas NÃO funcionou como esperado

### 516 clientes com `created_at = 23/04/2026` (data de hoje)
- **Objetivo:** Corrigir todos os clientes com data errada de "cliente desde"
- **O que foi tentado:** Script Python cruzando CPF, WhatsApp e nome contra TODOS os 9 CSVs do Bling + fallback pela data da primeira OS
- **Problema:** 516 clientes existem no Bling com o campo "Cliente desde" em **branco no próprio Bling**. Não há fonte de dados para recuperar a data real. Nenhum desses tem OS vinculada.
- **O que foi descartado:** Não adianta tentar de novo com os mesmos CSVs — o dado simplesmente não existe no Bling.
- **Estado atual:** Esses 516 clientes aparecem com `created_at = 2026-04-23` no banco. Como a lista agora é ordenada por nome (A→Z), eles ficam espalhados e não ficam concentrados no topo.

### Tentativa de remoção de índice único `customers_tenant_whatsapp_unique`
- Durante a importação houve erro de WhatsApp duplicado. O índice era UNIQUE INDEX (não constraint), então foi removido com `DROP INDEX IF EXISTS public.customers_tenant_whatsapp_unique;` pelo usuário no Supabase. **O índice foi removido permanentemente** — não foi recriado. Se quiser recriar: `CREATE UNIQUE INDEX customers_tenant_whatsapp_unique ON customers(tenant_id, whatsapp) WHERE whatsapp IS NOT NULL;`

---

## 🔄 O que está pela metade / em andamento

### Cliente com data 16/04/2026 que não pôde ser deletado
- **Situação:** 1 cliente ficou com `created_at = 2026-04-16` pois tinha uma venda vinculada (não havia OS)
- **Próximo passo:** Identificar qual cliente é, verificar a data correta no Bling pelo nome/CPF e fazer UPDATE manual no Supabase:
  ```sql
  UPDATE customers SET created_at = 'YYYY-MM-DDT12:00:00+00:00' WHERE created_at::date = '2026-04-16';
  ```
- **Como achar:** No Supabase → Table Editor → customers → filtrar por `created_at >= 2026-04-16 AND created_at < 2026-04-17`

---

## 📋 Fila de tarefas — O que ainda NÃO foi iniciado

1. **Limpeza de clientes duplicados:** 132 grupos com nome idêntico (incluindo 19 "Consumidor Final"). O usuário foi informado mas não pediu a limpeza ainda. Decidir quais são duplicatas reais vs. homônimos legítimos.
2. **Recriar índice único de WhatsApp** (opcional): Se quiser garantir integridade, recriar o índice removido na importação.
3. **Datas dos 516 clientes sem "cliente desde":** O usuário pode querer definir uma data padrão (ex: 01/01/2023) para não ficarem com 23/04/2026. Aguardando decisão do usuário sobre qual data usar.

---

## 🧠 Decisões técnicas importantes tomadas hoje

### Supabase REST API — limite de 1000 linhas
- A API REST do Supabase retorna no máximo 1000 registros por request
- **Solução adotada:** Toda query que pode retornar muitos registros deve usar paginação com `limit` + `offset` em loop
- Isso afeta: importação, exportação, scripts Python de correção

### Ordenação — `full_name ASC` em ambos os sistemas
- SmartERP agora ordena igual ao CheckSmart (alfabético por nome)
- Decisão tomada para consistência visual, já que ambos leem o mesmo banco

### Autocomplete via Route Handler (não Server Action)
- Route Handler GET `/clientes/busca` escolhido em vez de Server Action POST
- Motivo: GET pode ser cacheado pelo browser/Next.js, mais leve para queries de autocomplete

### Importação de CSV — UPSERT por CPF → WhatsApp → Nome
- Hierarquia de match: CPF (mais confiável) → WhatsApp → Nome normalizado (lowercase)
- Sem transação — cada registro inserido/atualizado individualmente
- WhatsApp duplicado no insert é silenciado (não adiciona o campo, não gera erro)

### CheckSmart e SmartERP compartilham o mesmo banco
- `customers.created_at` é usado para "cliente desde" em AMBOS os sistemas
- Qualquer alteração no banco reflete nos dois instantaneamente
- CheckSmart (`/Users/uedson/checksmart`) usa mesmo `SUPABASE_SERVICE_ROLE_KEY`

---

## ⚡ Como iniciar a próxima sessão

Copie e cole este prompt no início da próxima sessão:

---

```
Continuando o trabalho no SmartERP e CheckSmart.

CONTEXTO RÁPIDO:
- SmartERP: /Users/uedson/smarterp (Next.js 15 fullstack, Supabase, TypeScript)
- CheckSmart: /Users/uedson/checksmart (mesmo banco Supabase)
- Supabase URL: https://yhpogptfhjqwaetysboj.supabase.co
- Credenciais em: /Users/uedson/smarterp/.env.local e /Users/uedson/checksmart/.env.local

O QUE FOI FEITO NA ÚLTIMA SESSÃO (23/04/2026):
1. Importação de clientes do Bling via botão "Importar Bling" — FUNCIONANDO
2. Exportação CSV compatível com Bling — FUNCIONANDO
3. Autocomplete na busca de clientes (dropdown em <300ms com 3+ letras) — FUNCIONANDO
4. Correção de datas "cliente desde" — parcialmente resolvido (516 clientes sem data no Bling ficaram com 23/04/2026)
5. Ordenação da lista por nome A→Z em ambos os sistemas — FEITO

PENDÊNCIAS:
1. 516 clientes com "cliente desde" = 23/04/2026 (campo em branco no Bling, sem data conhecida). Usuário pode querer definir data padrão.
2. 1 cliente com data 16/04/2026 que tinha venda — não foi deletado, precisa correção manual.
3. 132 grupos de nomes duplicados (incluindo 19 "Consumidor Final") — usuário ainda não pediu limpeza.
4. Índice único de WhatsApp foi removido durante importação e não foi recriado.

Leia o arquivo SESSAO_CONTEXTO.md na raiz do SmartERP para detalhes completos.

O que você quer trabalhar hoje?
```

---

## 🗂️ Mapa de arquivos importantes

### SmartERP — `/Users/uedson/smarterp/`

| Arquivo | O que faz |
|---|---|
| `src/app/(dashboard)/clientes/page.tsx` | Página server-side dos Clientes: query paginada, ordenação por `full_name ASC`, passa dados para o client |
| `src/app/(dashboard)/clientes/clientes-client.tsx` | Componente client: tabela de clientes, modal de criação/edição, botões Importar/Exportar, **autocomplete dropdown** |
| `src/app/(dashboard)/clientes/exportar/route.ts` | GET handler: exporta todos os clientes em CSV formato Bling com BOM UTF-8 |
| `src/app/(dashboard)/clientes/busca/route.ts` | GET handler: busca rápida `/clientes/busca?q=...` para autocomplete (retorna até 8 resultados em JSON) |
| `src/actions/clientes.ts` | Server Action `importCustomersFromBling()`: parser de CSV do Bling + UPSERT paginado no Supabase |
| `src/actions/pos.ts` | Server Actions de clientes: `createCustomer()`, `updateCustomer()`, usadas pelo modal de cadastro |
| `src/lib/tenant.ts` | `getTenantId(user)` — retorna `user.app_metadata.tenant_id ?? user.id` |
| `src/lib/supabase/server.ts` | `requireAuth()` — autentica e retorna `{ supabase, user }` |
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sem service role key aqui) |

### CheckSmart — `/Users/uedson/checksmart/`

| Arquivo | O que faz |
|---|---|
| `src/actions/search-customers.ts` | Busca clientes ordenada por `full_name ASC` — base para autocomplete no CheckSmart |
| `.env.local` | Contém `SUPABASE_SERVICE_ROLE_KEY` (o SmartERP não tem — usar este se precisar do service key) |

### Scripts Python temporários (em `/tmp/`, podem não existir mais)

| Script | O que faz |
|---|---|
| `/tmp/fix_dates2.py` | Corrige `created_at` de clientes com data >= 23/04/2026 cruzando todos os CSVs do Bling + fallback pela primeira OS |

### CSVs do Bling (em `/Users/uedson/Downloads/`)

| Arquivo | Descrição |
|---|---|
| `contatos_2026-04-22-19-26-24.csv` | **Principal** — export completo do Bling com 1702 clientes |
| `contatos_2026-04-16-*.csv` | Exports parciais anteriores (7 arquivos, ~2971 linhas total) |
