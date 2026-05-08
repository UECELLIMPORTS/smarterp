-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  047 — onboarding_completed_at em tenants                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Marca quando o tenant terminou o wizard de onboarding inicial.
-- Usado pelo CheckSmart e CRM (banco compartilhado) pra redirecionar
-- novos usuários pro /onboarding até concluírem.
--
-- SmartERP não usa por enquanto — já tem fluxo de signup direto.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Tenants existentes assumem onboarding já concluído (não interrompe quem já usa)
UPDATE public.tenants
   SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at)
 WHERE onboarding_completed_at IS NULL;

NOTIFY pgrst, 'reload schema';
