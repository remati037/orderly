# Metorik: kompletna analiza i plan unapređenja Orderlyja

**Datum:** 16.10.2026.
**Svrha:** šta Metorik (app.metorik.com) radi, šta je u njemu dobro i šta od toga treba uvesti u Orderly.

**Kako je urađena analiza:**
- prijava na nalog (trial do 14.11.2026), prodavnica **Nemanja B. Antić** (nemanjaantic.com, WooCommerce)
- **263 rute** izvučene iz njihovog frontend koda. Prođeno **87 korisničkih ekrana**; oko 70 internih admin ruta („kiosk“) namerno nije otvarano.
- snimljeni API pozivi za svaki ekran
- uživo testirano: AI segment na srpskom, Tori AI asistent na srpskom, forma za ciljeve, digest, prilagođavanje dashboarda, detalj porudžbine i kupca
- Orderly je mapiran čitanjem koda: `ORDERLY-INVENTAR.md`

**Prilozi:** `ORDERLY-INVENTAR.md` (šta Orderly danas ima), `screens/` (81 screenshot), `tour/` (sirovi zapisi po ekranu). `screens/` i `tour/` sadrže podatke kupaca i **namerno su u .gitignore**.

**Pravna granica:** preuzimamo ideje i principe, ne njihov kod, dizajn ni tekstove.

---

## Sadržaj
1. Ukratko
2. Šta je Metorik
3. Kompletna mapa funkcija (detaljno)
4. Rezultati testova
5. Tehnologija i arhitektura
6. **Orderly naspram Metorika: tabela poređenja**
7. Gde je Orderly već jači
8. **Šta uvesti u Orderly: prioritetni plan**
9. Problemi u Orderlyju koje treba rešiti usput
10. Otvorena pitanja za Vladimira

---

## 1. Ukratko

Metorik je **analitika i CRM za WooCommerce i Shopify**. Njegova snaga nije u jednom izveštaju, nego u tome što **sve može da se seče segmentima**: isti filter radi na porudžbinama, kupcima, proizvodima, izveštajima, kohortama, exportu, digestu, cilju, email kampanji i reklamnoj publici.

Orderly je od Metorika **jači u operativi**: naplata, realtime, zvuk, TV, menubar, SMS, više platformi (Woo, Thinkific, Stripe, Circle), uloga agenta. Metorik je **jači u analitici i radu sa kupcima**: segmenti, kohorte, refundacije, izvori (UTM), ciljevi, digest izveštaji, AI.

**Najveća vrednost za Orderly**, po redu:
1. **Segmenti kupaca i porudžbina (+ AI segment na srpskom)** → liste za upsell i win-back (primer iz testa: 473 kupca za upsell „Kralj pasivnog prihoda 2“, ukupna potrošnja €25.990)
2. **Refundacije u prihodu i profitu** (Orderly ih trenutno ignoriše)
3. **Ciljevi sa tempom** („on track, €8.903 do cilja“) umesto današnjeg cilja koji se menja samo u bazi
4. **Digest izveštaji** (email / Telegram / Slack) svakog jutra, nedelje i meseca
5. **Izvori porudžbina (UTM / referrer / uređaj)**: podaci već postoje u Woo meta poljima (`_wc_order_attribution_*`), Orderly ih samo ne čita
6. **Kohorte i ponovne kupovine**
7. **AI asistent nad podacima** (pitanja na srpskom)

---

## 2. Šta je Metorik

- SaaS za analitiku prodavnica (WooCommerce, Shopify). Povezuje se preko WooCommerce API-ja + „Metorik Helper“ plugina na sajtu.
- Glavni delovi:
  - **Resursi:** porudžbine, pretplate, kupci, proizvodi, kuponi, korpe, refundacije
  - **Analyze:** izveštaji, kohorte, ciljevi, digesti, exporti, troškovi, prilagođene metrike
  - **Engage:** email marketing (napuštene korpe, automatizacije, broadcast) + sinhronizacija publika sa oglasnim mrežama
  - **Tori:** AI asistent; **MCP** za Claude i ChatGPT; javni API
- Više prodavnica pod jednom firmom (multistore zbirni prikaz), timovi i uloge.

---

