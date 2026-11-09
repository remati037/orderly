# Status: Orderly
Ažurirano: 2026-11-07
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

- Novi tab **Black Friday** (`/bonus`, samo vlasnik): Black Friday 2026 obračun za 1–30. novembar. Neto promet po sajtu; partneri (Nemanja Antic, FIlip Ćirić, Odgovori Univerzuma) sa 50%. Skala: 70k i 90k (3%), 100k 6.000 €, 125k 7.500 € (6%), 150k 18.000 €, 175k 22.000 €, 200k+ 30.000 €; između pragova procenat dostignutog praga × promet; deli se na 4 osobe. Podešavanja su u `settings.bonus_program` (migracija 030, primenjena). Sajt se rasklapa na proizvode sa ciljem po proizvodu (čuva se u `settings.bonus_program.product_goals`, poredi se sa obračunskim prometom). Već je na `origin/main`.

- Dashboard: nova kompaktna lista po sajtovima ispod glavnih kartica (prihod, porudžbine, AOV, neto zarada, Stripe naknade), od najvećeg prihoda ka najmanjem, prati filtere; `components/dashboard/site-summary-table.tsx`. Zbir se poklapa sa karticama na stvarnim podacima. Izgled proveren na privremenoj stranici sa brojkama iz baze, ne na samom dashboardu iza prijave. Već je na `origin/main`.

- Stranica **Reklame** (`/reklame`, vlasnik i agenti) po planu iz `~/Downloads/PLAN.md`: Meta podaci po oglasu, gornja traka sa Black Friday napretkom, kampanje po nalogu, najbolji i najgori oglasi, kartica preporuka, Telegram alarmi. Migracije 031 do 034 primenjene na bazu, 30 dana istorije učitano za nalog Vladsdigital. Popravljen i pomeren dan u ad spend prozoru (profit/kpi, ad-performance, ads/spend).
  Provereno: juče 69,72 € / 8 kupovina / 599,62 € isto kao Meta konektor; Black Friday 5.361,73 € isto kao nezavisan SQL upit. Na produkciji od 2026-11-04 (`main`), osvežavanje preko pg_cron na 15 minuta (migracija 035). Izgled proveren na privremenoj stranici, ne iza prijave.

- `/reklame` prepravljena posle Vladimirovog pregleda: izbor perioda, tabela svih naloga, za svaki nalog ocena, kartice, levak, grafikoni po danu, kampanje sa ad setovima i oglasima, oglasi koji rade i ne rade. Leadovi i posete stranici dodati (migracija 033).

- `/reklame` druga prepravka: na vrhu kartica za svaki nalog (ROAS juče, juče, 7 dana, trend, povezanost sa sajtom), bez Black Friday dela; jedan grafikon sa dve linije; ocene i najbolji i najgori oglasi uvek po poslednjih 7 punih dana. System User je "Orderly" u BM Vladsdigital, pa nalozi ulaze dodelom njemu, bez novog tokena.

- Kartica **Reklame → Svi oglasi** (`/reklame/oglasi`, vlasnik i agenti): kao Ads Manager, kampanje sa potrošnjom danas, juče, ili u 7, 14 ili 30 punih dana (ocena za danas i juče gleda 7 punih dana), grupisano po nalozima (kratko ime u boji, kolona `ad_accounts.short_name`, migracija 036), klik otvara ad setove pa oglase sa slikama. Ocena „Forsiraj / Dobar, pauziran / Prati / Ugasi / Rano za ocenu" ide po M4 pragu naloga, na svakom nivou, uz filtere, sortiranje i link na Ads Manager. Brojke dve kreative se slažu sa bazom; izgled proveren na privremenoj stranici, ne iza prijave.
- Dodata još 4 Meta naloga preko Vladimirovog ličnog tokena (`ads_read`, ističe oko 2027-01-03): AF $ BP ANT 01, Novi nalog, Filip Ćirić, Biznis Priče; 30 dana istorije učitano. 7 punih dana (28.10.–3.11.) po nalogu slaže se sa Meta konektorom (najveća razlika 2 centa na prihodu). Novi nalog ne šalje vrednost kupovine, pa nema ROAS.

- `/reklame` prikazuje samo naloge sa potrošnjom danas ili juče; ostali se i dalje sinhronizuju i vraćaju se sami kad krenu.

- Povezano 13 kampanja sa sajtovima po odobrenom predlogu (Filip Ćirić, Odgovori Univerzuma, Biznis priče, AI Profit Lab). AI Video Editor kampanja ide na AI Profit Lab, jer se tamo prodaje, ne na Vladsdigital kako je predlog glasio.

