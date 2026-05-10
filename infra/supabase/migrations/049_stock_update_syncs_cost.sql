-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 049 — UPDATE de stock_movement também sincroniza products
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: trigger trg_after_stock_movement só rodava em INSERT. Quando o usuário
-- editava um lançamento existente (corrigir Pr. Custo, por exemplo), o
-- products.cost_cents não era atualizado — ficava congelado no valor antigo,
-- e o lucro do financeiro continuava errado.
--
-- Fix: cria trigger BEFORE UPDATE também, que aplica a mesma lógica.
-- Backfill: re-aplica latest_costs pra produtos cujo cost atual difere do
-- cost_price_cents da entrada mais recente.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger pra UPDATE — usa a mesma função, mas só roda quando os valores
-- relevantes mudaram (evita rodar à toa em updates de notes etc).
DROP TRIGGER IF EXISTS trg_after_stock_movement_update ON stock_movements;
CREATE TRIGGER trg_after_stock_movement_update
  AFTER UPDATE ON stock_movements
  FOR EACH ROW
  WHEN (
    OLD.purchase_price_cents IS DISTINCT FROM NEW.purchase_price_cents
    OR OLD.cost_price_cents  IS DISTINCT FROM NEW.cost_price_cents
    OR OLD.quantity          IS DISTINCT FROM NEW.quantity
    OR OLD.type              IS DISTINCT FROM NEW.type
  )
  EXECUTE FUNCTION trg_sync_product_after_movement();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: produtos cujo cost_cents difere do cost_price_cents do
-- movimento de entrada mais recente (com valor > 0). Cobre casos onde o
-- usuário editou o cost da entrada DEPOIS da criação.
-- ─────────────────────────────────────────────────────────────────────────────

WITH latest_costs AS (
  SELECT DISTINCT ON (sm.product_id, sm.tenant_id)
    sm.product_id,
    sm.tenant_id,
    sm.cost_price_cents,
    sm.purchase_price_cents
  FROM stock_movements sm
  WHERE sm.type = 'entrada'
    AND sm.cost_price_cents > 0
  ORDER BY sm.product_id, sm.tenant_id, sm.created_at DESC
)
UPDATE products p
   SET cost_cents           = lc.cost_price_cents,
       purchase_price_cents = CASE
         WHEN lc.purchase_price_cents > 0 THEN lc.purchase_price_cents
         ELSE p.purchase_price_cents
       END,
       updated_at           = now()
  FROM latest_costs lc
 WHERE p.id        = lc.product_id
   AND p.tenant_id = lc.tenant_id
   AND COALESCE(p.cost_cents, 0) <> lc.cost_price_cents;

NOTIFY pgrst, 'reload schema';
