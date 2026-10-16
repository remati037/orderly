# Status: Orderly
Ažurirano: 2026-10-16
Faza: uživo (razvoj Faze 0 iz docs/analiza-metorik/PLAN-FAZE.md)

## Gde smo stali
- SMS recovery na main-u, migracija 020 primenjena (isključen dok ga ne uključiš u Naplata → SMS).
- Faza 0 na main-u: migracije 022–027 primenjene, 40 refundacija upisano (€2.221,94), duplikati kupaca spojeni (41), porudžbine povezane sa kupcima, UTM izvori popunjeni (3.206), daily_stats popunjen (754 reda).
- Plan i odluke: `docs/analiza-metorik/FAZA-0.md`.

## Sledeći korak
- Uporediti neto prihod avg/sep/okt za nemanjaantic.com sa Metorikom (korak 4), pa Faza 1.

## Šta fali od Vladimira
- Pristup Metoriku za poređenje (Keychain „Brave Safe Storage” ili prijava u vidljiv browser).
- Pretplatiti Stripe webhookove oba Stripe sajta na `charge.refunded` (do tada refundacije stižu dnevnim cronom).

## Otvorena pitanja / rizici
- Dug za Fazu 5: `settings.key` i `customers.email` su jedinstveni globalno, ne po organizaciji; većina endpointa još ne filtrira po org_id (registar metrika filtrira kad dobije orgId).
- Ad spend prozor u profit/kpi i ad-performance koristi UTC datume Beogradskih ponoći (dan pomeren) — postojeća greška, nije dirana.
- `profit/recalculate` ne preračunava net_profit za refunded porudžbine.
- Stripe webhook treba da bude pretplaćen na `charge.refunded` u Stripe-u; dok nije, refundacije stižu dnevnim cronom (do 24h kašnjenja).
