<!-- translation-of: users-and-access.md#c2bf850f -->
# Benutzer und Zugriff

## Rollen

| Rolle | Wo | Darf |
|---|---|---|
| **Superadmin** | überall | alles, einschließlich Benutzer, Mandanten und Einstellungen |
| **Infrastruktur-Admin** | Bereich Globale Infrastruktur (und jeder Mandant) | gemeinsame Infrastruktur verwalten; die Daten aller Mandanten verwalten |
| **Mandanten-Admin** | ein Mandant | den Mandanten verwalten: Monitore, Assets, Anwendungen, Kanäle, Berichte, API-Tokens |
| **Operator** | ein Mandant | alles sehen; Monitore pausieren, fortsetzen und testen, Vorfälle bestätigen, stummschalten und lösen, Notizen hinzufügen |
| **Betrachter** | ein Mandant | alles sehen, nichts ändern |

Ein Benutzer kann in jedem Mandanten eine andere Rolle haben. Benutzer und Mandanten verwalten
Superadmins unter **Administration**.

## Einladungen und Anmeldung

**Administration › Benutzer › Benutzer einladen**: Name, E-Mail, die **Sprache** des Benutzers
(für die Einladungs-E-Mail und die erste Anmeldung) und seine Rollen. Er erhält einen einmaligen
Link (72 Stunden gültig), um ein Kennwort festzulegen und die **Zwei-Faktor-Authentifizierung**
einzurichten, die Pflicht ist. Ist keine E-Mail eingerichtet, kopieren Sie den Link aus dem Dialog
und senden ihn selbst.

Telefon verloren? Melden Sie sich mit einem der **Wiederherstellungscodes** an. Ein Administrator
kann im Dialog des Benutzers auch **2FA zurücksetzen** (das Kennwort bleibt) oder **Kennwort und
2FA zurücksetzen**; der Benutzer erhält einen neuen Link.

Konten werden nach 5 fehlgeschlagenen Kennwort- oder Code-Versuchen für 15 Minuten gesperrt.

## Benutzer deaktivieren und löschen

**Deaktivieren** sperrt die Anmeldung sofort und behält das Konto. **Benutzer löschen** entfernt
das Konto mit seinen Sitzungen, Rollen und 2FA; Vorfälle, Notizen und das Audit-Protokoll behalten
ihren Verlauf (angezeigt als *name@example (gelöscht)*). Sie können weder sich selbst noch den
letzten aktiven Superadmin löschen.

## API-Tokens

**API-Zugriff** (Mandanten-Admins je Mandant, Infrastruktur-Admins im Bereich Globale
Infrastruktur) erstellt Tokens mit einer Berechtigung:

| Berechtigung | Erlaubt |
|---|---|
| **Lesen** | Monitore, Vorfälle und Berichte anzeigen |
| **Bedienen** | zusätzlich pausieren/fortsetzen, bestätigen, Notizen, Tests |
| **Verwalten** | zusätzlich erstellen, ändern und löschen |

Ein Token gilt nur in seinem Bereich, kann ablaufen, kann widerrufen werden und kann nie
Benutzer, Mandanten, Einstellungen oder andere Tokens verwalten. Es wird einmal angezeigt;
gespeichert wird nur ein Hash.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

Die API-Dokumentation ist unter **/api/docs** eingebaut (funktioniert auch offline); die
maschinenlesbare Spezifikation liegt unter `/api/openapi.json`.

## Audit-Protokoll

**Administration › Audit-Protokoll** zeichnet Anmeldungen und Fehlversuche, Sperren,
Einladungen und jede Änderung an Benutzern, Mandanten und Einstellungen mit Werten vorher und
nachher auf.

## Ihr Profil

Unter **Profil** (unten in der Seitenleiste) ändern Sie Namen und Passwort, ziehen die
Zwei-Faktor-Authentifizierung auf ein neues Telefon um (das alte funktioniert, bis Sie das neue
bestätigen), erhalten neue Wiederherstellungscodes und sehen Ihre Sitzungen und melden die anderen ab.
Eine Änderung von Passwort oder Telefon meldet Ihre anderen Sitzungen ab.

Die Reiter: **Ihre Angaben**, **Passwort**, **Zwei-Faktor-Authentifizierung**, **Sitzungen** und **Bereitschaft** (Ihre Bereitschaftsschichten, Kontaktwege und Benachrichtigungsschritte). Die Adresse behält den geöffneten Reiter, zum Beispiel `/profile#sessions`.

**Kontaktwege** sind, wie Fudo Sie persönlich erreicht, zum Beispiel in der Bereitschaft: E-Mail, ein
Microsoft-Teams-Workflow, der in Ihren Chat schreibt, oder Telegram (sobald ein Administrator unter
*Einstellungen* einen Telegram-Bot verbindet). Jeder Kontaktweg wird zuerst mit einem 6-stelligen Code
bestätigt. **Ihre Benachrichtigungsschritte** legen fest, welche Wege wann genutzt werden, zum Beispiel
sofort E-Mail und nach 5 Minuten Telegram, bis der Vorfall bestätigt ist.

## Teams und Zuständigkeit

**Teams** fasst die Verantwortlichen für Anwendungen und Infrastruktur zusammen, zum Beispiel ein
*Datenbank-Team* in einem Mandanten oder ein *Storage-Team* im Bereich Globale Infrastruktur.
Mitglieder sind **Mitglied** oder **Leitung**; hinzufügen lassen sich nur Personen mit Zugriff auf den
Bereich des Teams.

Wählen Sie das **Besitzer-Team** auf der Seite einer Anwendung oder eines Assets. Jeder Vorfall zeigt
dann Besitzer und Leitung, auch Vorfälle von Monitoren (über ihr Asset oder ihre Anwendung), ebenso
die Nachberichte. Elemente eines Mandanten gehören Teams dieses Mandanten, gemeinsame Infrastruktur
globalen Teams. Bereitschaftspläne werden je Team festgelegt.
