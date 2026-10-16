# Orderly: plan po fazama (prvo za sebe, kasnije SaaS kao Metorik)

**Datum:** 16.10.2026.
**Osnova:** `IZVESTAJ.md` (analiza Metorika) i `ORDERLY-INVENTAR.md` (stanje Orderlyja).
**Odluka:** Orderly se sada razvija kao **interni alat**, a kasnije postaje **SaaS**. Zato se od prvog dana gradi tako da prelazak na SaaS ne traži prepisivanje.

---

## Pravila „SaaS-ready od prvog dana“

Važe za svaku fazu. Ne usporavaju interni razvoj, a štede mesece kasnije.

1. **`org_id` na svim tabelama.** Sada postoji samo jedna organizacija (tvoja), ali svaka tabela i svaki upit već ima `org_id`, a RLS filtrira po njemu.
2. **Podešavanja po organizaciji, ne u kodu.** Vremenska zona (danas fiksno Beograd), osnovna valuta, kursevi, ciljevi, šabloni poruka.
3. **Jedan registar metrika** (`lib/metrics/`). Svaka metrika (neto prihod, AOV, novi kupci, stopa povratka…) je definisana na jednom mestu. KPI kartice, ciljevi, digest, segmenti i AI koriste istu definiciju, pa se brojke nigde ne razlikuju.
4. **Segment kao JSON pravilo** (DSL), ne kao SQL u komponentama. Isti segment ide u listu, izveštaj, export, digest, SMS i reklamnu publiku.
5. **Integracije kao „konektori“** sa istim interfejsom (`sync`, `webhook`, `normalize`). Danas: Woo, Thinkific, Stripe, Circle, Meta. Sutra: Shopify, Google Ads…
6. **Dnevni agregati** (`daily_stats` po org / sajt / danu). Dashboard i izveštaji čitaju agregate, ne sirove porudžbine. Ovo je neophodno kad bude 100 prodavnica.
7. **Pozadinski poslovi kroz red** (queue), ne samo kroz Vercel cron.
8. **Tajne po sajtu šifrovane** (Woo ključevi, Stripe, Circle token), nikad u browseru.

---

## Faza 0: tačne brojke i temelji

**Cilj:** da svaki broj u Orderlyju bude tačan i da temelji budu spremni za sve sledeće faze.

| # | Šta | Zašto |
|---|---|---|
| 0.1 | **Refundacije**: Stripe `charge.refunded` + Woo refund; tabela `refunds`; neto prihod = bruto − refundacije; backfill istorije | prihod i profit su sada precenjeni |
| 0.2 | **MRR sa konverzijom valuta** | pogrešan MRR |
| 0.3 | **Normalizacija kupaca**: email u mala slova, popunjen `orders.customer_id`, spajanje duplikata | isti kupac se broji dvaput |
| 0.4 | **Izvori porudžbina** iz `woo_data` (`_wc_order_attribution_*`: source_type, referrer, utm_*, device_type, landing) u kolone + backfill | podaci postoje, samo se ne čitaju |
| 0.5 | **`org_id` + registar metrika + tabela `daily_stats`** | temelj za SaaS i za brze izveštaje |
| 0.6 | Završiti i spojiti **SMS recovery** (grana `feat/sms-recovery`), primeniti migracije 019 i 020 | otvoren posao ne sme da visi |

**Gotovo kad:** prihod za oktobar u Orderlyju se poklapa sa Metorikom za nemanjaantic.com (± kursna razlika).

---

## Faza 1: brzi, vidljivi dobici

**Cilj:** svaki dan dobijaš korist bez otvaranja aplikacije.

| # | Šta | Detalji |
|---|---|---|
| 1.1 | **Ciljevi** | UI za dnevni, mesečni i ponavljajući cilj, ukupno ili po sajtu; predlog (+5% od prošlog perioda); tempo („na dobrom putu, €X do cilja, N dana“); kartica na dashboardu, TV-u i u menubaru |
| 1.2 | **Digest izveštaji** | jutarnji (juče), nedeljni (ponedeljak), mesečni (1. u mesecu); **Telegram** + email; sadržaj: KPI i poređenje, napredak cilja, top proizvodi, naplata (otvoreno / naplaćeno / iznos), refundacije, neuspele uplate |
| 1.3 | **Export svega** | kupci, proizvodi, pretplate, refundacije, ne samo porudžbine |
| 1.4 | **Globalna pretraga ⌘K** | porudžbina, kupac, email, telefon, preko svih sajtova |
| 1.5 | **Izveštaj refundacija** | stopa, iznos, najčešće refundirani proizvodi, vreme do refundacije |

---

## Faza 2: segmenti: srce Metorika

**Cilj:** liste za upsell i win-back u par klikova.

