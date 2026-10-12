-- =============================================================
-- Orderly — Circle Admin token per Stripe site
--
-- Circle collects the buyer's phone in a profile field and never passes it to
-- Stripe, so Stripe orders arrive without a phone. With this token the Stripe
-- webhook looks the member up in Circle by email and fills customer_phone.
-- Server-only secret, like consumer_key / consumer_secret.
-- =============================================================
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS circle_token TEXT;
