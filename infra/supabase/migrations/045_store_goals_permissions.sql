-- 045_store_goals_permissions.sql
-- Multi-store: metas mensais por loja + permissão de loja por funcionário.

-- ── 1) Meta mensal por loja ──────────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS monthly_goal_cents bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN stores.monthly_goal_cents IS
  'Meta de faturamento mensal da loja em centavos (0 = sem meta).';

-- ── 2) Permissão de loja por funcionário ────────────────────────────────
-- Array de store_ids que o membro pode acessar (NULL ou [] = todas).
-- Owner sempre vê todas independente desse campo.
ALTER TABLE tenant_members
  ADD COLUMN IF NOT EXISTS allowed_store_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tenant_members.allowed_store_ids IS
  'Lojas que o funcionário pode acessar. Array vazio = todas. Owner ignora isso.';

NOTIFY pgrst, 'reload schema';
