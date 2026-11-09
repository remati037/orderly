-- Short label for an ad account on /reklame: who or what it pays for, instead
-- of Meta's own account name ("AF $ BP ANT 01" → "Nemanja Antić").
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS short_name TEXT;

UPDATE ad_accounts SET short_name = 'Nemanja Antić' WHERE name = 'AF $ BP ANT 01' AND short_name IS NULL;
UPDATE ad_accounts SET short_name = 'AI Profit Lab' WHERE name = 'Vladsdigital' AND short_name IS NULL;
UPDATE ad_accounts SET short_name = 'Filip Ćirić'   WHERE name = 'Filip Ćirić' AND short_name IS NULL;
UPDATE ad_accounts SET short_name = 'Biznis priče'  WHERE name = 'Biznis Priče' AND short_name IS NULL;
