<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Fehlerbehebung

### Ich habe eine Benachrichtigung erhalten, aber die Vorfallliste ist leer

- **Anderer Mandant**: Die Liste zeigt den in der Seitenleiste gewählten Bereich. Ein Kanal mit
  *alle Mandanten* erhält die Vorfälle jedes Mandanten; wechseln Sie den Mandanten, um sie zu
  sehen.
- **Bereits behoben**: Kurze Ausfälle eröffnen und schließen einen Vorfall innerhalb von Minuten;
  sehen Sie unter *Behoben* nach.
- **Nicht von Fudo**: Chat-Nachrichten von Fudo beginnen mit **[Fudo]** und enthalten nie rohe
  Fehlercodes wie `EHOSTUNREACH`. Läuft noch ein anderes Überwachungswerkzeug (zum Beispiel Uptime
  Kuma), das in denselben Chat schreibt, stammt die Meldung von dort. Das **Protokoll** des Kanals
  zeigt alles, was Fudo gesendet hat.

### Ein Monitor schlägt mit „Host nicht erreichbar“ oder „Zeitüberschreitung“ fehl

Die Prüfung läuft im **Worker**-Container von Fudo, nicht auf Ihrem PC. Stellen Sie sicher, dass
der Host des Workers das Ziel erreicht (Routing, Firewalls). Für Ping brauchen die Container die
Fähigkeit `NET_RAW` (gesetzt in `docker-compose.yml`).

### „Dem Zertifikat des SMTP-Servers wird nicht vertraut“

Ihr Mail-Relay verwendet ein selbstsigniertes oder internes Zertifikat. Aktivieren Sie
**Selbstsignierte Zertifikate akzeptieren** unter Einstellungen › E-Mail (SMTP).

### Alles hinter einem Switch wurde gleichzeitig rot

Das ist erwartet, und Fudo geht damit um: Der Switch ist **Ausgefallen** (Ursache), die Elemente
dahinter sind **Betroffen**. Sie erhalten einen Ursachen-Vorfall mit den anderen daran verknüpft.
Achten Sie darauf, dass die Abhängigkeiten erfasst sind (Asset *hängt ab von* Switch), damit Fudo
es erkennen kann.

### Eine geplante Änderung hat die Bereitschaft alarmiert

Legen Sie vorher ein [Wartungsfenster](maintenance.md) für die betroffenen Assets an: Die
Prüfungen laufen weiter, aber Benachrichtigungen werden unterdrückt und die Zeit zählt nicht
gegen die Verfügbarkeit.

### Die Vorfälle einer Anwendung erreichen niemanden

Öffnen Sie die Anwendung: Ihre Karte **Benachrichtigungen** warnt, wenn kein Kanal ihre Vorfälle
erhält (zum Beispiel wenn jeder Kanal auf *Nur Vorfälle ausgewählter Anwendungen* steht, ohne
diese).

### Die Seite zeigt „Verbindung zu Live-Aktualisierungen wird wiederhergestellt“

Der Browser hat die Verbindung zur API verloren; die Seiten aktualisieren sich wieder
automatisch, sobald sie zurück ist. Bleibt es dabei, prüfen Sie, ob ein Proxy vor Fudo
langlebige Verbindungen (Server-Sent Events) zu `/api/live` zulässt.

### Ich habe mein Telefon verloren

Melden Sie sich mit einem Wiederherstellungscode an oder bitten Sie einen Administrator, für Ihr
Konto **2FA zurückzusetzen**.
