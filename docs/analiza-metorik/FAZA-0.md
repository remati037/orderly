# Faza 0: plan izvođenja

**Grana:** `feat/faza-0` (sa `main`). **Datum:** 16.10.2026.

## Stanje u produkciji (merenje pre izmena)
- 6.680 porudžbina, 8.912 kupaca (4.111 različitih emailova u porudžbinama; ~4,7k „siročića" ostaju netaknuti).
- Refundacije: 31 Woo porudžbina u statusu `refunded` (26 nemanjaantic, 4 Vladsdigital, 1 Biznis priče), sve sa zapisom u `woo_data.refunds`. Stripe porudžbine čuvaju snimak naplate, pa refundacije u njima ne postoje: moraju iz Stripe API-ja.
- Kupci: 89 emailova nije u malim slovima, 42 duplikata po emailu; `orders.customer_id` prazan u svih 6.680; 125 porudžbina ima email sa velikim slovima.
- Izvori: 3.209 od 4.102 Woo porudžbina ima `_wc_order_attribution_*` meta.
- MRR: Stripe MRR se konvertuje pri syncu (kurs se „zamrzne"), Thinkific MRR se čuva u USD bez konverzije. U `settings` nema kurseva ni osnovne valute (važe podrazumevani: EUR, RSD 0,00855, USD 0,92).

## Odluke
1. **Neto prihod = bruto − refundacije.** Bruto obuhvata plaćene porudžbine (`completed`, `processing`, `refunded`). Refundacija se računa **na datum refundacije** (kao Metorik); po porudžbini postoji i `orders.refunded_total` za izveštaje po porudžbini (kupci, proizvodi, kohorte).
2. Refundacije dolaze iz izvora istine: Woo REST (`/orders/{id}/refunds`) i Stripe (`/v1/refunds`). Webhook ih hvata odmah, dnevni cron je mreža ispod (Woo: izmenjene porudžbine, Stripe: refundacije poslednjih 7 dana), backfill skripta jednom povuče istoriju.
3. **Atribucija** se izvlači triggerom u bazi iz `woo_data` (jedno mesto za webhook, cron i ručni sync).
4. **Kupci:** email se normalizuje triggerom (mala slova, bez razmaka) i u `customers` i u `orders`; `orders.customer_id` popunjava trigger. Duplikati se spajaju u najstariji zapis; siročići zadržavaju stare iznose (zbir duplikata).
5. **MRR:** pretplata čuva originalni iznos i valutu (`mrr_amount`, `mrr_currency`), konverzija se radi pri čitanju trenutnim kursom.
6. **`org_id`** na svim tabelama, podrazumevana organizacija `00000000-0000-0000-0000-000000000001`. RLS za `authenticated` filtrira po `current_org_id()`. Upsert ključevi (`settings.key`, `customers.email`) ostaju globalni do Faze 5 (zapisano kao dug).
7. **`daily_stats`** po (org, sajt, dan po Beogradu, valuta), iznosi u originalnoj valuti, održava ga trigger (greška u triggeru nikad ne blokira upis porudžbine).
8. **Registar metrika** `lib/metrics/`: definicije statusa, neto prihoda, AOV-a, MRR-a na jednom mestu; endpointi prihoda prelaze na njega.

## Migracije (sve sa `down/` korakom, `lock_timeout` da nikad ne čekaju iza webhooka)
| # | Šta | Menja podatke |
|---|---|---|
| 022 | organizations + org_id + RLS | da (org_id podrazumevana vrednost, bez prepisivanja tabele) |
| 023 | refunds + orders.refunded_total + trigger | ne (backfill ide skriptom) |
| 024 | kolone atribucije + trigger + backfill | ~3.209 porudžbina |
| 025 | normalizacija kupaca + spajanje + customer_id | 42 duplikata, 89+125 emailova, ~6.600 porudžbina |
| 026 | valuta pretplata | ne (popunjava sledeći sync) |
| 027 | daily_stats + trigger + backfill | nova tabela |

## Gotovo kad
Neto prihod za oktobar 2026 (nemanjaantic.com) u Orderlyju se poklapa sa Metorikom, uz objašnjenu razliku za avgust, septembar i oktobar.
