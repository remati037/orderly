# Orderly: inventar funkcija (stanje 16.10.2026)

Napravljeno čitanjem koda (bez pokretanja). Služi kao osnova za poređenje sa Metorikom u `IZVESTAJ.md`.

## Ekrani
| Ruta | Ko | Šta radi |
|---|---|---|
| `/dashboard` | owner | dnevni cilj, KPI kartice (period / poređenje / sajt / proizvod), prihod po sajtu, live feed |
| `/dashboard/[siteId]` | owner | jedan sajt: sync, cilj, KPI, dnevni prihod, mesečno poređenje, statusi, top proizvodi |
| `/porudzbine` | owner | tabela, filteri, pretraga, detalj, CSV |
| `/analytics` | owner | KPI, prihod po sajtu, dnevni prihod, 6 trend prikaza, statusi, top proizvodi, Beta: prognoza + kohorta |
| `/naplata` | owner + agent | kanban naplate, „Pozivi“, SMS red (u izradi) |
| `/customers`, `/customers/[id]` | owner | lista (VIP/Regular/New), profil sa istorijom |
| `/subscriptions` | owner | MRR, aktivni, novi, otkazani, churn, 6 meseci MRR, uvoz iz Stripe-a |
| `/profit` | owner | bruto, neto, marža, ad spend i ROAS po proizvodu, troškovi po proizvodu |
| `/settings/sites, ads, team, general, sound` | owner | sajtovi, Meta oglasi, tim, valuta i kursevi, zvuk |
| `/tv` | svi ulogovani | TV zid sa današnjim prihodom |

## Izvori podataka
- **WooCommerce:** webhook (HMAC) + dnevni cron (poslednja 3 dana) + ručni sync. Ne čuva: dostavu, porez, popuste, kupone, refundacije, katalog proizvoda.
- **Thinkific:** webhook + puni sync.
- **Stripe:** samo charge eventi (succeeded / failed / checkout expired), stvarna provizija, filter po sajtu. `charge.refunded` se ne obrađuje. Pretplate: cron + uvoz.
- **Circle:** telefon kupca po emailu.
- **Meta Ads:** dnevna potrošnja po kampanji, ručno mapiranje kampanja na sajt ili proizvod.
- **Ručne / IPS QR porudžbine:** poseban webhook.
- **Realtime:** Supabase Realtime + SWR. **Cron:** 03:00 pretplate, 04:00 sync svih sajtova.
- **SwiftBar menubar**, **SMS gateway** (Huawei modem, FastAPI; još nije povezan sa Orderlyjem).

## Analitika: šta postoji
- Prihod se računa samo iz `completed` + `processing`. Refundacije se ne oduzimaju.
- Valute: ručni fiksni kursevi.
- KPI: prihod, porudžbine, AOV, neto zarada, Stripe naknade, aktivni sajtovi; sparkline grafikoni.
- Poređenja: prethodni period, prethodni mesec, isti period prošle godine.
- Filteri: jedan sajt + više proizvoda.
- Trendovi: mesečno po sajtu, AOV, novi naspram vraćenih kupaca, uspešnost plaćanja, top 10 gradova, heatmap dan × sat.
- Prognoza: Holt smoothing, 30 dana. Kohorta: 6 × 3 meseca.
- Profit: marža po sajtu ili trošak po proizvodu, minus Stripe provizija i Meta spend.
- Export: CSV porudžbina.

## Kupci
- Kupac = email (globalno, preko svih sajtova). `orders.customer_id` se nikad ne popunjava, emailovi se ne normalizuju (velika i mala slova).
- Segment je fiksan (VIP ≥500 / Regular ≥100 / New). „LTV“ = potrošnja / broj meseci.

## Naplata (najjači deo Orderlyja)
- DB trigger otvara karticu za on-hold / failed / pending / checkout-draft.
- Faze: Novo → Kontaktiran → Čeka uplatu → Naplaćeno / Otkazano. Kartica se automatski zatvara kad se porudžbina plati.
- Spajanje Stripe ponovnih pokušaja, razlog odbijanja, oznaka „rešeno drugde“, vreme čekanja, dodela agentu, beleške po kanalu, owner zatvara on-hold.
- SMS (grana `feat/sms-recovery`, necommitovano): 3 podsetnika (+0 / +24 / +72h) uz ručno odobrenje, šabloni, slanje 08–21h, STOP odjava, dolazni SMS postaje beleška.

## Obaveštenja
Zvuk po sajtu, browser notifikacija za naplatu, TV zid, menubar. **Nema:** email izveštaja, Slack-a, Telegrama.

## Korisnici
Jedna firma (nije SaaS). Supabase email + lozinka. Uloge: owner / agent (agent vidi samo naplatu i ne vidi profit).

## Poznati problemi u kodu
1. **MRR se sabira bez konverzije valuta** (`app/api/subscriptions/route.ts`).
2. `orders.customer_id` se nikad ne popunjava; emailovi nisu u malim slovima (isti kupac se može pojaviti dva puta).
3. Refundacije se ne obrađuju (Stripe `charge.refunded`, Woo refund), pa prihod i profit ne odbijaju povraćaje.
4. Dnevni cilj nema UI, menja se samo u bazi.
5. `ads/spend` endpoint niko ne poziva.
6. SMS gateway i Orderly API još nisu povezani; migracije 019 i 020 su „pending“.

## Tehnologija
Next.js 16.2 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind 4, shadcn (base-ui), Recharts 3, SWR, date-fns, Supabase (Postgres, Auth, Realtime, Storage), Vercel (2 crona), Vitest.
