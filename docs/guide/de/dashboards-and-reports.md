<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Dashboards und Berichte

## Übersicht

Offene Vorfälle, mittlere Zeit bis zur Wiederherstellung (MTTR, 30 Tage), verfügbare und
fehlschlagende Monitore, Anwendungen im SLA-Ziel und eine Karte je Anwendung mit ihrem
30-Tage-Verfügbarkeitsstreifen. Die Seiten aktualisieren sich live (etwa eine Sekunde nach einer
Änderung); die Seitenleiste zeigt **Live**, solange die Verbindung besteht.

Die **Verfügbarkeit** ergibt sich aus dem Statusverlauf: Ausfall- und betroffene Zeit zählen
dagegen, geplante Wartung und die Zeit vor der ersten Prüfung nicht.

## Diagramme

Jeder Monitor zeigt seine Antwortzeit für 1 h, 6 h, 24 h, 7, 30 und 90 Tage (Mittelwert, p95,
Fehlschläge, Wartung), seine letzten Prüfungen als Heartbeat-Streifen, seine Statuswechsel und
seine jüngsten Ergebnisse.

## Berichte

**Berichte** zeigt je Anwendung (oder je gemeinsames Asset im Bereich Globale Infrastruktur):
Verfügbarkeit rund um die Uhr und während der **Geschäftszeiten**, Ausfallzeit, geplante
Wartung, Vorfälle, SLA erreicht oder verfehlt, MTTA (Zeit bis zur Bestätigung) und MTTR (Zeit bis
zur Lösung). Wählen Sie letzte Woche, letzten Monat, die letzten 30 Tage oder eigene Daten und
laden Sie ihn herunter als:

- **PDF**: in Ihrer Sprache; arabische Berichte sind von rechts nach links gesetzt,
- **CSV**: Verfügbarkeit und Vorfälle, UTF-8 für Excel, mit englischen Spaltennamen, damit
  Tabellen und Skripte weiter funktionieren.

## Geplante Berichte

**Berichte › Neuer Zeitplan** versendet PDF und/oder CSV per E-Mail jeden Montag (Vorwoche) oder
am 1. (Vormonat) zu einer gewählten Uhrzeit und Zeitzone, in der Sprache des Zeitplans, über den
SMTP-Server aus den Einstellungen. **Jetzt senden** schickt sofort den letzten Zeitraum.

## Statusseiten

**Statusseiten › Neue Statusseite** zeigt ausgewählte Anwendungen, Assets und Monitore auf einer
eigenen Seite unter `/status/<Adresse>`, mit Gesamtstatus, 90 Tagen Verfügbarkeit, aktuellen
Vorfällen und Wartungen. Jedes Element erhält einen **Anzeigenamen**, der statt des internen Namens
erscheint; Elemente derselben Gruppe stehen zusammen. Mandantenseiten können auch gemeinsame
Infrastruktur enthalten.

- **Öffentlich**: jeder mit dem Link, ohne Anmeldung. Die Seite zeigt nur Anzeigenamen und einfache
  Zustände (*In Betrieb, Beeinträchtigt, Störung, Wartung*), nie interne Namen, Ursachen,
  Vorfalltitel oder Wartungsnamen.
- **Intern**: angemeldete Benutzer mit Zugriff auf den Mandanten, die zusätzlich Vorfalltitel und
  Wartungsnamen sehen.

Die Seite aktualisiert sich jede Minute und nutzt Sprache sowie hellen oder dunklen Modus des
Besuchers.
