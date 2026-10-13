<!-- translation-of: concepts.md#61c26734 -->
# Konzepte

## Bereiche: Mandanten und globale Infrastruktur

| Bereich | Enthält | Verwaltet von |
|---|---|---|
| **Mandant** (einer je Geschäftsbereich) | seine Anwendungen, Monitore, Assets, Kanäle, Berichte | Mandanten-Admins |
| **Globale Infrastruktur** | gemeinsame Assets (Switches, Speichersysteme, FC-Fabrics, Cluster) und ihre Monitore | Infrastruktur-Admins und Superadmins |

Wählen Sie den Bereich im Wähler oben in der Seitenleiste. Mandanten sehen die gemeinsame
Infrastruktur nur lesend und verknüpfen ihre eigenen Monitore und Anwendungen damit, sodass ein
Speicherausfall als Ursache bei jeder Anwendung erscheint, die diesen Speicher braucht.

## Bausteine

| Element | Was es ist | Beispiel |
|---|---|---|
| **Monitor** | eine Prüfung, die regelmäßig läuft | HTTPS auf `erp.corp.local/health` |
| **Asset** | ein Stück Infrastruktur, geprüft von seinen Monitoren | `Core-SW-01`, `SAN-A` |
| **Anwendung** | ein Geschäftsdienst: Monitore (Mitglieder) plus die Infrastruktur, die er braucht | *ERP Production* |
| **Abhängigkeit** | „das braucht jenes“: Asset → Asset, Anwendung → Asset | ESXi-Cluster → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Auf einem Asset hängt **Vorhandene hinzufügen** bereits bestehende Monitore an (einer, der an einem anderen Asset hängt, wechselt), und **Neuer Monitor** öffnet das Monitorformular dafür. Ein Mandant kann seine eigenen Monitore auch an ein gemeinsames globales Asset hängen; **Entfernen** löst einen Monitor vom Asset und behält ihn.

## Status

| Status | Bedeutung |
|---|---|
| **Verfügbar** | funktioniert |
| **Beeinträchtigt** | funktioniert, aber langsam oder teilweise (z. B. ist ein optionales Mitglied ausgefallen) |
| **Ausgefallen** | fällt aus, und nichts, wovon es abhängt, erklärt das: Es ist eine **Ursache** |
| **Betroffen** | fällt aus, **weil** etwas, wovon es abhängt, ausgefallen ist; Benachrichtigungen verweisen auf die Ursache |
| **Gefährdet** | funktioniert, aber etwas, wovon es abhängt, hat ein Problem |
| **Wartung** | in einem geplanten Wartungsfenster: zählt nicht gegen die Verfügbarkeit |
| **Ausstehend** | noch kein Ergebnis |

## Wie Fudo die Ursache findet

| Situation | Ergebnis |
|---|---|
| Die Prüfungen eines Assets schlagen fehl, und nichts, wovon es abhängt, ist ausgefallen | **Ausgefallen**: Ursache, mit eigenem Vorfall |
| Seine Prüfungen schlagen fehl **und** etwas, wovon es abhängt, ist ausgefallen | **Betroffen von** dieser Ursache: keine Flut von Benachrichtigungen |
| Seine Prüfungen sind erfolgreich, aber etwas, wovon es abhängt, ist ausgefallen | behält seinen Status, markiert als **Gefährdet** |
| Etwas, wovon es abhängt, ist in geplanter Wartung | **Betroffen von Wartung** (geplant, nicht in der Verfügbarkeit) |

Eine Anwendung ist gesund, wenn ihre Mitglieder es sind, gemäß ihrer Regel: **alle
Pflichtmitglieder verfügbar**, **mindestens eines** oder **mindestens N von M** (für redundante
Dienste). Pflichtmitglieder bestimmen den Status; optionale können ihn nur auf *Beeinträchtigt*
setzen.

**Was, wenn das ausfällt?** bei einem Asset sagt voraus, welche Anwendungen ausfallen würden und
welche dank Redundanz weiterlaufen, bevor Sie es für Arbeiten abschalten.

Die Seite **Topologie** zeigt das Gesamtbild mit Live-Status: Fahren Sie über ein Element, um
seine Abhängigkeiten zu verfolgen; *Nur Probleme* zeigt, was ausfällt und was davon abhängt.
