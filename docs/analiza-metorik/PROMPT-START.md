Krećemo sa unapređenjem Orderlyja po planu iz analize Metorika. Orderly koristim interno, a kasnije od njega pravim SaaS kao Metorik. Zato sve gradiš „SaaS-ready“.

KORAK 1: PROČITAJ (ceo, pre bilo čega drugog)
1. STATUS.md i AGENTS.md
2. docs/analiza-metorik/PLAN-FAZE.md: plan po fazama i 8 pravila „SaaS-ready od prvog dana“. Ovo je glavni dokument.
3. docs/analiza-metorik/ORDERLY-INVENTAR.md: šta Orderly danas ima i poznati problemi u kodu.
4. docs/analiza-metorik/IZVESTAJ.md: analiza Metorika (deo 3 za detalje funkcija, deo 8 za konkretne fajlove).
Screenshotove u docs/analiza-metorik/screens/ otvaraj po potrebi.

KORAK 2: SREDI GIT PRE NOVOG POSLA
- Trenutno si na grani feat/sms-recovery sa necommitovanim SMS radom. Ništa od toga ne briši i ne gubi.
- Pregledaj SMS rad, završi ga (povezivanje sms-gateway sa /api/sms/gateway/*, migracija 020), napravi testove, commituj ga na feat/sms-recovery i javi mi da li je spreman za spajanje na main.
- Nove dokumente iz docs/analiza-metorik commituj odvojeno (screens/ i tour/ su u .gitignore jer sadrže podatke kupaca, i tako ostaju).
- Za svaku fazu iz plana napravi novu granu sa main-a (npr. feat/faza-0).

KORAK 3: FAZA 0 (tačne brojke i temelji)
Uradi stavke 0.1 do 0.5 iz PLAN-FAZE.md:
- 0.1 refundacije (Stripe charge.refunded + Woo refund, tabela refunds, neto = bruto − refundacije, backfill)
- 0.2 MRR sa konverzijom valuta
- 0.3 normalizacija kupaca (email u mala slova, popunjen orders.customer_id, spajanje duplikata)
- 0.4 izvori porudžbina iz woo_data (_wc_order_attribution_*) u kolone + backfill
- 0.5 org_id na svim tabelama (jedna podrazumevana organizacija) + registar metrika (lib/metrics) + tabela daily_stats
Pravila:
- Orderly je UŽIVO. Pre svake migracije i backfill-a na produkcijskoj bazi pokaži mi šta tačno radi i koliko redova menja, i sačekaj moju potvrdu.
- Migracije moraju biti reverzibilne (napiši i down korak) i ne smeju da zaključaju tabelu orders duže vreme.
- Webhookovi (Woo, Stripe, Thinkific, manual) ne smeju da prestanu da rade ni u jednom trenutku.
- Postojeći Vitest testovi moraju da prolaze; za svaku novu logiku napiši testove.
- Tajne (.env.local, ključevi sajtova) nikad ne ispisuj u chat i ne commituj.

KORAK 4: PROVERA FAZE 0
- Uporedi neto prihod za oktobar 2026 za sajt nemanjaantic.com u Orderlyju sa Metorikom (Metorik: neto = bruto − porezi − dostava − naknade − refundacije). Napravi mi tabelu: Orderly naspram Metorika, po mesecima avgust, septembar, oktobar, sa objašnjenjem svake razlike.
- Ažuriraj STATUS.md.
- Stani i javi mi rezultat. Sledeću fazu pokrećem ja.

Za sledeće faze dovoljno je da napišem: „Kreni sa fazom 1 iz PLAN-FAZE.md“ (pa 2, 3, 4). Svaka faza: nova grana, plan pre koda, potvrda pre produkcijskih migracija, testovi, „gotovo kad“ provera, STATUS.md.

Piši na srpskom (ekavica, latinica).