## 3. Kompletna mapa funkcija

### 3.1 Dashboard
- KPI kartice sa sparkline grafikonom i % promene: neto prihod, porudžbine, novi kupci, prodati artikli, refundirano, broj refundacija, prosečna porudžbina (neto), prosečan broj artikala, prosečan LTV kupca, prosečan broj porudžbina po kupcu.
- Statistika pretplata (MRR, aktivne, nove, obnove).
- Top proizvodi u periodu, **neuspele porudžbine** (lista), segmenti kupaca (jednokratni / ponovljeni), poslednji događaji.
- **Prilagodljiv:** više „layout-a“ (za ceo tim ili samo za sebe), broj kolona, kartice po izboru. Tipovi kartica: Report, KPI, Custom Metric, **Goal**, Grouped By, **Segment Total(s)**, **Segment List**, Subscription Stats, Heading, Divider. Boja kartice, direktan link na layout.
- TV prikaz (ikonica monitora) i ručno osvežavanje.

### 3.2 Izveštaji (Reports, oko 30)
Svaki izveštaj ima: izbor perioda, **poređenje**, grupisanje (sat / dan / nedelja / mesec), **Segment** (filter), „View orders in this report“ (klik vodi na listu tačno tih porudžbina), **Export**, **Ask AI**.

| Grupa | Izveštaji |
|---|---|
| Prihod | Revenue (neto / bruto, porezi, dostava, naknade, refundacije); Revenue grouped by (lokacija, način plaćanja); Revenue by tax |
| Porudžbine | Orders over time; **novi naspram vraćenih kupaca**; distribucija broja artikala; distribucija vrednosti porudžbine; po danu u nedelji; po satu; dan × sat; **vreme od kreiranja do završetka**; Orders grouped by (status, način plaćanja, „created via“, fee line, uloga kupca) |
| Kupci | New customers (i šta su posle kupili: LTV, AOV, broj porudžbina); Customer groups (po **prvom kupljenom proizvodu**, kategoriji, **prvom kuponu**, ulozi); **Customer retention** (stopa povratka, jednokratni naspram vraćenih, **vreme između kupovina**, artikli tokom životnog veka); Order retention (novi / vraćeni kroz vreme) |
| Izvori | **Customer sources** i **Order sources**: referrer, landing stranica, **UTM**; „X% kupaca ima poznat izvor“; po izvoru: kupci, porudžbine, prihod, LTV, stopa povratka |
| Uređaji | mobilni / desktop, OS, browser, prosečna porudžbina po uređaju („mobilni donosi 48% prihoda“) |
| Prognoza | 3 / 6 / 12 / 24 meseca istorije → 4 meseca unapred: prihod, porudžbine, novi kupci, stopa rasta |
| Profit | neto prihod minus trošak proizvoda, dostave, transakcija, oglasa i operativnih troškova; po datumu; po načinu plaćanja |
| Refundacije | po datumu porudžbine ili refundacije; stopa refundacija, % prodaje, prosečan povraćaj, **vreme do refundacije**, **najčešće refundirani proizvodi** |
| Proizvodi | po tipu, brendu / vendoru; top sellers; **stock velocity** (koliko dana zaliha); **products bought together**; atributi varijacija; grupe proizvoda |
| Pretplate | MRR i ARR, aktivne, događaji (nove, obnove, otkazane), planovi, **kohorte pretplata**, retencija, životni ciklus, **buduća obnova** (očekivani prihod od obnova narednih 3 meseca) |
| Korpe | napuštene korpe (uz uključeno praćenje korpi) |

### 3.3 Liste resursa: porudžbine, kupci, proizvodi, pretplate, kuponi, refundacije
- Tabovi **List / Segments / Compare** na svakoj listi.
- Izbor kolona, sortiranje, paginacija (15 / 50 / 100 / 250), **Export** svega što je filtrirano.
- Na dnu liste zbir za segment: „473 kupca · €25.990 ukupni LTV · 551 porudžbina · €54,9 prosečni LTV · 1,2 prosečno porudžbina“.
- **Globalna pretraga** (⌘K) preko porudžbina, kupaca i proizvoda.

