-- Atribuição Meta Ads por venda: campanha → conjunto de anúncio → anúncio
-- Fica na tabela sales (não em customers) para atribuição por transação,
-- não por cliente — o mesmo cliente pode comprar de campanhas diferentes.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS meta_campaign_id   text,
  ADD COLUMN IF NOT EXISTS meta_campaign_name text,
  ADD COLUMN IF NOT EXISTS meta_adset_id      text,
  ADD COLUMN IF NOT EXISTS meta_adset_name    text,
  ADD COLUMN IF NOT EXISTS meta_ad_id         text,
  ADD COLUMN IF NOT EXISTS meta_ad_name       text;

-- Índices para analytics por nível de hierarquia
CREATE INDEX IF NOT EXISTS sales_meta_campaign_idx
  ON sales (tenant_id, meta_campaign_id)
  WHERE meta_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_meta_adset_idx
  ON sales (tenant_id, meta_adset_id)
  WHERE meta_adset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_meta_ad_idx
  ON sales (tenant_id, meta_ad_id)
  WHERE meta_ad_id IS NOT NULL;
