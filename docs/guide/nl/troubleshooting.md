<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Problemen oplossen

### Ik kreeg een melding, maar de lijst met incidenten is leeg

- **Andere tenant**: de lijst toont het bereik dat in de zijbalk is gekozen. Een kanaal met *alle
  tenants* ontvangt de incidenten van elke tenant; schakel over naar een andere tenant om ze te zien.
- **Al opgelost**: korte storingen openen en sluiten een incident binnen enkele minuten; kijk onder
  *Opgelost*.
- **Niet van Fudo**: chatberichten van Fudo beginnen met **[Fudo]** en bevatten nooit ruwe
  foutcodes zoals `EHOSTUNREACH`. Post een andere monitoringtool (bijvoorbeeld Uptime Kuma) nog in
  dezelfde chat, dan kwam de melding daarvandaan. Het **Logboek** van het kanaal toont alles wat Fudo
  heeft verstuurd.

### Een monitor faalt met 'Host onbereikbaar' of 'Time-out'

De controle draait vanuit de **worker**-container van Fudo, niet vanaf uw pc. Zorg dat de host van de
worker het doel bereikt (routering, firewalls). Voor ping hebben de containers de capability
`NET_RAW` nodig (ingesteld in `docker-compose.yml`).

### 'Het certificaat van de SMTP-server wordt niet vertrouwd'

Uw mailrelay gebruikt een zelfondertekend of intern certificaat. Schakel **Zelfondertekende
certificaten accepteren** in onder Instellingen › E-mail (SMTP).

### Alles achter een switch werd tegelijk rood

Dat is te verwachten, en Fudo vangt het op: de switch is **Uitgevallen** (hoofdoorzaak) en wat
erachter zit is **Getroffen**. U krijgt één hoofdincident met de andere eraan gekoppeld. Zorg dat de
afhankelijkheden zijn vastgelegd (het asset *hangt af van* de switch), zodat Fudo dat weet.

### Een geplande wijziging alarmeerde de dienstdoende

Maak vooraf een [onderhoudsvenster](maintenance.md) voor de betrokken assets: de controles gaan door,
maar meldingen worden onderdrukt en de tijd telt niet mee voor de beschikbaarheid.

### De incidenten van een applicatie bereiken niemand

Open de applicatie: haar kaart **Meldingen** waarschuwt als geen enkel kanaal haar incidenten
ontvangt (bijvoorbeeld als elk kanaal op *Alleen incidenten van geselecteerde applicaties* staat,
zonder haar).

### De pagina toont 'Opnieuw verbinden met live-updates'

De browser verloor de verbinding met de API; de pagina's werken vanzelf weer bij zodra die terug is.
Blijft het zo, controleer dan of een proxy vóór Fudo langdurige verbindingen (Server-Sent Events)
naar `/api/live` toestaat.

### Ik ben mijn telefoon kwijt

Meld u aan met een herstelcode, of vraag een beheerder om **2FA opnieuw in te stellen** voor uw
account.
