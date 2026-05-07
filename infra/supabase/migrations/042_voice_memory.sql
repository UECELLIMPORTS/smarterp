-- 042_voice_memory.sql
-- Memória de longo prazo do voice entry.
-- Após cada comando confirmado, IA extrai fatos memoráveis (preferência
-- de pagamento, produtos comprados frequentemente, padrão de canal, etc)
-- e grava aqui pra ser usado em comandos futuros.

CREATE TABLE IF NOT EXISTS voice_memory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('customer', 'product', 'routine', 'general')),
  subject_id  uuid,                                   -- ref opcional pro customer/product
  subject_name text,                                  -- nome textual pra busca rápida
  key         text NOT NULL,                          -- ex: 'payment_preference', 'channel_preference'
  value       text NOT NULL,                          -- ex: 'pix', 'WhatsApp'
  confidence  real DEFAULT 0.7,                       -- 0..1
  source      text DEFAULT 'voice_entry',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_memory_tenant_cat ON voice_memory (tenant_id, category, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_memory_subject     ON voice_memory (tenant_id, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_memory_subject_name ON voice_memory (tenant_id, subject_name) WHERE subject_name IS NOT NULL;

-- Dedup leve por (tenant, category, subject_id, key) — last write wins
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_memory_unique
  ON voice_memory (tenant_id, category, COALESCE(subject_id::text, ''), key);

ALTER TABLE voice_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voice_memory: tenant rw" ON voice_memory;
CREATE POLICY "voice_memory: tenant rw" ON voice_memory
  USING (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid);

NOTIFY pgrst, 'reload schema';
