-- Migration 057: cobranças Pix → USDT (ZimPay)
-- Compartilhada entre Gestão Smart (vendas do PDV) e CheckSmart (OS).
-- Colaboradores só LEEM (status ao vivo). Toda escrita é feita pelo servidor
-- com service_role, depois de falar com a ZimPay — ninguém marca "pago" pelo client.

CREATE TABLE IF NOT EXISTS public.pix_usdt_charges (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product          text NOT NULL CHECK (product IN ('smarterp', 'checksmart')),
  source_type      text NOT NULL CHECK (source_type IN ('sale', 'service_order', 'avulso')),
  source_id        uuid,                       -- sale.id / service_orders.id (venda é ligada depois de paga)
  amount_cents     integer NOT NULL CHECK (amount_cents >= 100),
  payer_name       text NOT NULL,
  payer_document   text NOT NULL,
  external_ref     text NOT NULL UNIQUE,       -- idempotência na ZimPay
  zimpay_order_id  text,
  pix_code         text,                       -- copia-e-cola
  status           text NOT NULL DEFAULT 'creating',
    -- creating | pending | pix_paid | queued | processing | sent | confirmed | failed | expired | error
  usdt_estimated   numeric(20, 6),
  rate             numeric(20, 6),
  paid_at          timestamptz,                -- quando o Pix foi pago (status saiu de pending)
  last_checked_at  timestamptz,
  raw              jsonb,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pix_usdt_charges_tenant_created
  ON public.pix_usdt_charges (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pix_usdt_charges_source
  ON public.pix_usdt_charges (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_pix_usdt_charges_zimpay_order
  ON public.pix_usdt_charges (zimpay_order_id);

ALTER TABLE public.pix_usdt_charges ENABLE ROW LEVEL SECURITY;

-- Só SELECT pro tenant. INSERT/UPDATE/DELETE apenas via service_role (bypassa RLS).
CREATE POLICY "pix_usdt_charges: tenant select"
  ON public.pix_usdt_charges FOR SELECT
  USING (tenant_id = public.tenant_id());
