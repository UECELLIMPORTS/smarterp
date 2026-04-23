# Pendências — SmartERP / CheckSmart

> Atualizado em: 23/04/2026

---

## 🔴 URGENTE

- [ ] **Corrigir data do 1 cliente com `created_at = 16/04/2026`**
  - Tem venda vinculada, não pode ser deletado
  - Como resolver: `SELECT id, full_name, cpf_cnpj FROM customers WHERE created_at::date = '2026-04-16';` no Supabase → buscar data correta no CSV do Bling → `UPDATE customers SET created_at = 'YYYY-MM-DDT12:00:00+00:00' WHERE id = '<uuid>';`

---

## 🟡 IMPORTANTE

- [ ] **Decidir e aplicar data padrão para os 516 clientes sem "cliente desde"**
  - Esses clientes têm `created_at = 23/04/2026` pois o Bling não tinha a data deles
  - Opções: definir `01/01/2023`, `01/01/2020`, ou deixar como está
  - Script Python pronto em `/tmp/fix_dates2.py` — só precisa adaptar para setar a data escolhida

- [ ] **Limpar 132 grupos de clientes com nome duplicado**
  - 19 deles são "Consumidor Final" (comuns no POS, podem ser legítimos)
  - Os demais podem ser duplicatas reais de cadastros
  - Precisa revisão manual ou lógica de merge (copiar dados do mais completo para o mais antigo e deletar o novo)

- [ ] **Recriar índice único de WhatsApp no banco**
  - Foi removido durante a importação do Bling
  - Recriar após confirmar que não há WhatsApps duplicados:
    ```sql
    CREATE UNIQUE INDEX customers_tenant_whatsapp_unique
    ON customers(tenant_id, whatsapp)
    WHERE whatsapp IS NOT NULL;
    ```
  - Se der erro: `SELECT whatsapp, COUNT(*) FROM customers WHERE whatsapp IS NOT NULL GROUP BY tenant_id, whatsapp HAVING COUNT(*) > 1;` para encontrar os duplicados

---

## 🟢 QUANDO DER

- [ ] **Módulo CRM** — SmartERP (exibe "Em breve")
  - Possível funcionalidade: pipeline de leads, follow-up de clientes, funil de vendas

- [ ] **Módulo Relatórios** — SmartERP (exibe "Em breve")
  - Possível: relatório de vendas por período, por produto, por vendedor

- [ ] **Módulo Meta Ads** — SmartERP (exibe "Em breve")
  - Possível: integração com Meta Ads API para ver resultados de campanhas

- [ ] **Relatórios** — CheckSmart (dados limitados)
  - Expandir relatório de receitas por OS com mais filtros e exportação

- [ ] **Configurações** — SmartERP (parcialmente implementado)
  - Verificar o que está faltando e completar

- [ ] **Página de detalhe do cliente** — SmartERP
  - Ver histórico de compras, OS abertas, timeline — hoje só existe listagem e modal de edição

---

## ✅ CONCLUÍDO HOJE (23/04/2026)

- [x] Importação de clientes do Bling via botão "Importar Bling" com UPSERT
- [x] Exportação de clientes em CSV formato Bling
- [x] Correção de datas "cliente desde" (986 deletados + reimportados com datas corretas)
- [x] Mudança de ordenação da lista de clientes para `full_name ASC` em ambos os sistemas
- [x] Autocomplete na busca de clientes (dropdown instantâneo com 3+ letras)
- [x] Diagnóstico da discrepância de datas entre SmartERP e CheckSmart (era diferença de ordenação, não de dados)
- [x] Identificação de 516 clientes sem "cliente desde" no Bling (sem solução disponível)
- [x] Documentação completa da sessão em `_docs/`
