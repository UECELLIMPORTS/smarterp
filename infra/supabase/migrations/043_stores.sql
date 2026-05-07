-- 043_stores.sql
-- Multi-store dentro do tenant. Vendas, despesas, estoque-movements e
-- caixas ficam vinculados a uma "loja virtual". Produtos e clientes são
-- compartilhados entre lojas.
--
-- Cria a tabela stores, adiciona store_id nas tabelas de transação e
-- faz backfill: tudo que existe hoje vira da "loja default" (gerada
-- automaticamente com base em tenants.name).

-- ── 1) Tabela stores ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,                              -- ex: 'PRINCIPAL', 'CELULARES'
  color       text NOT NULL DEFAULT '#3B82F6',
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_tenant       ON stores (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_code  ON stores (tenant_id, lower(code));

-- 1 default por tenant (parcial unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_default_per_tenant
  ON stores (tenant_id) WHERE is_default = true;

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stores: tenant rw" ON stores;
CREATE POLICY "stores: tenant rw" ON stores
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

-- ── 2) Cria store default pra cada tenant existente ──────────────────────
INSERT INTO stores (tenant_id, name, code, color, is_default, is_active)
SELECT id, COALESCE(name, 'Loja Principal'), 'PRINCIPAL', '#3B82F6', true, true
FROM tenants
ON CONFLICT (tenant_id, lower(code)) DO NOTHING;

-- ── 3) Adiciona store_id nas tabelas de transação ────────────────────────
ALTER TABLE sales              ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE variable_expenses  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE stock_movements    ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE cash_sessions      ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL;

-- ── 4) Backfill: registros existentes vão pra store default do tenant ───
UPDATE sales s
SET store_id = (SELECT id FROM stores WHERE tenant_id = s.tenant_id AND is_default = true LIMIT 1)
WHERE store_id IS NULL;

UPDATE variable_expenses e
SET store_id = (SELECT id FROM stores WHERE tenant_id = e.tenant_id AND is_default = true LIMIT 1)
WHERE store_id IS NULL;

UPDATE stock_movements m
SET store_id = (SELECT id FROM stores WHERE tenant_id = m.tenant_id AND is_default = true LIMIT 1)
WHERE store_id IS NULL;

UPDATE cash_sessions c
SET store_id = (SELECT id FROM stores WHERE tenant_id = c.tenant_id AND is_default = true LIMIT 1)
WHERE store_id IS NULL;

-- ── 5) Indexes pra filtros por loja ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_store        ON sales (tenant_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_var_expenses_store ON variable_expenses (tenant_id, store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_mvmt_store   ON stock_movements (tenant_id, store_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_store ON cash_sessions (tenant_id, store_id, status);

NOTIFY pgrst, 'reload schema';
