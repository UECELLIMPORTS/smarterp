-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 050 — Estoque independente por loja (product_store_stock)
-- ─────────────────────────────────────────────────────────────────────────────
-- Até aqui, stock_movements já tinha store_id, mas o trigger atualizava
-- products.stock_qty de forma global (soma de todas as lojas). Isso fazia
-- com que vender na Loja A reduzisse o estoque que a Loja B enxergava também.
--
-- Fix:
--   1) Cria product_store_stock (estoque por produto × loja)
--   2) Popula a partir de todos os stock_movements existentes
--   3) Reescreve o trigger para atualizar product_store_stock e recalcular
--      products.stock_qty como SOMA de todas as lojas (retrocompat.)
--   4) Quando store_id for NULL no movimento, mantém comportamento antigo
--      (atualiza products.stock_qty diretamente sem tocar product_store_stock)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Tabela product_store_stock ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_store_stock (
  product_id  uuid NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  store_id    uuid NOT NULL REFERENCES stores(id)    ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  qty         integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_pss_tenant_store ON product_store_stock (tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_pss_product      ON product_store_stock (product_id);

ALTER TABLE product_store_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pss: tenant rw" ON product_store_stock;
CREATE POLICY "pss: tenant rw" ON product_store_stock
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

-- ── 2) Popula a partir dos stock_movements existentes ─────────────────────────

INSERT INTO product_store_stock (product_id, store_id, tenant_id, qty, updated_at)
SELECT
  sm.product_id,
  sm.store_id,
  sm.tenant_id,
  GREATEST(
    0,
    SUM(CASE WHEN sm.type = 'entrada' THEN sm.quantity ELSE -sm.quantity END)
  ) AS qty,
  now()
FROM stock_movements sm
WHERE sm.store_id IS NOT NULL
GROUP BY sm.product_id, sm.store_id, sm.tenant_id
ON CONFLICT (product_id, store_id) DO UPDATE
  SET qty = EXCLUDED.qty, updated_at = now();

-- Recalcula products.stock_qty = soma de todos os estoques por loja
UPDATE products p
SET stock_qty = (
  SELECT COALESCE(SUM(pss.qty), 0)
  FROM product_store_stock pss
  WHERE pss.product_id = p.id
),
updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM product_store_stock pss WHERE pss.product_id = p.id
);

-- ── 3) Trigger atualizado ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_sync_product_after_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.type = 'entrada' THEN

    -- Atualiza estoque por loja (somente se store_id preenchido)
    IF NEW.store_id IS NOT NULL THEN
      INSERT INTO product_store_stock (product_id, store_id, tenant_id, qty, updated_at)
      VALUES (NEW.product_id, NEW.store_id, NEW.tenant_id, NEW.quantity, now())
      ON CONFLICT (product_id, store_id) DO UPDATE
        SET qty        = GREATEST(0, product_store_stock.qty + NEW.quantity),
            updated_at = now();
    END IF;

    -- Atualiza produto: stock_qty = soma global, preços de custo
    UPDATE products SET
      stock_qty            = (
        SELECT COALESCE(SUM(qty), 0)
        FROM product_store_stock
        WHERE product_id = NEW.product_id
      ),
      purchase_price_cents = CASE WHEN NEW.purchase_price_cents > 0
                                  THEN NEW.purchase_price_cents
                                  ELSE purchase_price_cents END,
      cost_cents           = CASE WHEN NEW.cost_price_cents > 0
                                  THEN NEW.cost_price_cents
                                  ELSE cost_cents END,
      updated_at           = now()
    WHERE id = NEW.product_id AND tenant_id = NEW.tenant_id;

  ELSIF NEW.type = 'saida' THEN

    -- Debita estoque da loja (somente se store_id preenchido)
    IF NEW.store_id IS NOT NULL THEN
      INSERT INTO product_store_stock (product_id, store_id, tenant_id, qty, updated_at)
      VALUES (NEW.product_id, NEW.store_id, NEW.tenant_id, 0, now())
      ON CONFLICT (product_id, store_id) DO UPDATE
        SET qty        = GREATEST(0, product_store_stock.qty - NEW.quantity),
            updated_at = now();
    END IF;

    -- Atualiza produto: stock_qty = soma global, custo
    UPDATE products SET
      stock_qty  = (
        SELECT COALESCE(SUM(qty), 0)
        FROM product_store_stock
        WHERE product_id = NEW.product_id
      ),
      cost_cents = CASE WHEN NEW.cost_price_cents > 0
                        THEN NEW.cost_price_cents
                        ELSE cost_cents END,
      updated_at = now()
    WHERE id = NEW.product_id AND tenant_id = NEW.tenant_id;

  END IF;

  RETURN NEW;
END;
$$;

-- Os triggers já existem (INSERT em 002, UPDATE em 049) e apontam para esta
-- função — não é preciso recriar, apenas o corpo foi substituído acima.

NOTIFY pgrst, 'reload schema';
