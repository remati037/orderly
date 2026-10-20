-- Reverses 029_circle_access.sql. Grant history is lost.
SET lock_timeout = '5s';
DROP TABLE IF EXISTS public.circle_grants;
DELETE FROM settings WHERE key = 'circle_access';
