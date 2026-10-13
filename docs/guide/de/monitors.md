<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitore

## Die Liste

Die Monitorliste zeigt das **Asset** jedes Monitors und die **Anwendungen**, zu denen er gehört (eine optionale Mitgliedschaft hat einen gestrichelten Rahmen); beides sind Links. Klicken Sie auf eine Spaltenüberschrift, um zu sortieren (erneut für umgekehrt, ein drittes Mal für die Standardreihenfolge); Fudo merkt sich die Sortierung in diesem Browser. Das Filterfeld durchsucht Namen, Ziele, Tags, Assets und Anwendungen; es ignoriert Groß-/Kleinschreibung und Akzente, und jedes Wort muss passen. Die anderen langen Listen (Assets, Vorfälle, Benutzer, Wartung, Kanäle und weitere) sortieren und filtern genauso.

## Monitortypen

| Kategorie | Typ | Prüft |
|---|---|---|
| Web | **HTTP(S)** | Statuscode-Bereiche, Schlüsselwort vorhanden/fehlend, JSON-Wert (`$.status`), Header, Body, Antwortzeit |
| | **TLS-Zertifikat** | Vertrauen, Hostname, Tage bis zum Ablauf (Beeinträchtigt innerhalb von N Tagen, Ausgefallen nach Ablauf) |
| Netzwerk | **Ping** | Erreichbarkeit, Latenz, Paketverlust |
| | **TCP-Port** | der Port nimmt Verbindungen an |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, optional erwartete Antwort, gewählter Resolver |
| | **SNMP** | liest eine OID (v1, v2c, v3) und vergleicht den Wert oder, bei Zählern, seine Änderung pro Sekunde |
| | **Netzwerkschnittstelle (SNMP)** | ein Switch-, Router- oder Firewall-Port: Verbindungsstatus, Datenverkehr ein und aus (bit/s und % der Verbindungsgeschwindigkeit), Fehler; im Zeitverlauf dargestellt |
| | **NTP** | Erreichbarkeit, Stratum, Zeitabweichung |
| | **SMTP** | 220-Begrüßung, EHLO, optional STARTTLS |
| | **LDAP / Active Directory** | das Verzeichnis antwortet (Active Directory: Beeinträchtigt, solange der Domänencontroller nicht synchronisiert ist), oder ein Konto meldet sich an und eine Suche findet Einträge; nennt gesperrte, abgelaufene und deaktivierte Konten |
| | **Domain-Ablauf** | Ablauf der Registrierung über RDAP (Fallback WHOIS) |
| Datenbanken | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | verbindet sich, optionale Abfrage mit erwartetem Ergebnis |
| Systeme | **SSH-Befehl** | Exit-Code oder Ausgabe (enthält, exakt, Regex), optionales Host-Key-Pinning |
| | **Docker-Container** | läuft, und ist gesund, falls er einen Healthcheck hat |
| Infrastruktur | **vCenter-VM** | Energiezustand, VMware Tools (vCenter 6.7, 7, 8) |
| | **HPE iLO / Redfish-Zustand** | Hardware-Zustand des Servers vom BMC (iLO 4/5/6, iDRAC, andere Redfish-BMCs) |
| | **Einlasstemperatur (iLO / Redfish)** | Temperatur der einströmenden Luft, also vor dem Rack: beeinträchtigt ab 27 °C, ausgefallen ab 32 °C (ASHRAE), mit Verlaufsdiagramm |
| | **Raumtemperatur** | alle Einlasssensoren mit dem Tag `room:<name>` zusammen: ausgefallen, wenn mehrere heiß sind (Kühlungsproblem), beeinträchtigt, wenn einer heiß ist oder mehrere schnell steigen |
| Passiv | **Push-Heartbeat** | ein Job ruft eine URL auf; Ausgefallen, wenn die Aufrufe ausbleiben |
| | **SNMP-Traps** | Traps, die ein Gerät sendet (v1, v2c): Ausgefallen oder Beeinträchtigt, solange ein Problem-Trap offen ist; endet von selbst, durch einen beendenden Trap oder von Hand |

**Jetzt testen** führt eine Prüfung einmal vom Fudo-Server aus, ohne zu speichern, damit Sie sie
einstellen können, bevor sie Benachrichtigungen auslöst.

