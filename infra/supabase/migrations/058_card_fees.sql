-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 058 — Taxas da maquininha por tenant (Gestão Smart + CheckSmart)
--
-- tenant_settings.card_fees (jsonb, % por forma):
--   { "debit": 0.89, "credit": { "1": 3.04, "2": 4.29, ..., "10": 10.06 } }
-- Usado no PDV e na OS (quanto o lojista recebe) e no relatório de pagamentos
-- (taxa estimada e líquido). NULL = não cadastrado.
-- O PDV grava débito/crédito + parcelas em sales.payment_details
-- ({ card_type, installments }), sem precisar de coluna nova.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS card_fees jsonb;

COMMENT ON COLUMN tenant_settings.card_fees IS
  'Taxas da maquininha em %: {"debit": n, "credit": {"1": n, ..., "12": n}}. NULL = não cadastrado.';

-- Taxas da UÉ CELL IMPORTS (informadas pelo Felipe em 20/11/2026; 7x a 9x são estimadas pelo sistema)
UPDATE tenant_settings
   SET card_fees = '{"debit":0.89,"credit":{"1":3.04,"2":4.29,"3":5.29,"4":5.77,"5":6.51,"6":7.23,"10":10.06}}'::jsonb,
       updated_at = now()
 WHERE tenant_id = '11c480b0-0e82-49c3-b9b9-73d3e1e1bb37';
