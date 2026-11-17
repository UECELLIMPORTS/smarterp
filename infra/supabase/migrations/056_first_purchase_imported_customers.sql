-- Migration 056 — clientes importados contam como já-clientes (recorrentes)
--
-- Clientes importados do sistema antigo vieram com created_at = data em que
-- já eram clientes (anterior à criação da loja no sistema). Sem compra lançada
-- aqui, a 055 deixava first_purchase_at NULL → na 1ª compra no sistema eram
-- contados como NOVOS.
--
-- Regra: cadastro ANTERIOR a tenants.created_at = cliente pré-existente →
--        first_purchase_at = LEAST(first_purchase_at, created_at).
-- Cadastros feitos depois da criação da loja não mudam (lead que nunca
-- comprou continua virando NOVO na 1ª compra).
-- Idempotente.

COMMENT ON COLUMN customers.first_purchase_at IS
  'Data da 1ª compra paga (venda não cancelada ou OS entregue). Para clientes importados (cadastro anterior à criação da loja) vale o created_at. Preenchida por trigger; nunca avança.';

-- ── Trigger: imports futuros e edição de "Cliente desde" ────────────────────
CREATE OR REPLACE FUNCTION public.trg_customers_imported_first_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NEW.created_at < (
       SELECT t.created_at FROM tenants t WHERE t.id = NEW.tenant_id
     ) THEN
    NEW.first_purchase_at := LEAST(COALESCE(NEW.first_purchase_at, NEW.created_at), NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_imported_first_purchase ON customers;
CREATE TRIGGER trg_customers_imported_first_purchase
  BEFORE INSERT OR UPDATE OF created_at ON customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_customers_imported_first_purchase();

-- ── Backfill ────────────────────────────────────────────────────────────────
UPDATE customers c
SET    first_purchase_at = LEAST(COALESCE(c.first_purchase_at, c.created_at), c.created_at)
FROM   tenants t
WHERE  t.id = c.tenant_id
  AND  c.created_at < t.created_at
  AND  (c.first_purchase_at IS NULL OR c.first_purchase_at > c.created_at);

-- ── Conferência ─────────────────────────────────────────────────────────────
SELECT c.tenant_id,
       COUNT(*)                                              AS clientes,
       COUNT(*) FILTER (WHERE c.created_at < t.created_at)   AS importados,
       COUNT(c.first_purchase_at)                            AS com_primeira_compra,
       COUNT(*) FILTER (WHERE c.first_purchase_at IS NULL)   AS nunca_compraram
FROM   customers c
JOIN   tenants t ON t.id = c.tenant_id
GROUP  BY c.tenant_id
ORDER  BY clientes DESC;
