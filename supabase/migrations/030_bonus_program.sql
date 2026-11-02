-- =============================================================
-- Orderly — Black Friday bonus program
--
-- Config for the /bonus page (settings.bonus_program). Revenue counted is net
-- (paid orders − refunds) in [from, to] Belgrade days; each site counts with
-- its share (partner businesses 0.5, everything else 1). Tiers: once revenue
-- reaches `from`, bonus = amount / from × revenue; the last tier is a flat cap.
-- Goals per product: product_goals = { "<site_id>": { "<product name>": 5000 } }.
-- Partners: Nemanja Antic, FIlip Ćirić, Odgovori Univerzuma.
-- =============================================================

INSERT INTO settings (key, value) VALUES (
  'bonus_program',
  '{
    "name": "Black Friday 2026",
    "from": "2026-11-01",
    "to": "2026-11-30",
    "people": 4,
    "product_goals": {},
    "site_shares": {
      "03012862-840f-491b-9f21-33e2bbf4f5da": 0.5,
      "6fa67355-84b2-44a7-9e3b-f099ab4cb2a9": 0.5,
      "d45c0c10-d3c7-4ec5-836a-5e85167ec00f": 0.5
    },
    "tiers": [
      { "from": 70000,  "amount": 2100 },
      { "from": 90000,  "amount": 2700 },
      { "from": 100000, "amount": 6000 },
      { "from": 125000, "amount": 7500 },
      { "from": 150000, "amount": 18000 },
      { "from": 175000, "amount": 22000 },
      { "from": 200000, "amount": 30000 }
    ]
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
