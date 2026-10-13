<!-- translation-of: settings.md#401e7e53 -->
# Einstellungen

**Einstellungen** (unten in der Seitenleiste) enthält Ihre persönlichen Vorlieben für alle, und
Systemeinstellungen für Superadmins.

Jeder Abschnitt ist ein Reiter. Die Adresse behält den geöffneten Reiter (zum Beispiel `/settings#retention`), sodass sich ein Reiter als Lesezeichen speichern oder als Link verschicken lässt.

## Ihre Vorlieben

- **Sprache der Oberfläche**: 13 Sprachen, darunter Arabisch mit Darstellung von rechts nach links. Gespeichert
  in Ihrem Profil, damit sie Ihnen in jeden Browser folgt. Auch Vorfalltitel und Prüfergebnisse
  werden übersetzt.
- **Design**: **System** (folgt dem hellen oder dunklen Modus Ihres Betriebssystems), **Hell**,
  **Dunkel**, **Monokai**, sowie jedes Design, das Ihr Administrator hinzufügt.

## Systemeinstellungen (Superadmins)

### Sprache der Benachrichtigungen

**Standardsprache** von Benachrichtigungen und geplanten Berichten. Jeder Kanal und Zeitplan kann
eine eigene verwenden; E-Mails an eine Person (Einladungen, Zurücksetzungen) verwenden deren
Sprache. Sie ändert nicht die Oberfläche: Diese wählt jede Person unter *Einstellungen für Sie*.

### E-Mail (SMTP)

Wird für Einladungen, E-Mail-Benachrichtigungen und geplante Berichte verwendet.

| Feld | Hinweise |
|---|---|
| SMTP-Host, Port | 587 (STARTTLS) oder 465 (*TLS von Beginn an verwenden*); 25 für ein internes Relay |
| Benutzername, Kennwort | optional; das Kennwort wird verschlüsselt gespeichert und nie wieder angezeigt |
| Absenderadresse | z. B. `fudo@corp.local` |
| **Selbstsignierte Zertifikate akzeptieren** | für ein lokales Relay mit selbstsigniertem oder internem Zertifikat: Die Verbindung bleibt verschlüsselt, nur die Zertifikatsprüfung entfällt |

**Test-E-Mail senden** nennt den genauen Grund, wenn etwas nicht stimmt: ein nicht
vertrauenswürdiges Zertifikat, ein falsches Kennwort, ein nicht erreichbarer Server oder ein
TLS-Modus, der nicht zum Port passt.

## Für Administratoren

Neue Sprachen und Designs lassen sich ohne Neubau hinzufügen, indem man Dateien in Ordner legt;
siehe `locales/README.md` und `themes/README.md` im Repository.

## Datenaufbewahrung

**Einstellungen › Datenaufbewahrung** (Superadmins) legt fest, wie lange jede Art von Daten aufbewahrt wird, und zeigt den belegten Platz: rohe Prüfergebnisse, stündliche und tägliche Zusammenfassungen, Statusverlauf, behobene Vorfälle, Benachrichtigungsprotokoll, Audit-Protokoll und abgeschlossene Wartungsfenster. Alte Daten werden stündlich in kleinen Teilen entfernt. Mindestwerte schützen, was Fudo anzeigt (90-Tage-Diagramme, Verfügbarkeitsberichte, Statusseiten), und die letzte Statusänderung vor der Grenze bleibt immer erhalten, damit die Verfügbarkeit genau bleibt. Offene Vorfälle und noch zu sendende Benachrichtigungen werden nie entfernt.