## Fehlalarme vermeiden

- **Ausgefallen nach N Fehlschlägen**: Ein Monitor wird erst nach N aufeinanderfolgenden
  fehlgeschlagenen Prüfungen Ausgefallen und prüft dazwischen im schnelleren
  *Wiederholungsintervall*.
- **Verfügbar nach M Erfolgen**: Er gilt erst nach M aufeinanderfolgenden erfolgreichen Prüfungen
  wieder als verfügbar.
- **Beeinträchtigt über**: Langsame Antworten zählen als Beeinträchtigt statt Ausgefallen.

## Zugangsdaten

Kennwörter, SNMP-Communities, SSH-Schlüssel und Ähnliches werden **verschlüsselt** gespeichert
und nie wieder angezeigt, exportiert oder von der API zurückgegeben; nur der Worker
entschlüsselt sie, um eine Prüfung auszuführen. Verwenden Sie Nur-Lese-Konten: eine
vCenter-Rolle mit *Read-only*, einen iLO-Benutzer mit dem Recht *Login*, einen Datenbankbenutzer
nur mit `CONNECT`/`SELECT`.

### Gemeinsame Zugangsdaten

Wenn sich viele Monitore mit demselben Konto anmelden (ein iLO-Benutzer mit Leserechten für alle
Server, eine SNMP-Community für die Switches), legen Sie es einmal unter **Zugangsdaten** ab und
lassen die Monitore es verwenden. Ändert sich das Passwort, bearbeiten Sie die Zugangsdaten
einmal: Jeder Monitor, der sie verwendet, prüft sofort erneut mit dem neuen Wert.

- Zugangsdaten haben eine Art: *Konto und Passwort*, *SSH-Schlüssel*, *SNMP-Community (v1, v2c)*
  oder *SNMPv3-Benutzer*. Im Monitorformular bieten Typen mit Anmeldung **Hier eingeben** oder
  **Gemeinsame Zugangsdaten verwenden**; mit Zugangsdaten verschwinden die Kontofelder aus dem
  Formular.
- Zugangsdaten gehören zu einem Bereich: Die Monitore eines Mandanten können nur dessen
  Zugangsdaten verwenden, Monitore des globalen Infrastrukturbereichs nur globale.
- Geheimnisse sind nur schreibbar, wie die eines Monitors: verschlüsselt gespeichert, nie
  angezeigt, exportiert oder zurückgegeben. Die Liste zeigt das Konto und welche Monitore es
  verwenden.
- **Dasselbe Konto in mehreren Monitoren**: Die Seite listet Monitore auf, die bereits dasselbe
  Konto und Passwort speichern. Geben Sie der Gruppe einen Namen und wählen Sie **Gemeinsame
  Zugangsdaten erstellen**: Das Passwort wird auf dem Server kopiert, niemand muss es kennen.
- **Verwenden für…** weist weitere Monitore den Zugangsdaten zu; ihr eigenes Konto und Passwort
  werden entfernt. Verwendete Zugangsdaten können nicht gelöscht werden, und ihre Art kann sich
  nicht ändern.
- Ein Monitor, der keine Zugangsdaten mehr verwendet, braucht wieder ein eigenes Passwort.
- In der [Konfiguration als Code](configuration-as-code.md) nennt ein Monitor seine Zugangsdaten
  (`credential: iLO read-only`); die Zugangsdaten selbst werden in der Oberfläche angelegt. Auch
  das Massenhinzufügen von Temperaturprüfungen kann sie verwenden.
- Jede Änderung steht im Audit-Protokoll, mit den Namen der geänderten Geheimnisse, nie mit ihren
  Werten.

## Push-Monitore

Ein Push-Monitor wartet darauf, dass Ihr Job ihn aufruft. Nach dem Speichern zeigt seine Seite
die URL:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Er wird Ausgefallen, wenn innerhalb von Intervall plus Karenzzeit kein Aufruf eintrifft. **Neue
URL** ersetzt das Token, falls es bekannt geworden ist.

## Massenhinzufügen und Vorlagen

