<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Konfiguration als Code

**Konfiguration** exportiert den aktuellen Bereich (Assets, Monitore, Anwendungen und ihre
Abhängigkeiten) als YAML und importiert ihn wieder. Bewahren Sie ihn in Git auf, übertragen Sie
die Einrichtung eines Mandanten auf einen anderen, oder automatisieren Sie sie über die API.

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

## So funktioniert der Import

- **Zuerst eine Vorschau**: Sie zeigt Feld für Feld, was angelegt oder geändert wird, und meldet
  Fehler mit ihrer Zeilennummer. **Anwenden** geschieht ganz oder gar nicht.
- **Teildateien sind sicher**: Ein Element in der Datei bestimmt dieses Element vollständig;
  Elemente, die nicht in der Datei stehen, bleiben unverändert.
- **Nicht enthalten**: Benachrichtigungskanäle und Zugangsdaten (sie enthalten Geheimnisse) sowie
  Wartungsfenster. Importierte Push-Monitore erhalten neue URLs. Anwendungen nennen ihre Kanäle
  im Feld `notify` beim Namen; ohne `notify` behält eine Anwendung ihre aktuellen Kanäle.
- **Gemeinsame Zugangsdaten**: Ein Monitor nennt die verwendeten beim Namen (`credential: iLO
  read-only`). Die Zugangsdaten selbst werden nicht exportiert und müssen im Zielbereich bereits existieren.

## Über die API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Erfordert ein API-Token mit der Berechtigung **Verwalten** (siehe
[Benutzer und Zugriff](users-and-access.md)).

## Aus Uptime Kuma importieren

**Konfiguration › Aus Uptime Kuma importieren** liest die JSON-Sicherung von Uptime Kuma 1.x (*Einstellungen › Sicherung › Exportieren*) oder die Datenbankdatei `kuma.db` von 1.x und 2.x (im Datenordner von Kuma). Sie sehen zuerst eine Vorschau; nichts ändert sich, bis Sie importieren.

HTTP-, Schlüsselwort- und einfache JSON-Prüfungen, TCP-Port, Ping, DNS und Push werden mit Intervallen, Wiederholungen, Tags und Pausenstatus übernommen; der Ablauf von HTTPS-Zertifikaten wird zu einem eigenen Zertifikatsmonitor, Gruppen werden zu Anwendungen. Benachrichtigungen werden zu Kanälen mit denselben Einstellungen (E-Mail nutzt den Mailserver aus den Einstellungen) und starten deaktiviert, sofern Sie nichts anderes wählen. Elemente, deren Name bereits existiert, bleiben unverändert, ein erneuter Import ist also sicher. Alles, was sich nicht originalgetreu importieren lässt (zum Beispiel Docker- oder Datenbankmonitore oder der Umkehrmodus), wird mit Grund aufgeführt.
