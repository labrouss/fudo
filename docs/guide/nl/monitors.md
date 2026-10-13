<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitors

## De lijst

De monitorlijst toont het **asset** van elke monitor en de **applicaties** waartoe hij behoort (een optioneel lidmaatschap heeft een gestippelde rand); beide zijn links. Klik op een kolomkop om te sorteren (nogmaals voor omgekeerd, een derde keer voor de standaardvolgorde); Fudo onthoudt de sortering in deze browser. Het filter zoekt in namen, doelen, tags, assets en applicaties; het negeert hoofdletters en accenten, en elk woord moet overeenkomen. De andere lange lijsten (assets, incidenten, gebruikers, onderhoud, kanalen en meer) sorteren en filteren op dezelfde manier.

## Monitortypes

| Categorie | Type | Controleert |
|---|---|---|
| Web | **HTTP(S)** | bereiken van statuscodes, trefwoord aanwezig/afwezig, JSON-waarde (`$.status`), headers, body, responstijd |
| | **TLS-certificaat** | vertrouwen, hostnaam, dagen tot verlopen (Verminderd binnen N dagen, Uitgevallen na verlopen) |
| Netwerk | **Ping** | bereikbaarheid, latentie, pakketverlies |
| | **TCP-poort** | de poort accepteert verbindingen |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, optioneel verwacht antwoord, gekozen resolver |
| | **SNMP** | leest een OID (v1, v2c, v3) en vergelijkt de waarde of, bij tellers, de verandering per seconde |
| | **Netwerkinterface (SNMP)** | een poort van een switch, router of firewall: linkstatus, verkeer in en uit (bit/s en % van de linksnelheid), fouten; in een grafiek over tijd |
| | **NTP** | bereikbaarheid, stratum, klokafwijking |
| | **SMTP** | 220-begroeting, EHLO, optioneel STARTTLS |
| | **LDAP / Active Directory** | de directory antwoordt (Active Directory: verminderd zolang de domeincontroller niet gesynchroniseerd is), of een account meldt zich aan en een zoekopdracht vindt vermeldingen; noemt vergrendelde, verlopen en uitgeschakelde accounts |
| | **Verloop van domein** | verloop van de registratie via RDAP (met WHOIS als terugval) |
| Databases | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | maakt verbinding, optionele query met verwacht resultaat |
| Systemen | **SSH-opdracht** | exitcode of uitvoer (bevat, exact, regex), optioneel vastleggen van de hostsleutel |
| | **Docker-container** | draait, en is gezond als hij een healthcheck heeft |
| Infrastructuur | **vCenter-VM** | voedingsstatus, VMware Tools (vCenter 6.7, 7, 8) |
| | **Status HPE iLO / Redfish** | hardwarestatus van de server via de BMC (iLO 4/5/6, iDRAC, andere Redfish-BMC's) |
| | **Inlaattemperatuur (iLO / Redfish)** | temperatuur van de lucht die de server binnenkomt, dus vóór het rack: verminderd vanaf 27 °C, storing vanaf 32 °C (ASHRAE), met grafiek |
| | **Ruimtetemperatuur** | alle inlaatsensoren met de tag `room:<name>` samen: storing als er meerdere warm zijn (koelprobleem), verminderd als er één warm is of meerdere snel stijgen |
| Passief | **Push-heartbeat** | een taak roept een URL aan; Uitgevallen als de aanroepen stoppen |
| | **SNMP-traps** | traps die een apparaat stuurt (v1, v2c): uitgevallen of verminderd zolang er een probleemtrap open is; verdwijnt vanzelf, door een beëindigende trap of met de hand |

**Nu testen** voert een controle één keer uit vanaf de Fudo-server zonder op te slaan, zodat u hem
kunt afstellen voordat hij meldingen geeft.

## Valse alarmen voorkomen

- **Uitgevallen na N fouten**: een monitor wordt pas Uitgevallen na N mislukte controles op rij, en
  controleert in de tussentijd op het snellere *herhaalinterval*.
- **Beschikbaar na M successen**: hij herstelt pas na M geslaagde controles op rij.
- **Verminderd boven**: trage antwoorden tellen als Verminderd in plaats van Uitgevallen.

## Inloggegevens

Wachtwoorden, SNMP-community's, SSH-sleutels en dergelijke worden **versleuteld** opgeslagen en
nooit meer getoond, geëxporteerd of door de API teruggegeven; alleen de worker ontsleutelt ze om een
controle uit te voeren. Gebruik accounts met alleen leesrechten: een vCenter-rol *Read-only*, een
iLO-gebruiker met het recht *Login*, een databasegebruiker met alleen `CONNECT`/`SELECT`.

### Gedeelde inloggegevens

Als veel monitors met hetzelfde account inloggen (één iLO-gebruiker met alleen leesrechten voor
alle servers, één SNMP-community voor de switches), bewaar het dan één keer onder
**Inloggegevens** en laat de monitors het gebruiken. Verandert het wachtwoord, bewerk de
inloggegevens dan één keer: elke monitor die ze gebruikt controleert meteen opnieuw met de nieuwe
waarde.

- Inloggegevens hebben een soort: *Account en wachtwoord*, *SSH-sleutel*, *SNMP-community (v1,
  v2c)* of *SNMPv3-gebruiker*. In het monitorformulier bieden typen die inloggen **Hier invullen**
  of **Gedeelde inloggegevens gebruiken**; met inloggegevens verdwijnen de accountvelden uit het
  formulier.
- Inloggegevens horen bij één bereik: de monitors van een tenant kunnen alleen de inloggegevens van
  die tenant gebruiken, en monitors van het globale infrastructuurbereik alleen globale.
- Geheimen zijn alleen-schrijven, net als die van een monitor: versleuteld opgeslagen, nooit
  getoond, geëxporteerd of teruggegeven. De lijst toont het account en welke monitors het
  gebruiken.
- **Hetzelfde account in meerdere monitors**: de pagina toont monitors die al hetzelfde account en
  wachtwoord bewaren. Geef de groep een naam en kies **Gedeelde inloggegevens maken**: het
  wachtwoord wordt op de server gekopieerd, niemand hoeft het te kennen.
- **Gebruiken voor…** koppelt meer monitors aan inloggegevens; hun eigen account en wachtwoord
  worden verwijderd. Inloggegevens die in gebruik zijn, kunnen niet worden verwijderd en hun soort
  kan niet veranderen.
- Een monitor die geen inloggegevens meer gebruikt, heeft weer een eigen wachtwoord nodig.
- In [configuratie als code](configuration-as-code.md) noemt een monitor zijn inloggegevens
  (`credential: iLO read-only`); de inloggegevens zelf maakt u in de interface aan. Ook het in bulk
  toevoegen van temperatuurcontroles kan ze gebruiken.
- Elke wijziging staat in het auditlogboek, met de namen van de gewijzigde geheimen, nooit hun
  waarden.

## Push-monitors

Een push-monitor wacht tot uw taak hem aanroept. Na het opslaan toont zijn pagina de URL:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Hij wordt Uitgevallen als er binnen het interval plus de wachttijd geen aanroep binnenkomt.
**Nieuwe URL** vervangt het token als het is uitgelekt.

## Bulk toevoegen en sjablonen

**Monitors › Bulk toevoegen / sjablonen** maakt controles voor veel hosts tegelijk:

1. plak één host of URL per regel (of laad een CSV met `name,host,port`),
2. kies een **sjabloon**, bijvoorbeeld *Windows-server* (ping, RDP, WinRM), *Linux-server*,
   *HPE iLO*, *netwerkapparaat*, *ESXi-host*, *vCenter*, *SQL Server*, *opslagsysteem* of
   *webapplicatie*, of één enkel controletype,
3. maak eventueel per regel een asset aan, laat ze afhangen van een bestaand asset en voeg ze toe
   aan een applicatie.

Voor het toepassen toont het een voorbeeld van alles wat wordt aangemaakt.

## Opmerkingen per type

- **vCenter-VM** vindt zelf de juiste API-versie en hergebruikt sessies (één aanmelding per vCenter
  per 20 minuten). De controle van VMware Tools vereist vCenter 7.0 of nieuwer.
- **HPE iLO / Redfish** noemt bij HPE iLO het defecte onderdeel (ventilatoren, voedingen, opslag,
  redundantie). Warning → Verminderd, Critical of uitgeschakeld → Uitgevallen.
- **SSH-opdracht**: stel de *Vingerafdruk hostsleutel* in (`ssh-keyscan host | ssh-keygen -lf -`),
  zodat een gewijzigde serversleutel wordt gemeld in plaats van geaccepteerd.
- **Docker-container** gebruikt de lokale Docker-socket (koppel hem in de worker-container, zie
  `docker-compose.yml`) of de URL van een externe Docker-API.
- **Verloop van domein**: sommige nationale registers publiceren RDAP noch WHOIS; Fudo meldt dat als
  Verminderd, met uitleg.
- **Ping** heeft de capability `NET_RAW` nodig in de worker-container, en in de API-container voor
  **Nu testen** (beide ingesteld in `docker-compose.yml`).

## SNMP-traps

Stuur de SNMP-traps (v1 of v2c) van uw apparaten naar de Fudo-server, UDP-poort 162. De pagina
**Traps** toont of er traps binnenkomen, en elke trap met zijn velden.

- Een monitor **SNMP-traps** neemt de traps van de apparaten onder **Van**: adressen, hostnamen of
  IPv4-bereiken (`10.0.12.0/24`). Met een **Community** (of gedeelde inloggegevens van het type
  SNMP-community) neemt hij alleen traps die haar dragen; de community wordt nooit opgeslagen.
- **Probleemtraps**: de standaardtraps (link down, koude en warme start, authenticatiefout),
  alleen vermelde traps (namen of OID's; een OID omvat ook alles eronder, bijv. het
  enterprise-prefix van een fabrikant) of elke trap. *Alleen als een veld bevat* beperkt het tot
  traps met een tekst als `Critical`.
- Zolang een probleem open is, is de monitor **Uitgevallen** (of Verminderd, als u dat kiest);
  incident, meldingen en piketdienst werken zoals bij elke controle, binnen een seconde na de
  trap.
- Problemen worden per trap en interface bijgehouden: link down op twee poorten zijn twee
  problemen, en de **link up** van één poort beëindigt alleen het probleem van die poort.
- **Problemen verdwijnen** automatisch als er een tijd geen nieuwe trap komt (standaard 30
  minuten), of alleen met de hand: de monitorpagina toont de open traps met **Wissen** (tot de
  volgende passende trap). *Beëindigende traps* beëindigen ook problemen, bijv. de trap
  ‘toestand opgelost’ van een fabrikant.
- Een trap die **geen monitor neemt**, wordt toch bewaard: bij de tenant van het asset met dat
  adres, anders in het globale infrastructuurbereik. **Monitor maken** op de pagina Traps vult
  een monitor in voor zijn apparaat.
- Een apparaat dat traps overspoelt, wordt beperkt (50 per seconde, pieken tot 500); genegeerde
  traps worden geteld op de pagina Traps van het globale bereik. Traps worden 30 dagen bewaard
  (Instellingen › Gegevensbewaring).

## Netwerkinterfaces

Een monitor **Netwerkinterface (SNMP)** bewaakt één poort van een switch, router of firewall.

- **Interfaces zoeken…** (na de host en SNMP-toegang, of gedeelde inloggegevens) toont de
  interfaces van het apparaat met beschrijving, snelheid en status. Kies er een, of vink bij het
  toevoegen meerdere aan: elk wordt een monitor met de instellingen van het formulier, genoemd naar
  de interface.
- De interface wordt onthouden op **naam** (of beschrijving of alias), niet op nummer, omdat
  sommige apparaten hun interfaces na een herstart hernummeren. Een nummer werkt ook.
- **Verkeer** is het verschil tussen twee metingen van de 64-bits tellers: de eerste controle meet
  twee keer, twee seconden na elkaar; latere controles gebruiken de bewaarde meting van de vorige
  controle. Na een herstart van het apparaat wordt het paar overgeslagen, dus geen valse piek.
  Apparaten zonder 64-bits tellers (SNMP v1) gebruiken 32-bits tellers, die boven ongeveer
  100 Mbit/s met een interval van een minuut niet betrouwbaar zijn.
- **Status**: link down → Uitgevallen; testing of dormant → Verminderd; een bewust uitgeschakelde
  poort is Beschikbaar (of Uitgevallen, als u dat kiest). De drukste richting boven *Verminderd
  vanaf benutting* (standaard 80 %) → Verminderd, boven *Uitgevallen vanaf benutting* (standaard
  uit) → Uitgevallen; fouten per minuut boven de grens → Verminderd. Meldt het apparaat een verkeerde
  snelheid (een tunnel, een verbinding met snelheidslimiet), vul dan *Linksnelheid* in.
- De monitorpagina toont het verkeer in en uit met de lijn voor Verminderd.
- *Vergelijken: de verandering per seconde* van de **SNMP**-monitor doet hetzelfde voor elke
  teller (frames op een SAN-poort, firewallsessies, UPS-gebeurtenissen).

## Datacentertemperatuur

**Temperatuur** toont elke inlaattemperatuursensor, gegroepeerd op zijn tag `room:<name>` en gesorteerd van warm naar koud, met zijn rack (`rack:<name>`), de huidige waarde, de laatste 6 uur, de verandering over 15 minuten en het bereik over 24 uur. **Sensoren toevoegen** maakt ze aan voor een lijst iLO-adressen (of andere Redfish-BMC’s) met één gedeeld alleen-lezen-account.

Een sensor wordt ook verminderd als zijn temperatuur **snel stijgt** (standaard 3 °C binnen 15 minuten), zelfs onder de drempels: het eerste teken van een koelingsstoring. **Ruimtewaarschuwing maken** voegt voor de ruimte een monitor *Ruimtetemperatuur* toe: storing als 3 sensoren warm zijn, verminderd als er één warm is of 2 snel stijgen. Hij opent incidenten zoals elke monitor, dus eigenaarschap, diensten en statuspagina’s werken er ook voor.
