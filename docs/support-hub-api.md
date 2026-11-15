# Support Hub API (samo čitanje)

Support Hub (helpdesk) čita kupce iz Orderly-ja preko dve rute. Ugovor je u Support Hub repou
(`packages/core/src/orderly/contract.ts`, kopija u `docs/integrations/orderly-endpoint.md`);
test `test/db/support-api.test.ts` drži kopiju Zod šeme.

```
GET /api/support/sites
GET /api/support/customer?email=<email>&site_ids=<id,id>
Authorization: Bearer <token>
```

- 401 bez tokena ili sa pogrešnim; 400 bez emaila, email bez `@`, bez `site_ids` ili `site_ids` nisu UUID; 429 preko 120 zahteva u minuti po tokenu (po instanci servera).
- Sve je filtrirano po organizaciji tokena (`settings.org_id` reda sa hešom) i po traženim sajtovima, u SQL funkciji `support_customer_lookup` (migracija 037).
- `total_spent`: samo plaćene porudžbine (completed, processing, refunded), neto od refundacija, u osnovnoj valuti. `orders_count` i `first_order_at`: plaćene porudžbine koje nisu potpuno refundirane, kao `customers.order_count`.
- Statusi: completed/processing → `paid` (ili `partially_refunded` / `refunded` po iznosu refundacija), on-hold → `on_hold`, cancelled → `cancelled`, failed → `failed`, pending / checkout-draft → `pending`. Trash (obrisane u Woo) se ne vraćaju.
- `paid_at`: Woo `date_paid_gmt`, Stripe vreme naplate, inače `created_at`; samo za plaćene.
- `circle_access`: `circle_grants` (ok → granted, error → failed sa tekstom greške) i plaćene porudžbine po pravilima iz `settings.circle_access` koje sweep još nije obradio (pending). Ime grupe je `Circle grupa <id>`, osim ako pravilo ima `access_group_name`.
- `open_payment_recovery`: otvorena kartica na Naplati (novo, kontaktiran, čeka uplatu) za porudžbinu iz poslednjih 30 dana, isto kao tabla.

## Token

Čuva se samo SHA-256 heš, u `settings.support_hub_token_sha256`. Napraviti token i upisati heš:

```bash
TOKEN=$(openssl rand -base64 48 | tr -d '\n')
HASH=$(printf %s "$TOKEN" | shasum -a 256 | cut -d' ' -f1)
npm run db:query -- "INSERT INTO settings (key, value) VALUES ('support_hub_token_sha256', to_jsonb('$HASH'::text)) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"
echo "$TOKEN"   # ide u Support Hub kao ORDERLY_API_TOKEN, nigde drugde
```

Nova vrednost istog ključa poništava stari token.
