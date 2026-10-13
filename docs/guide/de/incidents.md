<!-- translation-of: incidents.md#4e781264 -->
# Vorfälle

Fudo eröffnet Vorfälle selbst, wenn etwas ausfällt, und löst sie, wenn es sich erholt.

## Wann ein Vorfall eröffnet wird

| Element | Eröffnet einen Vorfall, wenn | Schweregrad |
|---|---|---|
| **Anwendung** | Ausgefallen, oder Betroffen von einer ungeplanten Ursache | aus ihrer Kritikalität: kritisch → Kritisch, hoch → Hoch, andere → Niedrig |
| **Asset** | Ausgefallen (es ist eine Ursache) | Hoch |
| **Monitor** | Ausgefallen und nicht Teil eines Assets oder einer Anwendung | Niedrig |

Ein **betroffener** Vorfall ist mit dem Vorfall seiner Ursache verknüpft (*Verursacht durch
INC-…*), sodass ein ausgefallener Switch einen Ursachen-Vorfall mit klar verknüpften betroffenen
Vorfällen ergibt, keine Flut von Benachrichtigungen.

## Lebenslauf eines Vorfalls

1. **Eröffnet** automatisch, Benachrichtigungen werden versendet (siehe
   [Benachrichtigungen](notifications.md)).
2. Mit **Bestätigen** zeigen Sie, dass sich jemand kümmert; Erinnerungen und Eskalationen enden.
3. **Stummschalten** unterdrückt Benachrichtigungen eine Weile (30 Minuten bis 1 Tag), ohne zu
   bestätigen.
4. **Behoben** automatisch, wenn sich das Element erholt. Fällt es innerhalb von 5 Minuten erneut
   aus, wird derselbe Vorfall **wieder eröffnet** statt eines neuen. Sie können ihn auch von Hand
   lösen.

Die **Zeitleiste** hält jeden Schritt fest: Statuswechsel, Benachrichtigungen, Bestätigungen und
Notizen.

## Notizen: Wissen teilen

Fügen Sie der Zeitleiste Notizen als **Kommentar**, **Durchgeführte Maßnahme** oder **Lösung**
hinzu, mit Tags (z. B. `supervisor`, `firmware`).

Lösungen werden wiederverwendet: Tritt später ein ähnlicher Vorfall auf (gleiches Element,
gleiche Ursache, gemeinsame Tags oder ähnlicher Text), zeigen **Ähnliche frühere Vorfälle**, was
geholfen hat, und seine Benachrichtigungen zitieren es: *„Beim letzten Mal (INC-0041, 12. Aug.
2026) wurde es so gelöst: …“*.

## Vorfälle finden

**Vorfälle** listet die **offenen** Vorfälle des in der Seitenleiste gewählten Bereichs; für den
Verlauf wechseln Sie zu *Behoben* und suchen nach Titel, INC-Nummer oder Tag. Vorfälle eines
anderen Mandanten erscheinen, wenn Sie zu diesem Mandanten wechseln (siehe
[Fehlerbehebung](troubleshooting.md)).

## Nachberichte

**Nachbericht** an einem Vorfall lädt einen Bericht als **PDF** oder **Markdown** (für ein Wiki oder ein Ticket) herunter: eine Zusammenfassung mit Zeiten und wer bestätigt und behoben hat, die betroffenen Vorfälle, Lösung und Maßnahmen, die Zeitleiste, die gesendeten Benachrichtigungen und ähnliche frühere Vorfälle. Er nutzt Ihre Sprache und Zeitzone und lässt sich auch erstellen, solange der Vorfall noch offen ist.
