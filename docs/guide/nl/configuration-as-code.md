<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Configuratie als code

**Configuratie** exporteert het huidige bereik (assets, monitors, applicaties en hun
afhankelijkheden) als YAML en importeert het weer. Bewaar het in git, kopieer de inrichting van een
tenant naar een andere, of automatiseer het via de API.

```yaml
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    dependsOn: [Core-SW-01]          # shared assets are referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    asset: FIN-APPLIANCE-01          # the asset this monitor checks
    tags: [prod]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web, { monitor: ERP SQL, required: false }]
    notify: [ERP team]               # notification channels, by name
```

## Zo werkt importeren

- **Eerst een voorbeeld**: het toont veld voor veld wat wordt aangemaakt of gewijzigd en meldt
  fouten met hun regelnummer. **Toepassen** gebeurt helemaal of helemaal niet.
- **Gedeeltelijke bestanden zijn veilig**: een onderdeel in het bestand bepaalt dat onderdeel;
  onderdelen die niet in het bestand staan, blijven zoals ze zijn.
- **Niet inbegrepen**: meldingskanalen en inloggegevens (die bevatten geheimen) en
  onderhoudsvensters. Geïmporteerde push-monitors krijgen nieuwe URL's. Applicaties noemen hun
  kanalen bij naam in `notify`; zonder `notify` houdt een applicatie haar huidige kanalen.
- **Gedeelde inloggegevens**: een monitor noemt de gebruikte bij naam (`credential: iLO
  read-only`). De inloggegevens zelf worden niet geëxporteerd en moeten al in het doelbereik bestaan.

## Via de API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Vereist een API-token met de machtiging **Beheren** (zie [Gebruikers en toegang](users-and-access.md)).

## Importeren uit Uptime Kuma

**Configuratie › Importeren uit Uptime Kuma** leest de JSON-back-up van Uptime Kuma 1.x (*Instellingen › Back-up › Exporteren*) of het databasebestand `kuma.db` van 1.x en 2.x (in de datamap van Kuma). U ziet eerst een voorbeeld; er verandert niets tot u importeert.

HTTP-, trefwoord- en eenvoudige JSON-controles, TCP-poort, ping, DNS en push worden geïmporteerd met hun intervallen, herhalingen, tags en pauzestatus; het verlopen van HTTPS-certificaten wordt een aparte certificaatmonitor en groepen worden applicaties. Meldingen worden kanalen met dezelfde instellingen (e-mailmeldingen gebruiken de mailserver uit Instellingen) en staan eerst uit, tenzij u anders kiest. Onderdelen waarvan de naam al bestaat blijven ongemoeid, dus opnieuw importeren is veilig. Alles wat niet getrouw kan worden geïmporteerd (bijvoorbeeld Docker- of databasemonitors, of de omgekeerde modus) wordt met de reden vermeld.
