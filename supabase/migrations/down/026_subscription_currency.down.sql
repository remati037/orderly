SET lock_timeout = '5s';
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS mrr_amount, DROP COLUMN IF EXISTS mrr_currency;
