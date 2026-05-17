-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 051 — Estoque compartilhado entre lojas (stock_source_store_id)
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite que duas ou mais lojas consumam o mesmo pool de estoque.
--
-- Modelo:
--   stores.stock_source_store_id = NULL  → loja tem estoque próprio (padrão)
--   stores.stock_source_store_id = X     → loja usa o estoque da loja X
--
-- Exemplo:
--   Loja A (stock_source = NULL) → estoque independente A
--   Loja B (stock_source = NULL) → estoque independente B
--   Loja C (stock_source = A)   → compartilha estoque com A
--   Loja D (stock_source = A)   → compartilha estoque com A
--   → A, C e D todas debitam/creditam em product_store_stock onde store_id = A
--
-- O trigger passa a resolver a "loja efetiva de estoque" antes de tocar
-- em product_store_stock. O store_id gravado em stock_movements continua
-- sendo a loja real da venda/entrada (para relatórios de vendas por loja).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Coluna na tabela stores ────────────────────────────────────────────────

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS stock_source_store_id uuid
    REFERENCES stores(id) ON DELETE SET NULL;

-- Garante que uma loja não aponte pra ela mesma
ALTER TABLE stores
  DROP CONSTRAINT IF EXISTS chk_no_self_stock_source;
ALTER TABLE stores
  ADD CONSTRAINT chk_no_self_stock_source
    CHECK (stock_source_store_id IS NULL OR stock_source_store_id <> id);

CREATE INDEX IF NOT EXISTS idx_stores_stock_source
  ON stores (stock_source_store_id)
  WHERE stock_source_store_id IS NOT NULL;

-- ── 2) Trigger atualizado — resolve loja efetiva de estoque ──────────────────
-- A loja efetiva = COALESCE(store.stock_source_store_id, store.id)
-- product_store_stock é sempre gravado com a loja efetiva, nunca com a loja
-- "filha" (que só aponta para o pool).

CREATE OR REPLACE FUNCTION trg_sync_product_after_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_effective_store_id uuid;
BEGIN
  -- Resolve loja efetiva de estoque (segue stock_source_store_id se existir)
  IF NEW.store_id IS NOT NULL THEN
    SELECT COALESCE(stock_source_store_id, id)
      INTO v_effective_store_id
      FROM stores
     WHERE id = NEW.store_id;
  END IF;

  IF NEW.type = 'entrada' THEN

    IF v_effective_store_id IS NOT NULL THEN
      INSERT INTO product_store_stock (product_id, store_id, tenant_id, qty, updated_at)
      VALUES (NEW.product_id, v_effective_store_id, NEW.tenant_id, NEW.quantity, now())
      ON CONFLICT (product_id, store_id) DO UPDATE
        SET qty        = GREATEST(0, product_store_stock.qty + NEW.quantity),
            updated_at = now();
    END IF;

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

    IF v_effective_store_id IS NOT NULL THEN
      INSERT INTO product_store_stock (product_id, store_id, tenant_id, qty, updated_at)
      VALUES (NEW.product_id, v_effective_store_id, NEW.tenant_id, 0, now())
      ON CONFLICT (product_id, store_id) DO UPDATE
        SET qty        = GREATEST(0, product_store_stock.qty - NEW.quantity),
            updated_at = now();
    END IF;

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

NOTIFY pgrst, 'reload schema';
