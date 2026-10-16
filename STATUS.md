# Status: Orderly
Ažurirano: 2026-10-16
Faza: uživo (razvoj Faze 0 iz docs/analiza-metorik/PLAN-FAZE.md)

## Gde smo stali
- Faza 0 završena i na produkciji (migracije 020–028, 40 refundacija, spojeni kupci, UTM izvori, daily_stats, registar metrika).
- Provera sa Metorikom (nemanjaantic.com, neto = bruto − refundacije):
  avgust 371 / €15.984 i septembar 381 / €16.863 — tačno isto kao Metorik.
  Oktobar 1–16: Orderly 194 / €9.343, Metorik 195 / €9.457 — razlika je samo #7084 (€114, on-hold):
  Metorik on-hold računa kao prihod, Orderly ne (to je kartica za naplatu).
- Popravljeno usput: 2 propuštene Woo porudžbine (#6513, #6514), zaglavljen status (#6862), test porudžbine iz Woo kante (#7094, #7095); Orderly sada prati Woo kantu.
- Plan i odluke: `docs/analiza-metorik/FAZA-0.md`.

## Sledeći korak
- Faza 1 (ciljevi, digest, export, ⌘K pretraga, izveštaj refundacija): grana `feat/faza-1`, plan u `docs/analiza-metorik/FAZA-1.md`.

## Šta fali od Vladimira
- Pretplatiti Stripe webhookove oba Stripe sajta na `charge.refunded` (do tada refundacije stižu dnevnim cronom).

## Otvorena pitanja / rizici
- Dug za Fazu 5: `settings.key` i `customers.email` su jedinstveni globalno, ne po organizaciji; većina endpointa još ne filtrira po org_id (registar metrika filtrira kad dobije orgId).
- Ad spend prozor u profit/kpi i ad-performance koristi UTC datume Beogradskih ponoći (dan pomeren) — postojeća greška, nije dirana.
- `profit/recalculate` ne preračunava net_profit za refunded porudžbine.
- Stripe webhook treba da bude pretplaćen na `charge.refunded` u Stripe-u; dok nije, refundacije stižu dnevnim cronom (do 24h kašnjenja).
