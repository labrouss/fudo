<!-- translation-of: concepts.md#61c26734 -->
# Concepten

## Bereiken: tenants en globale infrastructuur

| Bereik | Bevat | Beheerd door |
|---|---|---|
| **Tenant** (één per bedrijfsonderdeel) | zijn applicaties, monitors, assets, kanalen en rapporten | tenantbeheerders |
| **Globale infrastructuur** | gedeelde assets (switches, opslagsystemen, FC-fabrics, clusters) en hun monitors | infrastructuurbeheerders en superadmins |

Kies het bereik in de keuzelijst bovenaan de zijbalk. Tenants zien de gedeelde infrastructuur alleen
lezend en koppelen er hun eigen monitors en applicaties aan, zodat een opslagstoring als oorzaak
verschijnt bij elke applicatie die die opslag nodig heeft.

## Bouwstenen

| Onderdeel | Wat het is | Voorbeeld |
|---|---|---|
| **Monitor** | een controle die regelmatig draait | HTTPS op `erp.corp.local/health` |
| **Asset** | een stuk infrastructuur, gecontroleerd door zijn monitors | `Core-SW-01`, `SAN-A` |
| **Applicatie** | een bedrijfsdienst: monitors (leden) plus de infrastructuur die hij nodig heeft | *ERP Production* |
| **Afhankelijkheid** | 'dit heeft dat nodig': asset → asset, applicatie → asset | ESXi-cluster → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Op een asset zet **Bestaande toevoegen** monitors die u al hebt erop (een monitor die op een andere asset staat, verhuist) en opent **Nieuwe monitor** het monitorformulier ervoor. Een tenant kan ook zijn eigen monitors op een gedeelde globale asset zetten; **Verwijderen** haalt een monitor van de asset en houdt hem.

## Statussen

| Status | Betekenis |
|---|---|
| **Beschikbaar** | werkt |
| **Verminderd** | werkt, maar traag of gedeeltelijk (bv. een optioneel lid is uitgevallen) |
| **Uitgevallen** | faalt, en niets waarvan het afhangt verklaart dat: het is een **hoofdoorzaak** |
| **Getroffen** | faalt **omdat** iets waarvan het afhangt is uitgevallen; meldingen wijzen naar de hoofdoorzaak |
| **Risico** | werkt, maar iets waarvan het afhangt heeft een probleem |
| **Onderhoud** | in een gepland onderhoudsvenster: telt niet mee voor de beschikbaarheid |
| **In afwachting** | nog geen resultaat |

## Hoe Fudo de hoofdoorzaak vindt

| Situatie | Resultaat |
|---|---|
| De controles van een asset falen en niets waarvan het afhangt is uitgevallen | **Uitgevallen**: hoofdoorzaak, met een eigen incident |
| Zijn controles falen **en** iets waarvan het afhangt is uitgevallen | **Getroffen door** die hoofdoorzaak: geen stortvloed aan meldingen |
| Zijn controles slagen, maar iets waarvan het afhangt is uitgevallen | houdt zijn status, gemarkeerd als **Risico** |
| Iets waarvan het afhangt is in gepland onderhoud | **Getroffen door onderhoud** (gepland, telt niet mee voor de beschikbaarheid) |

Een applicatie is gezond als haar leden dat zijn, volgens haar regel: **alle verplichte leden
beschikbaar**, **minstens één** of **minstens N van M** (voor redundante diensten). Verplichte leden
bepalen de status; optionele kunnen haar alleen *Verminderd* maken.

**Wat als dit uitvalt?** bij een asset voorspelt welke applicaties zouden uitvallen, en welke dankzij
redundantie blijven werken, voordat u het voor werkzaamheden uitschakelt.

De pagina **Topologie** tekent het geheel met live status: beweeg over een onderdeel om zijn
afhankelijkheden te volgen; *Alleen problemen* toont wat faalt en wat daarvan afhangt.