| # | Šta | Detalji |
|---|---|---|
| 2.1 | **Segment engine** | JSON pravila: all / any, ugnežđeno („ima / nema porudžbinu u kojoj…“). Polja: potrošeno, broj porudžbina, kupio / nije kupio proizvod, **prvi proizvod**, sajt, zemlja, grad, UTM izvor, datum prve i poslednje kupovine, dani od poslednje kupovine, refundirano, status, kupon, pretplata aktivna / otkazana |
| 2.2 | **Builder UI** + čuvanje segmenata | na listama kupaca i porudžbina; zbir na dnu („473 kupca · €25.990 LTV“); export |
| 2.3 | **AI segment na srpskom** | Claude API pretvara rečenicu u JSON pravilo iz 2.1 (šema polja + primeri); korisnik vidi i menja filtere |
| 2.4 | **Izveštaj izvora** | po UTM / referreru / uređaju: kupci, prihod, LTV, stopa povratka |
| 2.5 | **Gotovi segmenti** | „kupili samo jednom“, „nisu kupili 90 dana“, „VIP“, „kupili X, a nisu Y“, „neuspela uplata, nisu kupili posle“ |

---

## Faza 3: kupci i proizvodi u dubinu

| # | Šta |
|---|---|
| 3.1 | **Kohorte**: retention, LTV kroz vreme, **order progression** (koliko stigne do 2., 3., 4. kupovine) |
| 3.2 | **Retention kartica**: stopa povratka, vreme između kupovina, jednokratni naspram vraćenih |
| 3.3 | **Profil kupca 2.0**: vremenska linija (porudžbine, pretplate, naplata, SMS, refundacije), privatne beleške, poređenje sa prosekom, segmenti kojima pripada |
| 3.4 | **Proizvodi**: „kupljeno zajedno“, **putanja upsella** (prvi proizvod → sledeći), stopa refundacija po proizvodu |
| 3.5 | **Kuponi**: sync iz Woo, upotreba, popust, prodaja koju su doneli |
| 3.6 | **Pretplate 2.0**: ARR, buduće obnove (prihod za 30 / 90 dana), kohorte pretplata, churn po planu |

---

## Faza 4: od podataka do akcije

**Ovde Orderly postaje bolji od Metorika**, jer spaja analitiku i naplatu, koju Metorik nema.

| # | Šta |
|---|---|
| 4.1 | **Segment → SMS kampanja** preko postojećeg gateway-a (uz odobrenje, šablone, 08–21h, STOP) |
| 4.2 | **Segment → Meta Custom Audience** preko postojeće Meta integracije (sync na 6h) |
| 4.3 | **Segment → kartice u naplati** (npr. „neuspela uplata + nije kupio za 7 dana“ automatski ide agentu) |
| 4.4 | **AI asistent na srpskom** nad Orderly podacima (Claude + alati koji čitaju registar metrika i segmente) + **MCP server** za Claude. „Rast“ računati kao rast, a ne kao ukupno (greška viđena kod Tori-ja). |
| 4.5 | **Prilagodljiv dashboard**: kartice KPI, cilj, segment total, segment lista |

---

## Faza 5: SaaS (kad odlučiš)

Zahvaljujući pravilima sa početka, ovo je uglavnom **dodavanje**, a ne prepisivanje.

| # | Šta |
|---|---|
| 5.1 | **Organizacije i timovi**: registracija, poziv članova, uloge (owner / admin / agent / viewer) |
| 5.2 | **Onboarding**: povezivanje Woo-a (WordPress plugin ili REST ključevi), Stripe (OAuth), Thinkific; inicijalni uvoz istorije sa progresom |
| 5.3 | **Naplata**: Stripe pretplate po broju porudžbina mesečno (kao Metorik), trial |
| 5.4 | **Orderly Helper plugin za WooCommerce**: pouzdan sync, korpe, atribucija |
| 5.5 | **Skaliranje**: red poslova, `daily_stats`, limiti po organizaciji, praćenje grešaka (Sentry) |
| 5.6 | **Lokalizacija**: srpski, hrvatski, engleski; više valuta; vremenska zona po organizaciji |
| 5.7 | **Marketing**: sajt, cene, poređenje „Orderly vs Metorik“, affiliate |

**Pozicioniranje SaaS-a:** „Metorik + naplata za Balkan“. Analitika, segmenti i AI kao kod Metorika, plus ono što on nema: **recovery kanban, SMS, IPS QR, Thinkific / Circle, realtime operativa, srpski jezik**.

---

## Ritam rada

Kod se piše brzo (faza za nekoliko sati rada sa Claude Code-om). Tempo određuju samo:
- **migracije i backfill na produkcijskoj bazi** (Orderly je uživo),
- **provera brojki** (posle faze 0: prihod se poklapa sa Metorikom za nemanjaantic.com),
- **spoljna podešavanja koja radi Vladimir** (Telegram bot, email domen, Meta dozvole, Claude API ključ),
- **Vladimirova provera** pre sledeće faze.

Pravilo: **jedna faza = jedna sesija = jedan commit/PR**, sa kriterijumom „gotovo kad“ na kraju svake faze.
