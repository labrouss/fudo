<!-- translation-of: maintenance.md#f097f823 -->
# Onderhoudsvensters

Plan werkzaamheden zo dat niemand wordt gealarmeerd en ze niet meetellen voor de beschikbaarheid.

**Onderhoud › Onderhoud plannen**: geef een titel, begin en einde, notities (wijzigingsverzoek,
contactpersoon, terugvalplan) en wat het **omvat**: assets (met hun controles) en monitors.

Tijdens het venster:

- blijven de controles draaien, zodat u ziet wat er gebeurt,
- tellen de resultaten **niet mee voor de beschikbaarheid** en de SLA,
- worden **meldingen onderdrukt**,
- tonen onderdelen die afhangen van iets in onderhoud dat als oorzaak (*Getroffen door onderhoud*),
  zodat niemand achter een geplande onderbreking aan gaat.

**Nu beëindigen** sluit een venster eerder af. Vensters verschijnen als *Gepland*, *Bezig* of
*Voltooid*.

Tip: gebruik eerst **Wat als dit uitvalt?** bij het asset om te zien welke applicaties het werk
raakt.

## Terugkerend onderhoud

Kies bij het plannen **Herhalen**: elke dag, elke week op gekozen dagen, of elke maand, op een dag van
de maand (dag 31 valt in kortere maanden op de laatste dag) of op een weekdag van een week (*dinsdag
van de tweede week* is Microsofts Patch Tuesday). Tijden gelden in de gekozen tijdzone, dus 02:00
blijft ook na de overgang naar zomer- of wintertijd 02:00; een eindtijd vóór het begin betekent de
volgende dag.

Fudo maakt de vensters van de komende 60 dagen, gemarkeerd met **Herhaalt**. **Overslaan** haalt één
keer weg, en een venster bewerken wijzigt alleen die keer. De reeks bewerken wijzigt de toekomstige
vensters; verwijderen haalt ze weg, voorbije en lopende vensters blijven.
