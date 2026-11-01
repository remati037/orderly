# Status: Orderly
Ažurirano: 2026-11-01
Faza: uživo (razvoj Faze 0 iz docs/analiza-metorik/PLAN-FAZE.md)

## Gde smo stali
- Faza 0 završena i na produkciji (migracije 020–028, 40 refundacija, spojeni kupci, UTM izvori, daily_stats, registar metrika).
- Provera sa Metorikom (nemanjaantic.com, neto = bruto − refundacije):
  avgust 371 / €15.984 i septembar 381 / €16.863 — tačno isto kao Metorik.
  Oktobar 1–16: Orderly 194 / €9.343, Metorik 195 / €9.457 — razlika je samo #7084 (€114, on-hold):
  Metorik on-hold računa kao prihod, Orderly ne (to je kartica za naplatu).
- Popravljeno usput: 2 propuštene Woo porudžbine (#6513, #6514), zaglavljen status (#6862), test porudžbine iz Woo kante (#7094, #7095); Orderly sada prati Woo kantu.
- Plan i odluke: `docs/analiza-metorik/FAZA-0.md`.

- Grana `feat/circle-access`: automatski Circle pristup za kupce "70 Claude Eskperata" (Woo proizvod 44809 → access grupa 132017). Kod u `lib/circle/access.ts`, webhook + dnevni sweep, migracija 029 primenjena, uključeno u bazi od 2026-10-20 12:15 UTC (`settings.circle_access.enabled_from`), ali aktivno tek kad se grana spoji i deploy-uje. Endpointi za pisanje u Circle Admin API v2 još nisu isprobani uživo.

- Novi sajt FIlip Ćirić (ciricfilip.com) dodat 2026-10-27: istorija učitana, ali u Woo nije bilo Orderly webhook-a, pa nove porudžbine nisu ulazile. Ručno povučene #5325–#5329. Posle promene ključa na Read/Write napravljeni webhook-ovi (order.created/updated/deleted, ID 2–4) i provereni potpisanim test pozivom.

- Novi tab **Bonus** (`/bonus`, samo vlasnik): Black Friday 2026 obračun za 1–30. novembar. Neto promet po sajtu; partneri (Nemanja Antic, FIlip Ćirić, Odgovori Univerzuma) sa 50%. Skala: 70k (3%), 100k 6.000 €, 125k 10.000 €, 150k 18.000 €, 175k 22.000 €, 200k+ 30.000 €; između pragova procenat dostignutog praga × promet; deli se na 4 osobe. Podešavanja su u `settings.bonus_program` (migracija 030, primenjena). Sajt se rasklapa na proizvode sa ciljem po proizvodu (čuva se u `settings.bonus_program.product_goals`, poredi se sa obračunskim prometom). Proveren lokalno, NIJE push-ovan: Vladimir prvo gleda.

## Sledeći korak
- Kad Vladimir odobri: push na `main` da bi tab Bonus bio na produkciji.
- Prikazati Woo webhook URL u podešavanjima sajta (ili ih praviti automatski pri dodavanju sajta).
- Circle: test sa jednim email-om, pa `enabled = true` i merge grane `feat/circle-access`.
- Faza 1 (ciljevi, digest, export, ⌘K pretraga, izveštaj refundacija): grana `feat/faza-1`, plan u `docs/analiza-metorik/FAZA-1.md`.

## Šta fali od Vladimira
- Circle Admin API token mora imati pravo pisanja (sad je sačuvan na sajtu AI Profit Lab); potvrda da radi i test email za probu dodele.
- Pretplatiti Stripe webhookove oba Stripe sajta na `charge.refunded` (do tada refundacije stižu dnevnim cronom).

## Otvorena pitanja / rizici
- Za Woo sajtove UI ne prikazuje webhook URL niti ih pravi sam — svaki novi Woo sajt ostaje bez webhook-a ako se to zaboravi.
- Dug za Fazu 5: `settings.key` i `customers.email` su jedinstveni globalno, ne po organizaciji; većina endpointa još ne filtrira po org_id (registar metrika filtrira kad dobije orgId).
- Ad spend prozor u profit/kpi i ad-performance koristi UTC datume Beogradskih ponoći (dan pomeren) — postojeća greška, nije dirana.
- `profit/recalculate` ne preračunava net_profit za refunded porudžbine.
- Stripe webhook treba da bude pretplaćen na `charge.refunded` u Stripe-u; dok nije, refundacije stižu dnevnim cronom (do 24h kašnjenja).
