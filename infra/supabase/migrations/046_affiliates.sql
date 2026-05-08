-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  046 — Sistema de Afiliados                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Programa de afiliados pros 4 SaaS da Gestão Smart (começa pelo SmartERP).
-- Modelo: 40% na 1ª compra + 10% recorrente meses 2-12 (corte aos 12 sem aviso).
-- Cookie 60d, hold 30d, anti-fraude por email/CPF/WhatsApp/IP, limite 5/7d.
--
-- Idempotente.

-- ── 1. tenants — coluna pra guardar atribuição de afiliado ──────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS affiliate_ref_code TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_attributed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_affiliate_ref ON public.tenants(affiliate_ref_code)
  WHERE affiliate_ref_code IS NOT NULL;

-- ── 2. affiliates ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  whatsapp          TEXT,                   -- só dígitos
  cpf_cnpj          TEXT,                   -- pra anti auto-referral
  pix_key           TEXT,                   -- pra pagamento
  pix_key_type      TEXT CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')),
  instagram         TEXT,                   -- opcional
  ref_code          TEXT NOT NULL UNIQUE,   -- ex: "MARIA20"

  commission_pct    NUMERIC(5,2) NOT NULL DEFAULT 40,
  recurring_pct     NUMERIC(5,2) NOT NULL DEFAULT 10,
  recurring_months  INTEGER      NOT NULL DEFAULT 12,
  cookie_days       INTEGER      NOT NULL DEFAULT 60,
  min_payout_cents  INTEGER      NOT NULL DEFAULT 3000,

  source            TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'public')),

  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('pending_email', 'active', 'paused', 'banned')),

  email_confirmed_at  TIMESTAMPTZ,
  email_confirm_token TEXT,                 -- 1 token por vez

  banned_at         TIMESTAMPTZ,
  ban_reason        TEXT,

  notes             TEXT,                   -- nota interna do admin
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_status ON public.affiliates(status);
CREATE INDEX IF NOT EXISTS idx_affiliates_email_token
  ON public.affiliates(email_confirm_token)
  WHERE email_confirm_token IS NOT NULL;

-- Normalização do ref_code: sempre uppercase, sem acento
CREATE OR REPLACE FUNCTION public.normalize_ref_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.ref_code := upper(NEW.ref_code);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_affiliates_normalize ON public.affiliates;
CREATE TRIGGER trg_affiliates_normalize
  BEFORE INSERT OR UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.normalize_ref_code();

-- ── 3. affiliate_referrals ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,

  product         TEXT,                          -- gestao_smart | checksmart | crm | meta_ads (null se ainda não pagou)
  signup_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  attribution     TEXT NOT NULL DEFAULT 'link'
                  CHECK (attribution IN ('link', 'cupom', 'both', 'manual')),

  -- Anti-fraude: comparados contra o affiliate.email/cpf_cnpj/whatsapp e contra IPs do tenant
  fingerprint_ip  INET,
  fingerprint_ua  TEXT,
  fraud_flags     TEXT[]      NOT NULL DEFAULT '{}',  -- ex: ['same_email', 'same_ip']

  status          TEXT        NOT NULL DEFAULT 'attributed'
                  CHECK (status IN ('attributed', 'under_review', 'rejected')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id)  -- 1 tenant só pode ser atribuído a 1 afiliado
);

CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON public.affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referrals_signup    ON public.affiliate_referrals(signup_at DESC);

-- ── 4. affiliate_commissions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_id   UUID NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,

  payment_id    TEXT,                          -- asaas payment id (deduplicação)
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  amount_cents      INTEGER NOT NULL,           -- valor da comissão
  base_amount_cents INTEGER NOT NULL,           -- valor da venda que originou
  pct               NUMERIC(5,2) NOT NULL,      -- % aplicado (snapshot)

  type          TEXT NOT NULL
                CHECK (type IN ('initial', 'recurring')),

  ref_month     DATE NOT NULL,                  -- 1º dia do mês de referência

  status        TEXT NOT NULL DEFAULT 'pending_approval'
                CHECK (status IN ('pending_approval', 'under_review', 'payable', 'paid', 'cancelled')),

  hold_until    TIMESTAMPTZ NOT NULL,
  paid_at       TIMESTAMPTZ,
  paid_proof    TEXT,                           -- comprovante PIX
  cancelled_at  TIMESTAMPTZ,
  cancel_reason TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotência: mesmo payment + tipo nunca gera comissão duplicada
  UNIQUE (payment_id, type)
);

CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON public.affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commissions_referral  ON public.affiliate_commissions(referral_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status    ON public.affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_hold      ON public.affiliate_commissions(hold_until)
  WHERE status = 'pending_approval';

CREATE OR REPLACE FUNCTION public.touch_commission_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commissions_touch ON public.affiliate_commissions;
CREATE TRIGGER trg_commissions_touch
  BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_commission_updated_at();

-- ── 5. RLS ─────────────────────────────────────────────────────────────────
-- Tabelas só são lidas/escritas via service_role (admin) — bloqueia acesso direto

ALTER TABLE public.affiliates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

-- Sem policies SELECT/INSERT pra anon/authenticated → bloqueio total via PostgREST
-- (admin client com service_role bypassa RLS)

-- ── 6. Helper: gera ref_code único de 6 chars ──────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_ref_code()
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_code     TEXT;
  v_attempt  INTEGER := 0;
  v_exists   BOOLEAN;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    -- 6 chars alfanuméricos uppercase, sem caracteres confusos (0/O, 1/I)
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text)
                              FROM 1 FOR 6));
    v_code := translate(v_code, '01', 'XY');

    SELECT EXISTS(SELECT 1 FROM public.affiliates WHERE ref_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists OR v_attempt > 20;
  END LOOP;

  IF v_exists THEN
    RAISE EXCEPTION 'não foi possível gerar ref_code único após 20 tentativas';
  END IF;

  RETURN v_code;
END $$;

-- ── 7. Refresh do schema cache ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
