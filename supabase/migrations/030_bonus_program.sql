-- =============================================================
-- Orderly — Black Friday bonus program
--
-- Config for the /bonus page (settings.bonus_program). Revenue counted is net
-- (paid orders − refunds) in [from, to] Belgrade days; each site counts with
-- its share (partner businesses 0.5, everything else 1). Tiers: once revenue
-- reaches `from`, bonus = amount / from × revenue; the last tier is a flat cap.
-- Partners: Nemanja Antic, FIlip Ćirić, Odgovori Univerzuma.
-- =============================================================

INSERT INTO settings (key, value) VALUES (
  'bonus_program',
  '{
    "name": "Black Friday 2026",
    "from": "2026-11-01",
    "to": "2026-11-30",
    "people": 4,
    "site_shares": {
      "03012862-840f-491b-9f21-33e2bbf4f5da": 0.5,
      "6fa67355-84b2-44a7-9e3b-f099ab4cb2a9": 0.5,
      "d45c0c10-d3c7-4ec5-836a-5e85167ec00f": 0.5
    },
    "tiers": [
      { "from": 80000,  "amount": 2400 },
      { "from": 90000,  "amount": 2700 },
      { "from": 100000, "amount": 6000 },
      { "from": 110000, "amount": 6800 },
      { "from": 120000, "amount": 7600 },
      { "from": 130000, "amount": 8400 },
      { "from": 140000, "amount": 9200 },
      { "from": 150000, "amount": 18000 },
      { "from": 160000, "amount": 18800 },
      { "from": 170000, "amount": 19600 },
      { "from": 180000, "amount": 20400 },
      { "from": 190000, "amount": 21200 },
      { "from": 200000, "amount": 30000 }
    ]
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
