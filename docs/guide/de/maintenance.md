<!-- translation-of: maintenance.md#f097f823 -->
# Wartungsfenster

Planen Sie Arbeiten so, dass niemand alarmiert wird und sie nicht gegen die Verfügbarkeit zählen.

**Wartung › Wartung planen**: Geben Sie Titel, Beginn und Ende, Notizen (Change-Request,
Ansprechpartner, Rückfallplan) und an, was es **umfasst**: Assets (mit ihren Prüfungen) und
Monitore.

Während des Fensters:

- laufen die Prüfungen weiter, damit Sie sehen, was passiert,
- werden ihre Ergebnisse **aus Verfügbarkeit und SLA herausgerechnet**,
- werden **Benachrichtigungen unterdrückt**,
- zeigen Elemente, die von etwas in Wartung abhängen, dies als Ursache (*Betroffen von Wartung*),
  damit niemand einem geplanten Ausfall hinterherjagt.

**Jetzt beenden** schließt ein Fenster vorzeitig. Fenster erscheinen als *Geplant*, *Läuft* oder
*Abgeschlossen*.

Tipp: Verwenden Sie vorher **Was, wenn das ausfällt?** beim Asset, um zu sehen, welche
Anwendungen die Arbeiten berühren.

## Wiederkehrende Wartung

Wählen Sie beim Planen **Wiederholen**: täglich, wöchentlich an gewählten Tagen oder monatlich, an
einem Tag des Monats (Tag 31 fällt in kürzeren Monaten auf den letzten Tag) oder an einem Wochentag
einer Woche (*Dienstag der zweiten Woche* ist Microsofts Patch Tuesday). Die Zeiten gelten in der
gewählten Zeitzone, 02:00 bleibt also auch nach der Zeitumstellung 02:00; eine Endzeit vor dem
Beginn bedeutet den nächsten Tag.

Fudo legt die Fenster der nächsten 60 Tage an, markiert mit **Wiederholt**. **Überspringen**
entfernt einen Termin, und das Bearbeiten eines Fensters ändert nur diesen Termin. Das Bearbeiten
der Serie ändert ihre künftigen Fenster; Löschen entfernt sie, vergangene und laufende bleiben.
