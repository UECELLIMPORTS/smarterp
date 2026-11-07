-- Migration 054 — adiciona 'tiktok' e 'domicilio' à constraint de origem
-- CheckSmart e SmartERP compartilham a mesma tabela customers neste Supabase.

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_origin_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_origin_check
  CHECK (origin IS NULL OR origin IN (
    'instagram_pago',
    'instagram_organico',
    'tiktok',
    'indicacao',
    'passou_na_porta',
    'google',
    'facebook',
    'domicilio',
    'outros'
  ));

COMMENT ON COLUMN customers.origin IS
  'Como o cliente conheceu a empresa. Valores: instagram_pago, instagram_organico, tiktok, indicacao, passou_na_porta, google, facebook, domicilio, outros. NULL = não informado.';
