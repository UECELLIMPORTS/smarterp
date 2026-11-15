-- Migration 056: campo objetivo de campanha em meta_ads_spend_entries
ALTER TABLE public.meta_ads_spend_entries
  ADD COLUMN IF NOT EXISTS objective varchar(50);
