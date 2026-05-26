-- Migration 053 — Dataset ID + Token da Conversions API (CAPI) por tenant
--
-- Adiciona as credenciais de CAPI na tabela meta_ads_credentials.
-- Fluxo: tenant vai no Meta Gerenciador de Eventos, cria Dataset,
-- copia o Dataset ID e o token da API de Conversões, e cola aqui.
--
-- Separados do access_token principal (que é para a Marketing API)
-- porque podem ter escopos diferentes e ser gerenciados independente.

ALTER TABLE meta_ads_credentials
  ADD COLUMN IF NOT EXISTS capi_dataset_id    text,   -- ID do Dataset no Gerenciador de Eventos
  ADD COLUMN IF NOT EXISTS capi_token         text;   -- Token da API de Conversões (CAPI)

COMMENT ON COLUMN meta_ads_credentials.capi_dataset_id IS 'ID do Dataset criado no Meta Gerenciador de Eventos para envio de eventos offline (CAPI).';
COMMENT ON COLUMN meta_ads_credentials.capi_token      IS 'Token de acesso da API de Conversões (CAPI). Gerado no Gerenciador de Eventos → Configurações → API de Conversões.';
