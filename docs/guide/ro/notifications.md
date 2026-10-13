<!-- translation-of: notifications.md#5487cd95 -->
# Notificări

## Canale

**Notificări › Adaugă canal**. Integrate: **E-mail** (necesită serverul SMTP din Setări), **Microsoft
Teams** (webhook Workflows), **Slack** (incoming webhook) și **Webhook (JSON)**. Peste 100 de alte
canale (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal, Twilio și alte gateway-uri
SMS, Mattermost, Matrix, Google Chat, …) provin de la furnizorii de notificări Uptime Kuma. **Trimite
test** verifică un canal; **Jurnal** arată fiecare trimitere și de ce a fost omis un canal.

Mesajele de chat încep cu **[Fudo]**, ca să le deosebiți ușor de alte instrumente care scriu în
același chat.

## Ce incidente primește un canal

| Setare | Efect |
|---|---|
| **Trimite** | *Toate incidentele acestui chiriaș* (implicit) sau *Doar incidentele aplicațiilor selectate* |
| **Severitate minimă** | Minor și peste (toate), Major și Critic sau doar Critic |
| **Evenimente** | deschidere, confirmare, rezolvare |
| **Omite incidentele cauzate de alt incident** | doar cauzele principale, nu și incidentele afectate legate de ele |
| **Reamintește cât timp nu este confirmat** | repetă la fiecare N minute cât timp nimeni nu confirmă |
| **Limba mesajelor** | limba canalului; implicit cea a organizației (Setări) |

Canalele unui chiriaș primesc incidentele acestuia, inclusiv pe cele cauzate de infrastructura
partajată (cu cauza principală în mesaj). Canalele globale primesc incidentele de infrastructură; cu
**toți chiriașii** (un canal NOC) primesc și incidentele fiecărui chiriaș, cu excepția celor cauzate
de un incident de infrastructură primit deja.

**Pe aplicație:** un canal cu *Doar incidentele aplicațiilor selectate* află doar despre acestea.
Alegeți-le în formularul canalului sau pe pagina unei aplicații, în cardul **Notificări**, care
avertizează și când incidentele unei aplicații nu ajung la niciun canal.

## Escaladare

Dați unui canal o întârziere (**Escaladează: neconfirmat după 15 min**) și devine un pas de
escaladare: e notificat doar dacă, după acel timp, incidentul este încă deschis, neconfirmat și
neamuțit, iar apoi primește confirmarea și rezolvarea lui. Înlănțuiți mai multe: Teams imediat → SMS
pentru persoana de gardă după 15 minute → manager după 60 de minute.

## Livrare

Mesajele trec printr-o coadă de ieșire cu reîncercări (după 1, 5 și 15 minute) și o limită pe canal,
ca o avalanșă de incidente să nu ducă la blocarea botului sau a releului de e-mail.

## Conținutul webhook-ului

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Setați un **secret de semnare** pentru a primi `X-Fudo-Signature: sha256=<HMAC al corpului>`.
Conținutul rămâne în engleză (este un format stabil pentru integrări); `incident.titleParts` conține
titlul sub formă de coduri de mesaj, dacă doriți să-l traduceți singuri.

## Gărzi

Echipele alertează persoane pentru incidentele elementelor pe care le dețin. În **Echipe › Gardă**,
puneți membrii în ordinea rotației, alegeți durata gărzii (o zi, o săptămână, două săptămâni sau un număr
de zile), ora predării și fusul orar, precum și incidentele pentru care se alertează. Pașii de
**escaladare** spun cine este alertat și când, de la deschiderea incidentului: de exemplu persoana de
gardă imediat, următoarea după 15 minute și coordonatorii după 30. **Înlocuirile** permit altcuiva să
acopere o perioadă, cum ar fi un schimb sau un concediu.

Fiecare persoană este contactată prin propriii pași de notificare (vedeți *Profilul dvs.*) sau prin
e-mail la adresa de conectare, dacă nu are. Alertele se opresc imediat ce cineva confirmă incidentul și
sunt suspendate cât timp este amuțit. Pagina incidentului arată cine a fost alertat și ce s-a trimis;
profilul dvs. arată gărzile următoare.

Mesajele de gardă conțin linkurile **Confirmă** și **Deschide în Fudo** (setați `PUBLIC_URL`). Confirmă deschide o pagină unde o atingere confirmă incidentul în numele dvs., fără conectare; simpla deschidere a linkului nu schimbă nimic, astfel că previzualizările de linkuri și scanerele de e-mail nu pot confirma din greșeală. Fiecare link funcționează o dată, timp de 24 de ore, cât timp incidentul este deschis, și doar dacă rolul dvs. permite confirmarea incidentelor.
