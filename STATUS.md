# Status: Orderly
Ažurirano: 2026-10-16
Faza: uživo (razvoj Faze 0 iz docs/analiza-metorik/PLAN-FAZE.md)

## Gde smo stali
- `feat/sms-recovery`: SMS recovery završen (gateway povezan sa /api/sms/gateway/*, migracija 020 dorađena, testovi). Spreman za spajanje; migracija 020 još nije primenjena.
- `feat/faza-0`: kod gotov i testiran (refundacije, MRR u valuti, normalizacija kupaca, UTM izvori, org_id, registar metrika `lib/metrics`, `daily_stats`). Migracije 022–027 i backfill refundacija (40 refundacija) NISU primenjeni na produkciji; čekaju potvrdu.
- Plan i odluke: `docs/analiza-metorik/FAZA-0.md`.

## Sledeći korak
1. Primeniti 019 (samo zabeležiti) + 020, spojiti SMS na main.
2. Primeniti 022–027, `npm run refunds:backfill -- --yes`, odmah deploy `feat/faza-0` (kod zavisi od novih tabela).
3. Uporediti neto prihod avg/sep/okt za nemanjaantic.com sa Metorikom.

## Šta fali od Vladimira
- Potvrda za produkcijske migracije i backfill.
- Dozvola da uvezem Metorik kolačiće iz Chrome-a (ili da se prijaviš u otvoreni browser) za poređenje brojki.

## Otvorena pitanja / rizici
- Dug za Fazu 5: `settings.key` i `customers.email` su jedinstveni globalno, ne po organizaciji; većina endpointa još ne filtrira po org_id (registar metrika filtrira kad dobije orgId).
- Ad spend prozor u profit/kpi i ad-performance koristi UTC datume Beogradskih ponoći (dan pomeren) — postojeća greška, nije dirana.
- `profit/recalculate` ne preračunava net_profit za refunded porudžbine.
- Stripe webhook treba da bude pretplaćen na `charge.refunded` u Stripe-u; dok nije, refundacije stižu dnevnim cronom (do 24h kašnjenja).