**Monitore › Massenhinzufügen / Vorlagen** legt Prüfungen für viele Hosts auf einmal an:

1. Fügen Sie einen Host oder eine URL pro Zeile ein (oder laden Sie eine CSV mit
   `name,host,port`),
2. wählen Sie eine **Vorlage**, zum Beispiel *Windows-Server* (Ping, RDP, WinRM),
   *Linux-Server*, *HPE iLO*, *Netzwerkgerät*, *ESXi-Host*, *vCenter*, *SQL Server*,
   *Speichersystem* oder *Webanwendung*, oder einen einzelnen Prüftyp,
3. legen Sie optional ein Asset pro Zeile an, machen Sie sie von einem vorhandenen Asset abhängig
   und fügen Sie sie einer Anwendung hinzu.

Vor dem Anwenden zeigt es eine Vorschau von allem, was angelegt wird.

## Hinweise zu einzelnen Typen

- **vCenter-VM** findet die passende API-Version selbst und verwendet Sitzungen wieder (eine
  Anmeldung je vCenter alle 20 Minuten). Die VMware-Tools-Prüfung braucht vCenter 7.0 oder neuer.
- **HPE iLO / Redfish** benennt bei HPE iLO das fehlerhafte Teil (Lüfter, Netzteile, Speicher,
  Redundanz). Warning → Beeinträchtigt, Critical oder ausgeschaltet → Ausgefallen.
- **SSH-Befehl**: Setzen Sie den *Host-Key-Fingerabdruck* (`ssh-keyscan host | ssh-keygen -lf -`),
  damit ein geänderter Server-Schlüssel gemeldet statt akzeptiert wird.
- **Docker-Container** verwendet den lokalen Docker-Socket (in den Worker-Container einbinden,
  siehe `docker-compose.yml`) oder eine entfernte Docker-API-URL.
- **Domain-Ablauf**: Manche Länder-Registries veröffentlichen weder RDAP noch WHOIS; Fudo meldet
  das als Beeinträchtigt mit einer Erklärung.
- **Ping** braucht die Fähigkeit `NET_RAW` im Worker-Container, und für **Jetzt testen** im
  API-Container (beides in `docker-compose.yml` gesetzt).

## SNMP-Traps

Richten Sie die SNMP-Traps (v1 oder v2c) Ihrer Geräte auf den Fudo-Server, UDP-Port 162. Die
Seite **Traps** zeigt, ob Traps empfangen werden, und jeden Trap mit seinen Feldern.

- Ein Monitor **SNMP-Traps** übernimmt die Traps der Geräte unter **Von**: Adressen, Hostnamen
  oder IPv4-Bereiche (`10.0.12.0/24`). Mit einer **Community** (oder gemeinsamen Zugangsdaten vom
  Typ SNMP-Community) nimmt er nur Traps, die sie tragen; die Community wird nie gespeichert.
- **Problem-Traps**: die Standard-Traps (Link down, Kalt- und Warmstart,
  Authentifizierungsfehler), nur aufgeführte Traps (Namen oder OIDs; eine OID umfasst auch alles
  darunter, z. B. das Enterprise-Präfix eines Herstellers) oder jeder Trap. *Nur wenn ein Feld
  enthält* beschränkt auf Traps mit einem Text wie `Critical`.
- Solange ein Problem offen ist, ist der Monitor **Ausgefallen** (oder Beeinträchtigt, wenn Sie
  das wählen); Vorfall, Benachrichtigungen und Bereitschaft funktionieren wie bei jeder Prüfung,
  innerhalb einer Sekunde nach dem Trap.
- Probleme werden pro Trap und Schnittstelle geführt: Link down an zwei Ports sind zwei Probleme,
  und das **Link up** eines Ports beendet nur dessen Problem.
- **Probleme enden** automatisch, wenn eine Weile kein neuer Trap kommt (Standard 30 Minuten),
  oder nur von Hand: Die Monitorseite listet die offenen Traps mit **Zurücksetzen** (bis zum
  nächsten passenden Trap). *Beendende Traps* beenden Probleme ebenfalls, z. B. der Trap
  „Zustand behoben“ eines Herstellers.
