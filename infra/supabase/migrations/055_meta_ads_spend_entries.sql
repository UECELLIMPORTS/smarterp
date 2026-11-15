-- Migration 055: lançamentos manuais de investimento Meta Ads
-- Permite registrar valor investido, impressões, cliques e conversas
-- de forma manual, como fallback quando a API do Meta está indisponível.

CREATE TABLE IF NOT EXISTS public.meta_ads_spend_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  spend_date            date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents          integer NOT NULL CHECK (amount_cents > 0),
  currency              varchar(3) NOT NULL DEFAULT 'BRL',
  original_amount_cents integer,
  exchange_rate         numeric(10, 4),
  impressions           integer,
  clicks                integer,
  conversations         integer,
  notes                 text,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_spend_tenant_date
  ON public.meta_ads_spend_entries (tenant_id, spend_date);

ALTER TABLE public.meta_ads_spend_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_ads_spend: tenant select"
  ON public.meta_ads_spend_entries FOR SELECT
  USING (tenant_id = public.tenant_id());

CREATE POLICY "meta_ads_spend: tenant insert"
  ON public.meta_ads_spend_entries FOR INSERT
  WITH CHECK (tenant_id = public.tenant_id());

CREATE POLICY "meta_ads_spend: tenant delete"
  ON public.meta_ads_spend_entries FOR DELETE
  USING (tenant_id = public.tenant_id());
