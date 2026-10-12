# Status: Orderly
Ažurirano: 2026-10-12
Faza: uživo

## Gde smo stali
- Naplata: Stripe porudžbine (Circle) nisu imale telefon jer ga Circle ne šalje Stripe-u.
  Sada Stripe webhook po mejlu povlači telefon iz Circle profila (polje "Telefon"),
  token se čuva po sajtu (`sites.circle_token`, polje u Podešavanja → Sajtovi).
- Popunjeni postojeći podaci: 1.469 porudžbina dobilo telefon; od 723 otvorene kartice
  AI Profit Lab-a, 480 sada ima broj (ostali nemaju telefon ni u Circle-u).
- U toku (necommitovano): SMS recovery (grana feat/sms-recovery).

## Sledeći korak
- Pustiti Circle izmenu na produkciju (merge u main), da i nove porudžbine dobijaju telefon.
- Završiti SMS recovery.

## Šta fali od Vladimira
- Circle token za Odgovori Univerzuma, ako je i on na Circle-u.

## Otvorena pitanja / rizici
- Migracije 019 i 020 su "pending" u db:status (019 je već ručno primenjena).
