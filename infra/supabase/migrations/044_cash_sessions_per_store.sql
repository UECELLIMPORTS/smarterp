-- 044_cash_sessions_per_store.sql
-- Multi-store: cada loja tem seu próprio caixa aberto independente.
-- Antes: 1 caixa aberto por tenant (UNIQUE em tenant_id WHERE status='open')
-- Agora: 1 caixa aberto por (tenant, loja).

-- Drop constraint antiga
DROP INDEX IF EXISTS public.uq_cash_sessions_one_open_per_tenant;

-- Nova: 1 caixa aberto por (tenant, store).
-- Usa COALESCE pra cobrir possíveis store_id NULL (legado),
-- tratando NULL como string vazia (= 1 caixa global pra registros sem loja).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_one_open_per_store
  ON public.cash_sessions (tenant_id, COALESCE(store_id::text, ''))
  WHERE status = 'open';

NOTIFY pgrst, 'reload schema';
