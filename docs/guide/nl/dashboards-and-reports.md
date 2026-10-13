<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Dashboards en rapporten

## Overzicht

Open incidenten, gemiddelde hersteltijd (MTTR, 30 dagen), beschikbare en falende monitors,
applicaties binnen hun SLA-doel en per applicatie een kaart met de beschikbaarheidsstrook van 30
dagen. De pagina's werken live bij (ongeveer een seconde na een wijziging); de zijbalk toont
**Live** zolang er verbinding is.

De **beschikbaarheid** komt uit de statusgeschiedenis: uitgevallen en getroffen tijd telt mee;
gepland onderhoud en de tijd vóór de eerste controle niet.

## Grafieken

Elke monitor toont zijn responstijd over 1 u, 6 u, 24 u, 7, 30 en 90 dagen (gemiddelde, p95, fouten,
onderhoud), zijn laatste controles als hartslagstrook, zijn statuswijzigingen en zijn recente
resultaten.

## Rapporten

**Rapporten** toont per applicatie (of per gedeeld asset in het bereik Globale infrastructuur):
beschikbaarheid 24/7 en tijdens **kantooruren**, uitvaltijd, gepland onderhoud, incidenten, SLA
gehaald of niet, MTTA (tijd tot bevestiging) en MTTR (tijd tot oplossing). Kies vorige week, vorige
maand, de laatste 30 dagen of eigen data, en download het als:

- **PDF**: in uw taal; Arabische rapporten worden van rechts naar links opgemaakt,
- **CSV**: beschikbaarheid en incidenten, UTF-8 voor Excel, met Engelse kolomnamen zodat
  spreadsheets en scripts blijven werken.

## Geplande rapporten

**Rapporten › Nieuwe planning** mailt de PDF en/of CSV elke maandag (vorige week) of op de 1e (vorige
maand) op het gekozen uur en in de gekozen tijdzone, in de taal van de planning, via de SMTP-server
uit Instellingen. **Nu versturen** stuurt direct de laatste periode.

## Statuspagina’s

**Statuspagina’s › Nieuwe statuspagina** toont gekozen applicaties, assets en monitors op een
eigen pagina op `/status/<adres>`, met de algehele status, 90 dagen beschikbaarheid, huidige
incidenten en onderhoud. Elk onderdeel krijgt een **weergavenaam**, die in plaats van de interne naam
verschijnt; onderdelen uit dezelfde groep staan bij elkaar. Pagina’s van een tenant kunnen ook
gedeelde infrastructuur bevatten.

- **Openbaar**: iedereen met de link, zonder aan te melden. De pagina toont alleen weergavenamen en
  eenvoudige statussen (*Beschikbaar, Verminderd, Storing, Onderhoud*), nooit interne namen,
  oorzaken, incidenttitels of namen van onderhoud.
- **Intern**: aangemelde gebruikers met toegang tot de tenant, die ook incidenttitels en namen van
  onderhoud zien.

De pagina ververst elke minuut en gebruikt de taal en de lichte of donkere modus van de bezoeker.
