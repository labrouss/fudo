<!-- translation-of: incidents.md#4e781264 -->
# Incidenten

Fudo opent zelf incidenten als er iets uitvalt en lost ze op als het herstelt.

## Wanneer een incident wordt geopend

| Onderdeel | Opent een incident als | Ernst |
|---|---|---|
| **Applicatie** | Uitgevallen, of Getroffen door een niet-geplande oorzaak | volgens haar kriticiteit: kritiek → Kritiek, hoog → Hoog, overige → Laag |
| **Asset** | Uitgevallen (het is een hoofdoorzaak) | Hoog |
| **Monitor** | Uitgevallen, en geen deel van een asset of applicatie | Laag |

Een **getroffen** incident is gekoppeld aan het incident van zijn hoofdoorzaak (*Veroorzaakt door
INC-…*): een uitgevallen switch geeft één hoofdincident met duidelijk gekoppelde getroffen
incidenten, geen stortvloed aan meldingen.

## Levensloop van een incident

1. Wordt automatisch **geopend** en meldingen gaan de deur uit (zie [Meldingen](notifications.md)).
2. **Bevestigen** laat zien dat iemand ermee bezig is; herinneringen en escalaties stoppen.
3. **Dempen** zet meldingen een tijdje stil (30 minuten tot 1 dag) zonder te bevestigen.
4. Wordt automatisch **opgelost** als het onderdeel herstelt. Valt het binnen 5 minuten opnieuw uit,
   dan wordt hetzelfde incident **heropend** in plaats van een nieuw. U kunt het ook met de hand
   oplossen.

De **tijdlijn** legt elke stap vast: statuswijzigingen, meldingen, bevestigingen en notities.

## Notities: deel wat u leerde

Voeg notities toe aan de tijdlijn als **Opmerking**, **Uitgevoerde actie** of **Oplossing**, met
tags (bv. `supervisor`, `firmware`).

Oplossingen worden hergebruikt: gebeurt er later een vergelijkbaar incident (zelfde onderdeel,
zelfde hoofdoorzaak, gedeelde tags of vergelijkbare tekst), dan toont **Vergelijkbare eerdere
incidenten** wat hielp, en de meldingen ervan citeren het: *'Vorige keer (INC-0041, 12 aug 2026) is
dit zo opgelost: …'*.

## Incidenten vinden

**Incidenten** toont de **open** incidenten van het bereik dat in de zijbalk is gekozen; ga naar
*Opgelost* voor de geschiedenis en zoek op titel, INC-nummer of tag. Incidenten van een andere tenant
verschijnen als u naar die tenant overschakelt (zie [Problemen oplossen](troubleshooting.md)).

## Rapporten na incidenten

**Rapport na incident** bij een incident downloadt een rapport als **PDF** of **Markdown** (voor een wiki of een ticket): een samenvatting met de tijden en wie bevestigde en oploste, de getroffen incidenten, de oplossing en uitgevoerde acties, de tijdlijn, de verstuurde meldingen en vergelijkbare eerdere incidenten. Het gebruikt uw taal en tijdzone, en kan ook worden gemaakt terwijl het incident nog open is.
