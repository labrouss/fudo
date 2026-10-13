<!-- translation-of: settings.md#401e7e53 -->
# Instellingen

**Instellingen** (onderaan de zijbalk) bevat uw persoonlijke voorkeuren, voor iedereen, en de
systeeminstellingen, voor superadmins.

Elk onderdeel is een tabblad. Het adres onthoudt het geopende tabblad (bijvoorbeeld `/settings#retention`), zodat u een tabblad als bladwijzer kunt bewaren of als link kunt versturen.

## Uw voorkeuren

- **Taal van de interface**: 13 talen, waaronder Arabisch met een opmaak van rechts naar links.
  Opgeslagen in uw profiel, zodat ze u in elke browser volgt. Ook incidenttitels en
  controleresultaten worden vertaald.
- **Thema**: **Systeem** (volgt de lichte of donkere modus van uw besturingssysteem), **Licht**,
  **Donker**, **Monokai**, plus elk thema dat uw beheerder toevoegt.

## Systeeminstellingen (superadmins)

### Taal van meldingen

**Standaardtaal** van meldingen en geplande rapporten. Elk kanaal en elke planning kan een eigen taal
gebruiken; e-mails aan een persoon (uitnodigingen, herstel) gebruiken diens taal. De interface
verandert er niet door: die kiest ieder zelf onder *Voorkeuren*.

### E-mail (SMTP)

Gebruikt voor uitnodigingen, e-mailmeldingen en geplande rapporten.

| Veld | Opmerkingen |
|---|---|
| SMTP-host, poort | 587 (STARTTLS) of 465 (*TLS vanaf het begin gebruiken*); 25 voor een interne relay |
| Gebruikersnaam, wachtwoord | optioneel; het wachtwoord wordt versleuteld opgeslagen en nooit meer getoond |
| Afzenderadres | bv. `fudo@corp.local` |
| **Zelfondertekende certificaten accepteren** | voor een lokale relay met een zelfondertekend of intern certificaat: de verbinding blijft versleuteld, alleen de certificaatcontrole vervalt |

**Test-e-mail versturen** noemt de precieze reden als er iets misgaat: een niet-vertrouwd
certificaat, een verkeerd wachtwoord, een onbereikbare server of een TLS-modus die niet bij de poort
past.

## Voor beheerders

Nieuwe talen en thema's voegt u toe door bestanden in mappen te zetten, zonder opnieuw te bouwen; zie
`locales/README.md` en `themes/README.md` in de repository.

## Bewaren van gegevens

**Instellingen › Bewaren van gegevens** (superadmins) bepaalt hoe lang elk soort gegevens wordt bewaard en toont de gebruikte ruimte: ruwe controleresultaten, uur- en dagoverzichten, statusgeschiedenis, opgeloste incidenten, het meldingenlogboek, het auditlogboek en afgeronde onderhoudsvensters. Oude gegevens worden elk uur in kleine delen verwijderd. Minimumwaarden beschermen wat Fudo toont (grafieken over 90 dagen, beschikbaarheidsrapporten, statuspagina’s), en de laatste statuswijziging vóór de grens blijft altijd bewaard, zodat de beschikbaarheid exact blijft. Open incidenten en meldingen die nog verstuurd moeten worden, worden nooit verwijderd.
