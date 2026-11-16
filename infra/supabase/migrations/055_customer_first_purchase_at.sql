-- Migration 055 — customers.first_purchase_at (data da 1ª compra paga da vida)
--
-- Base do cálculo de "cliente novo vs recorrente" nos relatórios de Meta Ads e
-- Canais: cliente é NOVO só no período em que fez a 1ª compra paga; depois é
-- RECORRENTE (mantendo a origem original em customers.origin).
--
-- Compra paga = venda não cancelada com total > 0 (sales.created_at)
--             ou OS entregue com valor > 0 (service_orders.received_at).
-- Mesma regra já usada nos relatórios.
--
-- Gravação: trigger preenche quando está NULL. Compras posteriores nunca
-- movem a data pra frente; só uma compra com data ANTERIOR (venda retroativa)
-- corrige pra trás — mantém a coluna = MIN(data das compras pagas).
--
-- CheckSmart e SmartERP compartilham customers/service_orders neste Supabase.
-- Idempotente: pode rodar mais de uma vez.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS first_purchase_at TIMESTAMPTZ;

COMMENT ON COLUMN customers.first_purchase_at IS
  'Data da 1ª compra paga (venda não cancelada ou OS entregue). Preenchida por trigger; nunca avança.';

CREATE INDEX IF NOT EXISTS idx_customers_tenant_first_purchase
  ON customers (tenant_id, first_purchase_at);

-- ── Função comum ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_customer_first_purchase(p_customer_id UUID, p_at TIMESTAMPTZ)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE customers
  SET    first_purchase_at = p_at
  WHERE  id = p_customer_id
    AND  (first_purchase_at IS NULL OR first_purchase_at > p_at);
$$;

REVOKE EXECUTE ON FUNCTION public.set_customer_first_purchase(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- ── Trigger: sales ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_sales_first_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL
     AND NEW.status IS DISTINCT FROM 'cancelled'
     AND COALESCE(NEW.total_cents, 0) > 0 THEN
    PERFORM public.set_customer_first_purchase(NEW.customer_id, NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_first_purchase ON sales;
CREATE TRIGGER trg_sales_first_purchase
  AFTER INSERT OR UPDATE OF status, total_cents, customer_id, created_at ON sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_sales_first_purchase();

-- ── Trigger: service_orders ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_service_orders_first_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL
     AND NEW.received_at IS NOT NULL
     AND NEW.status IN ('delivered', 'Entregue')
     AND COALESCE(
           NEW.total_price_cents,
           GREATEST(0, COALESCE(NEW.service_price_cents, 0) + COALESCE(NEW.parts_sale_cents, 0) - COALESCE(NEW.discount_cents, 0))
         ) > 0 THEN
    PERFORM public.set_customer_first_purchase(NEW.customer_id, NEW.received_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_orders_first_purchase ON service_orders;
CREATE TRIGGER trg_service_orders_first_purchase
  AFTER INSERT OR UPDATE OF status, customer_id, received_at, total_price_cents, service_price_cents ON service_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_service_orders_first_purchase();

-- ── Backfill: MIN(data) das compras pagas, por cliente ──────────────────────
-- Multi-tenant: a compra só conta se for do MESMO tenant do cliente.
WITH paid AS (
  SELECT s.customer_id, s.tenant_id, s.created_at AS at
  FROM   sales s
  WHERE  s.customer_id IS NOT NULL
    AND  s.status IS DISTINCT FROM 'cancelled'
    AND  COALESCE(s.total_cents, 0) > 0
  UNION ALL
  SELECT o.customer_id, o.tenant_id, o.received_at
  FROM   service_orders o
  WHERE  o.customer_id IS NOT NULL
    AND  o.received_at IS NOT NULL
    AND  o.status IN ('delivered', 'Entregue')
    AND  COALESCE(
           o.total_price_cents,
           GREATEST(0, COALESCE(o.service_price_cents, 0) + COALESCE(o.parts_sale_cents, 0) - COALESCE(o.discount_cents, 0))
         ) > 0
),
firsts AS (
  SELECT p.customer_id, MIN(p.at) AS first_at
  FROM   paid p
  JOIN   customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
  GROUP  BY p.customer_id
)
UPDATE customers c
SET    first_purchase_at = f.first_at
FROM   firsts f
WHERE  c.id = f.customer_id
  AND  c.first_purchase_at IS DISTINCT FROM f.first_at;

-- ── Conferência ─────────────────────────────────────────────────────────────
SELECT tenant_id,
       COUNT(*)                          AS clientes,
       COUNT(first_purchase_at)          AS com_primeira_compra,
       MIN(first_purchase_at)::date      AS mais_antiga,
       MAX(first_purchase_at)::date      AS mais_recente
FROM   customers
GROUP  BY tenant_id
ORDER  BY clientes DESC;
