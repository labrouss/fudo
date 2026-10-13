<!-- translation-of: notifications.md#5487cd95 -->
# Benachrichtigungen

## Kanäle

**Benachrichtigungen › Kanal hinzufügen**. Eingebaut: **E-Mail** (braucht den SMTP-Server aus den
Einstellungen), **Microsoft Teams** (Workflows-Webhook), **Slack** (Incoming Webhook) und
**Webhook (JSON)**. Über 100 weitere (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover,
Signal, Twilio und andere SMS-Gateways, Mattermost, Matrix, Google Chat, …) stammen aus den
Benachrichtigungsanbietern von Uptime Kuma. **Test senden** prüft einen Kanal; **Protokoll** zeigt
jede Zustellung und warum ein Kanal übersprungen wurde.

Chat-Nachrichten beginnen mit **[Fudo]**, damit man sie leicht von anderen Werkzeugen im selben
Chat unterscheidet.

## Welche Vorfälle ein Kanal erhält

| Einstellung | Wirkung |
|---|---|
| **Senden** | *Alle Vorfälle dieses Mandanten* (Standard) oder *Nur Vorfälle ausgewählter Anwendungen* |
| **Mindestschweregrad** | Niedrig und höher (alle), Hoch und Kritisch, oder nur Kritisch |
| **Ereignisse** | eröffnet, bestätigt, behoben |
| **Vorfälle überspringen, die durch einen anderen Vorfall verursacht wurden** | nur Ursachen, nicht die damit verknüpften betroffenen Vorfälle |
| **Erinnern, solange unbestätigt** | alle N Minuten wiederholen, solange niemand bestätigt |
| **Sprache der Nachrichten** | die Sprache des Kanals; Standard: die der Organisation (Einstellungen) |

Kanäle eines Mandanten erhalten dessen Vorfälle, auch solche, die von gemeinsamer Infrastruktur
verursacht werden (mit der Ursache in der Nachricht). Globale Kanäle erhalten
Infrastruktur-Vorfälle; mit **alle Mandanten** (ein NOC-Kanal) erhalten sie zusätzlich die
Vorfälle jedes Mandanten, außer denen, die durch einen bereits erhaltenen Infrastruktur-Vorfall
verursacht wurden.

**Je Anwendung:** Ein Kanal mit *Nur Vorfälle ausgewählter Anwendungen* erfährt nur von diesen.
Wählen Sie sie im Kanalformular oder auf der Seite einer Anwendung in der Karte
**Benachrichtigungen**, die auch warnt, wenn die Vorfälle einer Anwendung keinen Kanal erreichen.

## Eskalation

Geben Sie einem Kanal eine Verzögerung (**Eskalieren: nicht bestätigt nach 15 Min.**), und er wird
zur Eskalationsstufe: Er wird nur benachrichtigt, wenn der Vorfall nach dieser Zeit noch offen,
unbestätigt und nicht stummgeschaltet ist, und erhält danach dessen Bestätigung und Lösung.
Verketten Sie mehrere: Teams sofort → Bereitschafts-SMS nach 15 Minuten → Leitung nach 60
Minuten.

## Zustellung

Nachrichten laufen über einen Ausgangspuffer mit Wiederholungen (nach 1, 5 und 15 Minuten) und
einer Ratenbegrenzung je Kanal, damit eine Flut von Vorfällen Ihren Bot oder Mail-Relay nicht
sperren lässt.

## Webhook-Inhalt

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Legen Sie ein **Signaturgeheimnis** fest, um `X-Fudo-Signature: sha256=<HMAC des Bodys>` zu
erhalten. Der Inhalt bleibt Englisch (ein stabiles Format für Integrationen);
`incident.titleParts` enthält den Titel als Nachrichtencodes, falls Sie ihn selbst übersetzen
möchten.

## Bereitschaft

Teams benachrichtigen Personen bei Vorfällen ihrer Elemente. Legen Sie unter **Teams › Bereitschaft**
die Reihenfolge der Mitglieder fest, die Schichtlänge (ein Tag, eine Woche, zwei Wochen oder beliebig
viele Tage), Übergabezeit und Zeitzone sowie die Vorfälle, bei denen benachrichtigt wird.
**Eskalationsschritte** bestimmen, wer wann benachrichtigt wird, gezählt ab Eröffnung des Vorfalls,
zum Beispiel sofort die Person in Bereitschaft, nach 15 Minuten die nächste und nach 30 die Leitung.
**Vertretungen** lassen jemand anderen einen Zeitraum übernehmen, etwa bei Tausch oder Urlaub.

Jede Person wird über ihre eigenen Benachrichtigungsschritte erreicht (siehe *Ihr Profil*) oder, falls
sie keine hat, per E-Mail an ihre Anmeldeadresse. Die Benachrichtigungen enden, sobald jemand den
Vorfall bestätigt, und pausieren, solange er stummgeschaltet ist. Die Vorfallseite zeigt, wer
benachrichtigt wurde und was gesendet wurde; Ihr Profil zeigt Ihre nächsten Schichten.

Bereitschaftsnachrichten enthalten die Links **Bestätigen** und **In Fudo öffnen** (setzen Sie `PUBLIC_URL`). Bestätigen öffnet eine Seite, auf der ein Tippen den Vorfall in Ihrem Namen bestätigt, ohne Anmeldung; das bloße Öffnen des Links ändert nichts, sodass Linkvorschauen und E-Mail-Scanner nicht versehentlich bestätigen können. Jeder Link funktioniert einmal, 24 Stunden lang, solange der Vorfall offen ist, und nur, wenn Ihre Rolle Vorfälle bestätigen darf.
