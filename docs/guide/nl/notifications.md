<!-- translation-of: notifications.md#5487cd95 -->
# Meldingen

## Kanalen

**Meldingen › Kanaal toevoegen**. Ingebouwd: **E-mail** (vereist de SMTP-server uit Instellingen),
**Microsoft Teams** (Workflows-webhook), **Slack** (incoming webhook) en **Webhook (JSON)**. Meer
dan 100 andere (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal, Twilio en andere
sms-gateways, Mattermost, Matrix, Google Chat, …) komen van de meldingsproviders van Uptime Kuma.
**Test versturen** controleert een kanaal; het **Logboek** toont elke verzending en waarom een kanaal
werd overgeslagen.

Chatberichten beginnen met **[Fudo]**, zodat u ze makkelijk onderscheidt van andere tools die in
dezelfde chat posten.

## Welke incidenten een kanaal ontvangt

| Instelling | Effect |
|---|---|
| **Versturen** | *Alle incidenten van deze tenant* (standaard) of *Alleen incidenten van geselecteerde applicaties* |
| **Minimale ernst** | Laag en hoger (alle), Hoog en Kritiek, of alleen Kritiek |
| **Gebeurtenissen** | geopend, bevestigd, opgelost |
| **Incidenten overslaan die door een ander incident zijn veroorzaakt** | alleen hoofdoorzaken, niet de daaraan gekoppelde getroffen incidenten |
| **Herinneren zolang niet bevestigd** | elke N minuten herhalen zolang niemand bevestigt |
| **Taal van berichten** | de taal van het kanaal; standaard die van de organisatie (Instellingen) |

Kanalen van een tenant ontvangen de incidenten van die tenant, ook die door gedeelde infrastructuur
zijn veroorzaakt (met de hoofdoorzaak in het bericht). Globale kanalen ontvangen
infrastructuurincidenten; met **alle tenants** (een NOC-kanaal) ontvangen ze ook de incidenten van
elke tenant, behalve die veroorzaakt door een infrastructuurincident dat ze al hebben ontvangen.

**Per applicatie:** een kanaal met *Alleen incidenten van geselecteerde applicaties* hoort alleen
over die applicaties. Kies ze in het kanaalformulier, of op de pagina van een applicatie in de kaart
**Meldingen**, die ook waarschuwt als de incidenten van een applicatie geen enkel kanaal bereiken.

## Escalatie

Geef een kanaal een vertraging (**Escaleren: niet bevestigd na 15 min**) en het wordt een
escalatiestap: het krijgt alleen een melding als het incident na die tijd nog open, onbevestigd en
niet gedempt is, en ontvangt daarna de bevestiging en de oplossing. Koppel er meerdere: Teams direct
→ sms van de dienstdoende na 15 minuten → leidinggevende na 60 minuten.

## Bezorging

Berichten gaan via een wachtrij met nieuwe pogingen (na 1, 5 en 15 minuten) en een limiet per
kanaal, zodat een stortvloed aan incidenten uw bot of mailrelay niet laat blokkeren.

## Inhoud van de webhook

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Stel een **ondertekeningsgeheim** in om `X-Fudo-Signature: sha256=<HMAC van de body>` te ontvangen.
De inhoud blijft Engels (een stabiel formaat voor koppelingen); `incident.titleParts` bevat de titel
als berichtcodes, mocht u hem zelf willen vertalen.

## Diensten

Teams waarschuwen mensen bij incidenten van hun onderdelen. Zet onder **Teams › Dienst** de leden in de
volgorde van het rooster, kies de lengte van een dienst (één dag, één week, twee weken of een aantal
dagen), de overdrachtstijd en tijdzone, en voor welke incidenten wordt gewaarschuwd.
**Escalatiestappen** bepalen wie wanneer wordt gewaarschuwd, gerekend vanaf het openen van het incident:
bijvoorbeeld direct de persoon met dienst, na 15 minuten de volgende en na 30 de teamleiders.
**Vervangingen** laten iemand anders een periode overnemen, zoals bij ruilen of vakantie.

Iedereen wordt bereikt via de eigen meldingsstappen (zie *Uw profiel*), of per e-mail op het
aanmeldadres als die er niet zijn. De waarschuwingen stoppen zodra iemand het incident bevestigt en
pauzeren zolang het gedempt is. De incidentpagina toont wie is gewaarschuwd en wat is verstuurd; uw
profiel toont uw komende diensten.

Dienstberichten bevatten de links **Bevestigen** en **Openen in Fudo** (stel `PUBLIC_URL` in). Bevestigen opent een pagina waar één tik het incident namens u bevestigt, zonder aan te melden; alleen de link openen verandert niets, dus linkvoorbeelden en e-mailscanners kunnen niet per ongeluk bevestigen. Elke link werkt één keer, 24 uur lang, zolang het incident open is, en alleen als uw rol incidenten mag bevestigen.
