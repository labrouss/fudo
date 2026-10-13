<!-- translation-of: getting-started.md#ea57bfb7 -->
# Erste Schritte

Fudo zeigt Ihnen, ob Ihre Geschäftsanwendungen laufen, **warum** sie ausgefallen sind, und was
ähnliche Probleme früher gelöst hat. Diese Seite führt Sie von einer neuen Installation bis zur
ersten Benachrichtigung.

## 1. Erste Anmeldung

Öffnen Sie Fudo nach der Installation (siehe [Installation](../../admin/installation.md)) im
Browser. Der **Einrichtungsassistent** fragt nach:

1. dem Namen Ihrer Organisation,
2. dem ersten Administrator (Name, E-Mail, Kennwort mit mindestens 12 Zeichen),
3. der Zwei-Faktor-Authentifizierung: Scannen Sie den QR-Code mit einer Authenticator-App
   (Microsoft Authenticator, Google Authenticator, 1Password, …) und **bewahren Sie die
   Wiederherstellungscodes auf**,
4. optional dem E-Mail-Server (SMTP) für Einladungen, Benachrichtigungen und Berichte. Sie können
   ihn auch später unter **Einstellungen** festlegen.

Die Zwei-Faktor-Authentifizierung ist für jedes Konto Pflicht.

## 2. Einen Mandanten anlegen

Ein **Mandant** ist ein Geschäftsbereich, zum Beispiel *Finanzen* oder *Personal*. Seine
Anwendungen, Monitore und Benachrichtigungskanäle sind von denen anderer Mandanten getrennt.
Öffnen Sie **Administration › Mandanten › Neuer Mandant** und wählen Sie ihn dann im Mandanten-
wähler oben in der Seitenleiste.

Gemeinsame Infrastruktur (Core-Switches, Speichersysteme, Cluster) gehört stattdessen in den
Bereich **Globale Infrastruktur**; siehe [Konzepte](concepts.md).

## 3. Einen Monitor hinzufügen

**Monitore › Monitor hinzufügen**, wählen Sie einen Typ (zum Beispiel *HTTP(S)* oder *Ping*),
geben Sie das Ziel an und klicken Sie auf **Jetzt testen**, um die Prüfung einmal ohne Speichern
auszuführen. Speichern Sie ihn; Ergebnisse erscheinen innerhalb eines Prüfintervalls. Für viele
Hosts auf einmal verwenden Sie **Massenhinzufügen / Vorlagen**; siehe [Monitore](monitors.md).

## 4. Monitore zu einer Anwendung zusammenfassen

**Anwendungen › Neue Anwendung**, dann fügen Sie die Monitore hinzu, aus denen der Dienst besteht
(Web-Frontend, API, Datenbank). Der Status der Anwendung zeigt, ob der Dienst funktioniert, und
wenn nicht, warum. Legen Sie ein **SLA-Ziel** fest, um ihn in Berichten zu verfolgen.

## 5. Benachrichtigt werden

**Benachrichtigungen › Kanal hinzufügen**: E-Mail, Microsoft Teams, Slack, ein JSON-Webhook oder
einer von über 100 weiteren (Telegram, PagerDuty, SMS-Gateways, …). **Test senden** prüft den
Kanal. Siehe [Benachrichtigungen](notifications.md).

## 6. Kolleginnen und Kollegen einladen

**Administration › Benutzer › Benutzer einladen**: Wählen Sie ihre Sprache und ihre Rolle je
Mandant. Sie erhalten einen einmaligen Link, um ein Kennwort festzulegen und die
Zwei-Faktor-Authentifizierung einzurichten. Siehe [Benutzer und Zugriff](users-and-access.md).

## Wie es weitergeht

- [Konzepte](concepts.md): Bereiche, Assets, Abhängigkeiten und wie Fudo die Ursache findet
- [Vorfälle](incidents.md): was passiert, wenn etwas ausfällt
- [Fehlerbehebung](troubleshooting.md): häufige Fragen