- Nalog određuje sajt (`ad_accounts.site_id`, migracija 034): Vladsdigital na AI Profit Lab, AF $ BP ANT 01 na Nemanja Antic, Filip Ćirić i Biznis Priče na svoje sajtove; nove kampanje nasleđuju sajt, ručne veze ostaju. Dashboard tabela po sajtovima: Prihod, Porudžbine, AOV, Facebook reklame (nije oduzeta od zarade), Neto zarada; Stripe naknade uklonjene iz tabele.

- `/reklame`: uz ROAS po Meti stoji i okvirni ROAS iz Orderly-ja (sav neto prihod sajta / potrošnja povezanih kampanja), na kartici za juče i 7 dana i na bloku naloga za izabrani period.

- Noćni režim (na produkciji od 2026-11-05, `main`). Sam se pali od 20:00 do 07:00 po satu uređaja, prekidač "Noćni režim" je u bočnom meniju; ručni izbor važi do sledeće promene po rasporedu (`lib/theme/`). Sve boje ekrana prebačene na promenljive u `app/globals.css` (`--ui-*`, `--tone-*`); nove boje dodavati tamo, ne direktno u komponente. TV prikaz je već taman i nije diran. Izgled proveren na privremenoj stranici sa izmišljenim podacima (bočni meni, kartice, tabele, grafikoni, porudžbine) i na prijavi; ostali ekrani iza prijave nisu otvarani.

- `/reklame`: izbor perioda (podrazumevano Danas) je na vrhu i važi i za kartice naloga; ocene, trend i oglasi i dalje gledaju poslednjih 7 punih dana.

## Sledeći korak
- Noćni režim: Vladimir da prođe ekrane iza prijave (Naplata, Reklame, Profit, Kupci, Pretplate, Podešavanja) i javi šta se slabo čita.
- Meta live: potvrditi prvi prolaz zakazanog zadatka `orderly-meta-preporuke` (9, 14 i 20h, napravljen 2026-11-04) i da su preporuke stigle na /reklame.
- Kad Vladimir odobri: push na `main` da bi lista po sajtovima bila na produkciji.
- Prikazati Woo webhook URL u podešavanjima sajta (ili ih praviti automatski pri dodavanju sajta).
- Circle: test sa jednim email-om, pa `enabled = true` i merge grane `feat/circle-access`.
- Faza 1 (ciljevi, digest, export, ⌘K pretraga, izveštaj refundacija): grana `feat/faza-1`, plan u `docs/analiza-metorik/FAZA-1.md`.

## Šta fali od Vladimira
- Meta live: pre 3. januara obnoviti lični token ili napraviti dugme "Poveži Facebook".
- Meta live: Telegram bot token i chat_id; ciljni CPA po nalogu (sada procena 27,52 €).
- Circle Admin API token mora imati pravo pisanja (sad je sačuvan na sajtu AI Profit Lab); potvrda da radi i test email za probu dodele.
- Pretplatiti Stripe webhookove oba Stripe sajta na `charge.refunded` (do tada refundacije stižu dnevnim cronom).

## Otvorena pitanja / rizici
- Zakazani zadatak `orderly-meta-preporuke` je stajao na komandi Keychain + curl. Od 2026-11-07 čita i piše samo preko `scripts/meta-preporuke.sh`, a `sh` je već dozvoljen, pa ne bi trebalo da traži odobrenje. Skripta je isprobana ručno, a ceo prolaz zadatka još nije potvrđen. Zadatak više ne zove Meta konektor, pa proveru budžeta menjanog u poslednjih 48h ostavlja čoveku u tekstu preporuke.
- Lični token: 4 naloga prestaju da se osvežavaju kad istekne ili kad se promeni Facebook lozinka; greška se vidi na njihovom bloku.
- Meta live: Meta API nivo je `development_access`, pa rate limit može da zasmeta kad se doda više naloga. Upis preporuka je isproban uživo, ali dugme Urađeno nije probano iza prijave. Stvarni ROAS na vrhu računa sav neto prihod, i onaj koji nije od reklama. Claude zadatak kao lokalni radi samo kad je Mac budan.
- Za Woo sajtove UI ne prikazuje webhook URL niti ih pravi sam — svaki novi Woo sajt ostaje bez webhook-a ako se to zaboravi.
- Dug za Fazu 5: `settings.key` i `customers.email` su jedinstveni globalno, ne po organizaciji; većina endpointa još ne filtrira po org_id (registar metrika filtrira kad dobije orgId).
- Ad spend prozor u profit/kpi i ad-performance koristi UTC datume Beogradskih ponoći (dan pomeren) — postojeća greška, nije dirana.
- `profit/recalculate` ne preračunava net_profit za refunded porudžbine.
- Stripe webhook treba da bude pretplaćen na `charge.refunded` u Stripe-u; dok nije, refundacije stižu dnevnim cronom (do 24h kašnjenja).
