<!-- translation-of: getting-started.md#ea57bfb7 -->
# Primii pași

Fudo vă arată dacă aplicațiile de business funcționează, **de ce** sunt indisponibile și ce a rezolvat
probleme asemănătoare înainte. Această pagină vă conduce de la o instalare nouă până la prima
notificare.

## 1. Prima conectare

După instalare (vedeți [Instalare](../../admin/installation.md)), deschideți Fudo în browser.
**Asistentul de configurare** cere:

1. numele organizației,
2. primul administrator (nume, e-mail, parolă de cel puțin 12 caractere),
3. autentificarea în doi pași: scanați codul QR cu o aplicație de autentificare (Microsoft
   Authenticator, Google Authenticator, 1Password, …) și **păstrați codurile de recuperare**,
4. opțional serverul de e-mail (SMTP), folosit pentru invitații, notificări și rapoarte. Îl puteți
   configura și mai târziu în **Setări**.

Autentificarea în doi pași este obligatorie pentru fiecare cont.

## 2. Creați un chiriaș

Un **chiriaș** este o unitate de business, de exemplu *Financiar* sau *Resurse umane*. Aplicațiile,
monitoarele și canalele de notificare ale lui sunt separate de cele ale altor chiriași. Mergeți la
**Administrare › Chiriași › Chiriaș nou**, apoi alegeți-l din selectorul din partea de sus a barei
laterale.

Infrastructura partajată (switch-uri de bază, matrice de stocare, clustere) aparține în schimb
domeniului **Infrastructură globală**; vedeți [Concepte](concepts.md).

## 3. Adăugați un monitor

**Monitoare › Adaugă monitor**, alegeți un tip (de exemplu *HTTP(S)* sau *Ping*), completați ținta și
apăsați **Testează acum** pentru a rula verificarea o dată, fără salvare. Salvați-l; rezultatele apar
într-un interval de verificare. Pentru multe gazde deodată folosiți **Adăugare în bloc / șabloane**;
vedeți [Monitoare](monitors.md).

## 4. Grupați monitoarele într-o aplicație

**Aplicații › Aplicație nouă**, apoi adăugați monitoarele care alcătuiesc serviciul (front-end web,
API, bază de date). Starea aplicației arată dacă serviciul funcționează și, dacă nu, de ce. Setați o
**țintă SLA** pentru a o urmări în rapoarte.

## 5. Primiți notificări

**Notificări › Adaugă canal**: e-mail, Microsoft Teams, Slack, un webhook JSON sau unul din peste 100
de alte canale (Telegram, PagerDuty, gateway-uri SMS, …). **Trimite test** verifică un canal. Vedeți
[Notificări](notifications.md).

## 6. Invitați-vă colegii

**Administrare › Utilizatori › Invită utilizator**: alegeți limba și rolul fiecăruia, pe chiriaș.
Primesc un link de unică folosință pentru a-și alege parola și a configura autentificarea în doi
pași. Vedeți [Utilizatori și acces](users-and-access.md).

## Ce urmează

- [Concepte](concepts.md): domenii, resurse, dependențe și cum găsește Fudo cauza principală
- [Incidente](incidents.md): ce se întâmplă când ceva se defectează
- [Depanare](troubleshooting.md): întrebări frecvente
