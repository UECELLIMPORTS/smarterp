-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 048 — saída manual sincroniza products.cost_cents
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: usuário cria produto sem custo, depois lança saída manual preenchendo
-- "Pr. Custo" no formulário. O custo fica gravado em stock_movements mas
-- products.cost_cents continua 0 — diagnóstico de lucro acusa "Sem custo"
-- e snapshot da venda PDV captura 0.
--
-- Fix: trigger passa a aplicar a mesma lógica de entrada também em saída
-- (atualiza cost_cents só se o movimento trouxer valor > 0).
-- Backfill retroativo: produtos com cost_cents=0 que tem saída com cost>0
-- recebem o valor da saída mais recente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_sync_product_after_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.type = 'entrada' THEN
    UPDATE products SET
      stock_qty             = stock_qty + NEW.quantity,
      purchase_price_cents  = CASE WHEN NEW.purchase_price_cents > 0
                                   THEN NEW.purchase_price_cents
                                   ELSE purchase_price_cents END,
      cost_cents            = CASE WHEN NEW.cost_price_cents > 0
                                   THEN NEW.cost_price_cents
                                   ELSE cost_cents END,
      updated_at            = now()
    WHERE id = NEW.product_id AND tenant_id = NEW.tenant_id;

  ELSIF NEW.type = 'saida' THEN
    UPDATE products SET
      stock_qty   = GREATEST(0, stock_qty - NEW.quantity),
      cost_cents  = CASE WHEN NEW.cost_price_cents > 0
                         THEN NEW.cost_price_cents
                         ELSE cost_cents END,
      updated_at  = now()
    WHERE id = NEW.product_id AND tenant_id = NEW.tenant_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: produtos zerados que têm saída com custo > 0 herdam esse valor.
-- Pega o cost_price_cents do movimento mais recente (DISTINCT ON product_id).
-- ─────────────────────────────────────────────────────────────────────────────

WITH latest_costs AS (
  SELECT DISTINCT ON (sm.product_id, sm.tenant_id)
    sm.product_id,
    sm.tenant_id,
    sm.cost_price_cents
  FROM stock_movements sm
  WHERE sm.cost_price_cents > 0
  ORDER BY sm.product_id, sm.tenant_id, sm.created_at DESC
)
UPDATE products p
   SET cost_cents = lc.cost_price_cents,
       updated_at = now()
  FROM latest_costs lc
 WHERE p.id        = lc.product_id
   AND p.tenant_id = lc.tenant_id
   AND COALESCE(p.cost_cents, 0) = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill bônus: sale_items.cost_snapshot_cents que estão null/0 e o produto
-- agora tem cost_cents > 0 (pode ter sido pelo backfill acima).
-- Mantém o snapshot histórico congelado nas vendas que já tinham snapshot certo.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE sale_items si
   SET cost_snapshot_cents = p.cost_cents
  FROM products p
 WHERE si.product_id = p.id
   AND COALESCE(si.cost_snapshot_cents, 0) = 0
   AND COALESCE(p.cost_cents, 0) > 0;

NOTIFY pgrst, 'reload schema';
