-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 059 — Plataforma do gasto de anúncio (iPhone x Android)
--
-- meta_ads_spend_entries.platform: 'ios' | 'android' | 'misto' (NULL = não informado).
-- Usado no relatório "iPhone x Android" (CheckSmart /reports/dispositivos e
-- Gestão Smart Relatórios › iPhone x Android) para calcular o CAC de cada plataforma.
-- 'misto' = campanha aberta para os dois (o relatório divide meio a meio).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE meta_ads_spend_entries
  ADD COLUMN IF NOT EXISTS platform text
  CHECK (platform IS NULL OR platform IN ('ios', 'android', 'misto'));

COMMENT ON COLUMN meta_ads_spend_entries.platform IS
  'Plataforma da campanha: ios | android | misto. NULL = não informado (o relatório conta como iOS).';

-- UÉ CELL: tudo que a CA-FELIPE NOVO lançou até 20/11/2026 era campanha "somente iOS".
UPDATE meta_ads_spend_entries
   SET platform = 'ios'
 WHERE tenant_id = '11c480b0-0e82-49c3-b9b9-73d3e1e1bb37'
   AND currency = 'USD'
   AND platform IS NULL;