### 3.4 Segmenti (najvažnija funkcija)
- Filter builder: „Match **all / any** of these filters“, **ugnežđeni** pod-segmenti („Has orders in segment“ / „Doesn't have orders in segment“).
- **Preko 100 polja za kupce**, u grupama:
  - **Common:** ukupno potrošeno, broj porudžbina, artikli, kupljeni proizvodi, tip kupca, aktivne i otkazane pretplate
  - **Datumi:** pridružio se, prva i poslednja kupovina, „naručio / nije naručio u periodu“, **dani između porudžbina**, započeo / otkazao pretplatu
  - **Detalji:** email, ime, uloga, adresa za naplatu i dostavu (grad, zemlja, poštanski broj, geo)
  - **Prva porudžbina:** prvi proizvod, kategorija, kupon, iznos, tip
  - **Ostalo:** stavke porudžbina, kategorije, ukupni popust, **ukupno refundirano**, broj jedinstvenih proizvoda, **naknadno kupljeni proizvodi**, **ponovo kupljen proizvod**, korišćeni kuponi, privatne beleške
  - **Izvor:** referrer, landing, **UTM** campaign / medium / source / term / content
  - **„Within top-right dates“:** isti filteri, ali samo za izabrani period
  - **Engage:** primio / otvorio / kliknuo email, odjavljen, opt-in
  - **Custom fields:** sva meta polja iz WooCommerce-a (npr. `_wc_order_attribution_utm_source`, FunnelKit, HubSpot…)
- Segmenti se **čuvaju** i koriste svuda: izveštaji, kohorte, poređenja, exporti, digesti, ciljevi, dashboard kartice, email kampanje, reklamne publike.
- **Segment with AI:** opišeš rečima, a AI složi filtere (test u delu 4).
- **Compare:** do N segmenata jedan pored drugog kroz vreme (porudžbine, kupci, proizvodi).

### 3.5 Detalj porudžbine
Stavke, plaćanje (način, valuta, ID transakcije, „created via“), prilagođena polja, kupac sa LTV, AOV i brojem porudžbina, **WooCommerce beleške** (poslati emailovi, upsell, plaćanje), prethodna / sledeća porudžbina, dugme Edit.

### 3.6 Profil kupca
- KPI kupca **sa poređenjem prema proseku prodavnice** („€37 ukupno potrošeno, 46,6%“).
- **Vremenska linija** (pridružio se → porudžbine → pretplate → emailovi).
- Lista porudžbina i kupljenih proizvoda, **privatne beleške**, prilagođena polja („Metorik properties“).
- U integracijama: tiketi iz Zendesk-a, Help Scout-a, Intercom-a itd. pored kupca.

### 3.7 Kohorte (8 vrsta)
Returning customers, customers by order count, **order progression** (koliko je stiglo do 2., 3., 4. porudžbine za N dana), orders per customer, AOV over time, **LTV over time**, **profit over time**, sales.
- Mesec / nedelja / godina, „weighted average“, proseci za mesec 3, 6, 12 i 24, segmentiranje, export.

### 3.8 Ciljevi (Goals)
- Bilo koja metrika ili segment: prihod, novi kupci, konverzija, refundacije, ponovljeni kupci, prilagođene metrike…
- **Predlog cilja** („5% iznad prošlog meseca, €16.863“), „najmanje“ / „najviše“, jednokratan ili **ponavljajući** (mesečno…).
- **Tempo:** „On track · €8.903 do cilja · 16 dana“, grafikon stvarno naspram očekivanog tempa.
- Vidljivost: ceo tim vidi, samo ja menjam. Prikazuje se kao kartica na dashboardu.

### 3.9 Prilagođene metrike
Formula od postojećih metrika i segmenata (npr. „neto prihod ÷ novi kupci“). Koristi se na dashboardu, u digestima, ciljevima, API-ju i MCP-u.

### 3.10 Digesti (izveštaji na mejl i Slack)
- Već postoje: **Monthly Sales Update** (1. u mesecu u 9h) i **Weekly Sales Update** (ponedeljkom u 9h), dugme „Send now“.
- Čarobnjak u 5 koraka: Ime → Gde (email / Slack) → Kada → Izveštaj (koje metrike i segmenti) → …

### 3.11 Exporti
Sačuvani i **zakazani** exporti (CSV na email / Slack po rasporedu), istorija exporta.

### 3.12 Troškovi i profit
- Trošak po proizvodu i varijaciji (ručno, iz WooCommerce COGS-a ili CSV-a).
- **Dostava** po zemlji ili metodu, **transakcije** po gateway-u, dodatni trošak po porudžbini, **oglasi** (iz integracija), **operativni troškovi** (po kategorijama).
- „Preračunaj postojeće porudžbine“.

### 3.13 Tori (AI asistent) + MCP + API
- Chat nad podacima prodavnice. Panel ostaje otvoren sa strane dok se krećeš kroz aplikaciju.
- Prikazuje grafikone i tabele, izvore („Based on 4 sources“), datum podataka i predloge sledećih pitanja.
- Opt-in, poštuje prava korisnika, admin ga može isključiti, dodatne instrukcije po prodavnici (do 1.000 znakova).
- **MCP** za Claude i ChatGPT (samo čitanje). **API** sa ključevima i scope-ovima.
- „**Ask AI**“ dugme na tabelama izveštaja.

### 3.14 Engage (email marketing)
- Zahteva verifikaciju domena za slanje.
- **Napuštene korpe:** praćenje korpi + personalizovani emailovi + oporavak korpe jednim klikom.
- **Automatizacije:** welcome serija, win-back, potvrde porudžbina, bilo šta po segmentu.
- **Broadcast:** jednokratne kampanje, zakazivanje. Uvoz kontakata („Profiles“).
- Email editor (Unlayer), dizajni, statistika (otvaranja, klikovi, bounce, spam), log poslatih poruka sa razlozima neslanja.
- **Ad Audiences:** segment → publika na **Facebook, Google, TikTok, Pinterest, Reddit**, sinhronizacija na 6 sati („samo dodaj“ ili „dodaj i ukloni“).

### 3.15 Integracije (23)
- **Izveštavanje:** Slack, Google Analytics
- **Oglasi (troškovi i publike):** Google, Facebook, TikTok, Pinterest, Snapchat, Reddit, Microsoft, OpenAI Ads, AppLovin
- **Podrška:** Zendesk, Help Scout, Gorgias, Groove, Freshdesk, Intercom (tiketi pored kupca), plus Metorik prikaz unutar tih alata
- **Dostava:** ShipStation
- **Zapier**

### 3.16 Podešavanja prodavnice
- Vremenska zona i valuta; **koji datum se koristi** (kreirana / plaćena / završena porudžbina)
- Imena, ikonice i boje statusa; prikaz imena kupaca (osoba ili firma), nazivi uloga
- Omiljena prilagođena polja; konekcija (Helper plugin, sync, alati za resinhronizaciju)
- Tim, AI i MCP, API ključevi

### 3.17 Ostalo
Multistore zbirni prikaz (sve prodavnice, jedna valuta), changelog, javni roadmap sa glasanjem, desktop aplikacija, preporuka (refer & earn).

---

## 4. Rezultati testova

| Test | Rezultat |
|---|---|
| **AI segment na srpskom**: „Kupci iz Srbije koji su kupili Kralj pasivnog prihoda ali nikad nisu kupili Kralj pasivnog prihoda 2“ | Za oko 20 s složio je ispravne ugnežđene filtere: zemlja = Srbija; ima porudžbinu sa „Kralj pasivnog prihoda“; nema porudžbinu sa „…2“. **Sam je isključio** pending, failed i cancelled porudžbine. Rezultat: **473 kupca, €25.990 ukupni LTV, 551 porudžbina, €54,9 prosečni LTV**. Gotova lista za upsell. |
| **Tori na srpskom**: „Uporedi prihod po mesecima za 6 meseci, koji proizvod najviše raste i zašto je pao broj vraćenih kupaca, napravi grafikon“ | Oko 60 s. Odgovor na srpskom, grafikon po mesecima (najjači jun, €24.432), izvori i datum podataka, predlozi sledećih pitanja. **Slabost:** za „najviše raste“ dao je najprodavaniji proizvod (KPP, 1.287 kom, €46.830), a ne rast; objašnjenje za povratnike je generičko. |
| **Ciljevi** (forma) | Predlog €17.700 (5% iznad €16.863), pregled uživo: 50%, „on track“, €8.797 ostvareno, 16 dana do kraja. |
| **Prognoza** | Sledeća 4 meseca: €68.681 (€17.170/mes, +14,8%), 1.539 porudžbina, 1.056 novih kupaca. Osnova: €145.058 i 3.084 porudžbine za 12 meseci. |
| **Izvori** | Samo 21% porudžbina i 33% kupaca ima poznat izvor (Google, Instagram). Ostalo je nepoznato, što pokazuje da je praćenje izvora na sajtu slabo. |
| **Uređaji** | Mobilni 50% porudžbina i 48% prihoda; desktop porudžbina je 11% vrednija. iOS 36%, Windows 29%. |
| **Refundacije** | 48 refundacija u bazi, sve „Refunded via Stripe dashboard“. **Orderly ih trenutno ne oduzima od prihoda.** |
| **Kuponi** | INVESTITOR: 4 korišćenja, €40 popusta, €167 prodaje u periodu. |
| **Pretplate** | 205 pretplata (Klub 1%, mesečna i godišnja), MRR €38, buduće obnove €57 za 3 meseca. |

---

## 5. Tehnologija i arhitektura

| Sloj | Metorik |
|---|---|
| Backend | Laravel (PHP), nginx; multi-tenant baze („tenant DB“ po klijentu) |
| Frontend | Vue 2 + Vuex, ECharts + Chart.js |
| Email editor | Unlayer |
| Podrška | Help Scout Beacon, Ferndesk (help widget) |
| Greške | Sentry |
| Analitika | GA4, Google Ads, OpenAI pixel |
| Sync | WooCommerce REST API + **Metorik Helper plugin** (napredni sync, praćenje korpi, atribucija) |
| AI | Tori (interni evals sistem), MCP server, AI generisanje segmenata |

**Arhitekturni princip vredan preuzimanja:** jedan **univerzalni filter / segment engine** nad svim entitetima. Svaka nova funkcija (izveštaj, cilj, digest, export, kampanja) samo primi „segment“ kao parametar.

---

## 6. Orderly naspram Metorika

| Oblast | Orderly danas | Metorik | Razlika |
|---|---|---|---|
| KPI + poređenje perioda | ✅ (+ isti period prošle godine) | ✅ | jednako |
| Više sajtova / platformi | ✅ Woo + Thinkific + Stripe + Circle | ✅ Woo + Shopify (multistore) | **Orderly jači** (više platformi) |
| Realtime, zvuk, TV, menubar | ✅ | samo TV | **Orderly jači** |
| Naplata (recovery kanban, agenti, SMS) | ✅ | ❌ (samo lista neuspelih + email korpe) | **Orderly jači** |
| Segmenti kupaca i porudžbina | ❌ fiksni VIP / Regular / New | ✅ 100+ polja, ugnežđeni, AI | **velika rupa** |
| Refundacije | ❌ ignorišu se | ✅ izveštaj + oduzimanje + top refundirani proizvodi | **velika rupa** (i greška u brojkama) |
| Izvori (UTM / referrer / uređaj) | ❌ | ✅ | rupa (podaci već postoje u Woo meta) |
| Kohorte | 🟡 jedna tabela 6 × 3 | ✅ 8 vrsta | rupa |
| Ponovne kupovine / vreme između kupovina | 🟡 novi naspram vraćenih | ✅ retention, order progression | rupa |
| Ciljevi | 🟡 dnevni, bez UI | ✅ bilo koja metrika, tempo, ponavljanje | rupa |
| Digest izveštaji (email / Slack) | ❌ | ✅ | rupa |
| Exporti | 🟡 CSV porudžbina | ✅ sve + zakazani | rupa |
| Proizvodi (bought together, refund rate, velocity) | 🟡 top proizvodi | ✅ | srednja rupa |
| Kuponi | ❌ | ✅ | srednja rupa |
| Pretplate | 🟡 MRR, churn (MRR bez konverzije valute) | ✅ MRR / ARR, kohorte, buduće obnove | srednja rupa |
| Profit / troškovi | 🟡 marža, Stripe fee, Meta | ✅ + dostava, operativni troškovi, više ad mreža | srednja rupa |
| Prognoza | 🟡 Holt, 30 dana | ✅ 4 meseca, 3 metrike | slično |
| Profil kupca | 🟡 statistika + istorija | ✅ vremenska linija, beleške, poređenje sa prosekom | srednja rupa |
| AI asistent / MCP | ❌ | ✅ Tori + MCP + Ask AI | rupa (ali velika prilika) |
| Email marketing (korpe, automatizacije) | ❌ (SMS u izradi) | ✅ Engage | različit fokus |
| Reklamne publike | ❌ | ✅ 5 mreža | prilika |
| Globalna pretraga ⌘K | ❌ | ✅ | mala, korisna |
| Uloge | owner / agent | admin, članovi, vidljivost po layout-u | slično |

---

## 7. Gde je Orderly već jači (ne dirati, nego isticati)

1. **Naplata:** kanban sa automatskim otvaranjem i zatvaranjem, spajanje Stripe pokušaja, razlog odbijanja, „rešeno drugde“, agenti, beleške, SMS. Metorik ovo uopšte nema.
2. **Realtime operativa:** live feed, zvuk po sajtu, TV zid, menubar.
3. **Više platformi** u jednom prikazu: Woo + Thinkific + Stripe + Circle + ručne IPS porudžbine.
4. **Balkanski kontekst:** IPS QR, beogradsko vreme, srpski interfejs, SMS preko sopstvenog modema.
5. **Uloga agenta** koji ne vidi profit.

---

## 8. Šta uvesti u Orderly: prioritetni plan

Procena napora: S = do 1 dan, M = 2–4 dana, L = nedelja i više.

### P0: ispravke koje utiču na tačnost brojki (pre svega ostalog)
| # | Šta | Napor | Kako (u Orderly kodu) |
|---|---|---|---|
| 0.1 | **Refundacije**: Stripe `charge.refunded` + Woo refund webhook; tabela `refunds` (order_id, iznos, datum, razlog); neto prihod = bruto − refundacije | M | `lib/sync/normalize-stripe-event.ts`, `normalize-woo-order.ts`, nova migracija, `lib/utils/order-status.ts` |
| 0.2 | **MRR sa konverzijom valuta** | S | `app/api/subscriptions/route.ts` + `lib/utils/fx.ts` |
| 0.3 | **Normalizacija kupaca**: email u mala slova, popunjavanje `orders.customer_id` | S–M | migracija + sync normalizeri |
| 0.4 | **Izvori porudžbina**: čitanje `_wc_order_attribution_*` iz `woo_data` (source_type, referrer, utm_*, device_type, session_entry) u nove kolone | S | `normalize-woo-order.ts` + migracija + backfill iz postojećeg `woo_data` |

### P1: najveća vrednost (sledećih 2–3 nedelje)
| # | Šta | Zašto | Napor |
|---|---|---|---|
| 1.1 | **Segment engine** (kupci + porudžbine): filter builder all / any, ključna polja (potrošeno, broj porudžbina, kupljeni / nije kupio proizvod, prvi proizvod, sajt, zemlja, grad, UTM izvor, datum prve i poslednje kupovine, refundirano, status), čuvanje segmenata, zbir na dnu, export | upsell i win-back liste, osnova za sve ostalo | L |
| 1.2 | **AI segment na srpskom**: prevod rečenice u JSON filter za segment engine (Claude API, sa šemom polja) | korisnik ne mora da zna filtere | M (posle 1.1) |
| 1.3 | **Ciljevi**: UI za dnevni, mesečni i ponavljajući cilj po sajtu ili ukupno; predlog (+5% od prošlog perioda); tempo („on track, X do cilja, N dana“); kartica na dashboardu i TV-u | danas cilj postoji samo u bazi | M |
| 1.4 | **Digest izveštaji**: jutarnji (juče), nedeljni, mesečni; email (Resend) + **Telegram** (prirodnije za Balkan od Slack-a); KPI + poređenje + top proizvodi + naplata (otvoreno / naplaćeno) | vlasnik vidi stanje bez otvaranja aplikacije | M |
| 1.5 | **Izveštaj izvora** (UTM / referrer / uređaj) po sajtu, sa LTV-om i stopom povratka po izvoru | koji kanal donosi kupce koji se vraćaju | M (posle 0.4) |

### P2: dublja analitika (mesec dana)
| # | Šta | Napor |
|---|---|---|
| 2.1 | **Kohorte**: retention, LTV over time, order progression (2., 3., 4. kupovina), mesec / nedelja, segment | M |
| 2.2 | **Retention kartica**: stopa povratka, vreme između kupovina, jednokratni naspram vraćenih | S–M |
| 2.3 | **Profil kupca 2.0**: vremenska linija (porudžbine, pretplate, naplata, SMS), privatne beleške, poređenje sa prosekom, segmenti kojima pripada | M |
| 2.4 | **Proizvodi**: „kupljeno zajedno“, stopa refundacija po proizvodu, prvi proizvod → sledeći proizvod (upsell putanja) | M |
| 2.5 | **Kuponi**: sync iz Woo, upotreba, popust, prodaja koju su doneli | S–M |
| 2.6 | **Pretplate 2.0**: ARR, buduće obnove (prihod narednih 30 / 90 dana), kohorte pretplata | M |
| 2.7 | **Exporti** svih lista i segmenata + zakazani export na email | S–M |
| 2.8 | **Globalna pretraga ⌘K** (porudžbina, kupac, email, telefon) | S |

### P3: diferencijacija (posle)
| # | Šta | Napor |
|---|---|---|
| 3.1 | **AI asistent nad Orderly podacima** na srpskom (Claude + alati koji čitaju Orderly API) + **MCP server** za Claude. Paziti na slabost viđenu kod Tori-ja: „rast“ računati kao rast, ne kao ukupno. | L |
| 3.2 | **Segment → akcija**: segment direktno u SMS kampanju (postojeći SMS gateway) i u Meta Custom Audience (postojeća Meta integracija) | L |
| 3.3 | **Prilagodljiv dashboard** (kartice: KPI, cilj, segment total, segment lista) | L |
| 3.4 | **Operativni troškovi** + dostava u profitu; Google Ads trošak | M |
| 3.5 | **Napuštene korpe za Woo** (plugin ili postojeći FunnelKit podaci) → naplata kanban + SMS | L |

### Preporučen redosled
`P0 (0.1–0.4) → 1.3 Ciljevi → 1.4 Digest → 1.1 Segmenti → 1.2 AI segment → 1.5 Izvori → P2 → P3`

Ciljevi i digest su brzi i odmah vidljivi. Segmenti su najveći posao i najveća vrednost.

---

## 9. Problemi u Orderlyju koje treba rešiti usput

1. **Prihod i profit ne oduzimaju refundacije.** Samo u Metoriku vidimo 48 refundacija za ovu prodavnicu, pa su brojke u Orderlyju **precenjene**.
2. **MRR bez konverzije valuta.**
3. **`orders.customer_id` se nikad ne popunjava**, a emailovi nisu normalizovani, pa isti kupac može biti dva kupca.
4. **Dnevni cilj nema UI.**
5. **Endpoint `ads/spend` niko ne koristi.**
6. **SMS gateway nije povezan sa Orderly API-jem**; migracije 019 i 020 su „pending“; grana `feat/sms-recovery` nikad nije pushovana.

---

## 10. Otvorena pitanja za Vladimira

1. **Kanal za digest:** email, Telegram, WhatsApp ili Slack? Kome ide (samo ti ili i klijenti)?
2. **Da li Orderly postaje SaaS** (više firmi), ili ostaje interni alat? To menja arhitekturu segmenata, AI-ja i podešavanja.
3. **Šta je prvi „must have“:** segmenti za upsell, ciljevi ili digest?
4. **Refundacije:** da li se refundacije rade samo preko Stripe dashboarda (kao sad) ili i kroz WooCommerce?
5. **Metorik trial** ističe 14.11.2026. Da li ga koristiti paralelno kao referencu dok Orderly ne dobije segmente?
6. **SMS recovery** prvo završiti (grana je otvorena), pa onda ovo, ili obrnuto?
