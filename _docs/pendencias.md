# Pendências — SmartERP / CheckSmart

> Atualizado em: **24/04/2026**

---

## 🔴 URGENTE

- [ ] **Corrigir data do 1 cliente com `created_at = 16/04/2026`** (BUG-003)
  - Tem venda vinculada, não pode ser deletado
  - Como resolver: `SELECT id, full_name, cpf_cnpj FROM customers WHERE created_at::date = '2026-04-16';` no Supabase → buscar data correta no CSV do Bling → `UPDATE customers SET created_at = 'YYYY-MM-DDT12:00:00+00:00' WHERE id = '<uuid>';`

---

## 🟡 IMPORTANTE

- [ ] **Contato clicável (WhatsApp/telefone) em Top Clientes** — replicar o que fizemos em Clientes em Risco de Perda
- [ ] **Filtro de origem no módulo Relatórios** do SmartERP
- [ ] **Dashboard principal (`/`) com gráfico de rosca de origem** + destaques de margem por categoria
- [ ] **Dashboard do CheckSmart** com analytics similares ao ERP Clientes (origem, RFM, heatmap)
- [ ] **Coluna "Origem" nas listagens de Clientes do CheckSmart** (hoje só aparece no ERP Clientes do SmartERP)
- [ ] **Snapshot de custo em `sale_items`** para lucro histórico fidedigno
  - Migration: `ALTER TABLE sale_items ADD COLUMN cost_snapshot_cents integer`
  - Preencher em `createSale` com `products.cost_cents` corrente
  - Usar no ERP Clientes com fallback pro custo atual
- [ ] **Decidir data padrão para os 516 clientes sem "cliente desde"** ou deixar editar individualmente via modal
- [ ] **Recriar índice único de WhatsApp no banco** após confirmar dados limpos:
  ```sql
  CREATE UNIQUE INDEX customers_tenant_whatsapp_unique
    ON customers(tenant_id, whatsapp) WHERE whatsapp IS NOT NULL;
  ```

---

## 🟢 QUANDO DER

- [ ] Limpar 132 grupos de clientes com nome duplicado (19 são "Consumidor Final")
- [ ] Módulo CRM (SmartERP — exibe "Em breve"): pipeline de leads, funil de vendas
- [ ] Módulo Meta Ads (SmartERP — exibe "Em breve"): integração com Meta Ads API
- [ ] Relatórios do CheckSmart (dados limitados): expandir com filtros/exportação
- [ ] Página de detalhe do cliente no SmartERP: histórico, OS, timeline
- [ ] Padronizar status de OS em inglês (atualmente tem `Cancelado` e `cancelled` ambos no banco)
- [ ] **Vault Obsidian** para resumos automáticos de sessão — usuário mencionou mas não ficou configurado. Precisa saber caminho e estrutura desejada

---

## ✅ CONCLUÍDO na sessão 23-24/04/2026

### Origem do Cliente
- [x] Migração SQL 007 (coluna `origin` + CHECK + índice)
- [x] Módulo `lib/customer-origin.ts` compartilhado
- [x] Campo obrigatório em TODAS as telas de Clientes/POS/OS (SmartERP + CheckSmart)
- [x] Action `updateCustomerOrigin()`
- [x] Bloqueio de finalização sem origem

### Paridade CheckSmart ↔ SmartERP
- [x] `types/database.ts` com 17 colunas adicionais
- [x] `CustomerForm` com 8 seções (Básicos, Contato, Endereço, Pessoais, Filiação, Comercial, Origem, Observações)
- [x] CEP auto-preenche
- [x] `DateTextInput` com máscara DD/MM/AAAA

### ERP Clientes — dashboard analítico
- [x] Seção "Origem dos Clientes" com ranking e insights
- [x] Heatmap com faturamento + lucro + vendas juntos + filtros de sistema + datas custom
- [x] Top Clientes com filtro de sistema e coluna de lucro
- [x] Clientes em Risco com WhatsApp clicável + origem + CSV + threshold configurável
- [x] KPIs recorrentes/novos com margem
- [x] BarChart mensal com toggle Faturamento/Lucro
- [x] Fix: OS só conta quando entregue

### Estoque
- [x] Saída no PDV registra `stock_movement` (fix crítico)
- [x] Layout estilo Bling com totalizadores e colunas separadas
- [x] Badge de origem colorido
- [x] Botão "Reconciliar vendas antigas"
- [x] Edição de custo sincroniza com products
- [x] Nome do produto quebra em múltiplas linhas

### Financeiro
- [x] Badge Novo/Recorrente no cliente
- [x] Menu de ações com fundo sólido e hover colorido
- [x] Fix "Editar venda" (bug de Date Server→Client)
- [x] Fix busca de produto (re-foca + estados claros)
- [x] Fix "Alterar data" (mesmo bug do Editar venda)

### Clientes
- [x] Lista estática ao paginar/buscar (fix com key)
- [x] Campo "Cliente desde" editável
- [x] Labels visíveis em Dados Pessoais
- [x] Máscara DD/MM/AAAA em Data de nascimento