- Ein Trap, den **kein Monitor übernimmt**, wird trotzdem gespeichert: beim Mandanten des Assets
  mit dieser Adresse, sonst im globalen Infrastrukturbereich. **Monitor anlegen** auf der Seite
  Traps füllt einen Monitor für sein Gerät aus.
- Ein Gerät, das mit Traps flutet, wird begrenzt (50 pro Sekunde, Spitzen bis 500); verworfene
  Traps werden auf der Seite Traps des globalen Bereichs gezählt. Traps werden 30 Tage aufbewahrt
  (Einstellungen › Datenaufbewahrung).

## Netzwerkschnittstellen

Ein Monitor **Netzwerkschnittstelle (SNMP)** überwacht einen Port eines Switches, Routers oder
einer Firewall.

- **Schnittstellen suchen…** (nach Host und SNMP-Zugang oder gemeinsamen Zugangsdaten) listet die
  Schnittstellen des Geräts mit Beschreibung, Geschwindigkeit und Status. Wählen Sie eine oder beim
  Hinzufügen mehrere: Jede wird ein Monitor mit den Einstellungen des Formulars, benannt nach der
  Schnittstelle.
- Die Schnittstelle wird über ihren **Namen** (oder Beschreibung oder Alias) gemerkt, nicht über
  ihre Nummer, weil manche Geräte ihre Schnittstellen nach einem Neustart neu nummerieren. Eine
  Nummer funktioniert auch.
- Der **Datenverkehr** ist die Differenz zweier Messungen der 64-Bit-Zähler: Die erste Prüfung
  misst zweimal im Abstand von zwei Sekunden; spätere Prüfungen verwenden die Messung der vorigen
  Prüfung. Nach einem Neustart des Geräts wird das Paar übersprungen, es gibt also keine falsche
  Spitze. Geräte ohne 64-Bit-Zähler (SNMP v1) verwenden 32-Bit-Zähler, die bei einem Intervall von
  einer Minute oberhalb von etwa 100 Mbit/s nicht zuverlässig sind.
- **Status**: Verbindung getrennt → Ausgefallen; testing oder dormant → Beeinträchtigt; ein
  absichtlich deaktivierter Port ist Verfügbar (oder Ausgefallen, wenn Sie das wählen). Die stärker
  ausgelastete Richtung über *Beeinträchtigt ab Auslastung* (Standard 80 %) → Beeinträchtigt, über
  *Ausgefallen ab Auslastung* (standardmäßig aus) → Ausgefallen; Fehler pro Minute über der Grenze →
  Beeinträchtigt. Meldet das Gerät eine falsche Geschwindigkeit (ein Tunnel, eine ratenbegrenzte
  Leitung), setzen Sie *Verbindungsgeschwindigkeit*.
- Die Monitorseite zeigt den Datenverkehr ein und aus mit der Linie für Beeinträchtigt.
- *Vergleichen: Seine Änderung pro Sekunde* im **SNMP**-Monitor macht dasselbe für jeden Zähler
  (Frames an einem SAN-Port, Firewall-Sitzungen, USV-Ereignisse).

## Rechenzentrumstemperatur

**Temperatur** zeigt jeden Einlasstemperatur-Sensor, gruppiert nach seinem Tag `room:<name>` und vom wärmsten an sortiert, mit Rack (`rack:<name>`), aktuellem Wert, den letzten 6 Stunden, der Änderung über 15 Minuten und dem 24-Stunden-Bereich. **Sensoren hinzufügen** legt sie für eine Liste von iLO-Adressen (oder anderen Redfish-BMCs) mit einem gemeinsamen Nur-Lese-Konto an.

Ein Sensor wird außerdem beeinträchtigt, wenn seine Temperatur **schnell steigt** (standardmäßig 3 °C in 15 Minuten), auch unterhalb der Schwellen: das früheste Zeichen eines Kühlungsausfalls. **Raumalarm anlegen** fügt für den Raum einen Monitor *Raumtemperatur* hinzu: ausgefallen, wenn 3 Sensoren heiß sind, beeinträchtigt, wenn einer heiß ist oder 2 schnell steigen. Er eröffnet Vorfälle wie jeder Monitor, Zuständigkeit, Bereitschaft und Statusseiten funktionieren also auch für ihn.
