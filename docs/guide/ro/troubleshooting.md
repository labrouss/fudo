<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Depanare

### Am primit o notificare, dar lista de incidente e goală

- **Alt chiriaș**: lista arată domeniul ales în bara laterală. Un canal cu *toți chiriașii* primește
  incidentele fiecărui chiriaș; schimbați chiriașul ca să le vedeți.
- **Deja rezolvat**: întreruperile scurte deschid și închid un incident în câteva minute; uitați-vă
  la *Rezolvat*.
- **Nu e de la Fudo**: mesajele de chat Fudo încep cu **[Fudo]** și nu conțin niciodată coduri de
  eroare brute precum `EHOSTUNREACH`. Dacă alt instrument de monitorizare (de exemplu Uptime Kuma)
  scrie încă în același chat, notificarea vine de acolo. **Jurnalul** canalului arată tot ce a
  trimis Fudo.

### Un monitor eșuează cu „Gazdă inaccesibilă” sau „Timp expirat”

Verificarea rulează din containerul **worker** al Fudo, nu de pe calculatorul dvs. Asigurați-vă că
gazda worker-ului ajunge la țintă (rutare, firewall-uri). Pentru ping, containerele au nevoie de
capability-ul `NET_RAW` (setat în `docker-compose.yml`).

### „Certificatul serverului SMTP nu este de încredere”

Releul dvs. de e-mail folosește un certificat autosemnat sau intern. Activați **Acceptă certificate
autosemnate** în Setări › E-mail (SMTP).

### Tot ce e în spatele unui switch s-a făcut roșu deodată

Este de așteptat, iar Fudo se ocupă de asta: switch-ul este **Indisponibil** (cauza principală), iar
ce e în spatele lui este **Afectat**. Primiți un incident principal cu celelalte legate de el.
Asigurați-vă că dependențele sunt descrise (resursa *depinde de* switch), ca Fudo să știe.

### O schimbare programată a alertat persoana de gardă

Creați întâi o [fereastră de mentenanță](maintenance.md) pentru resursele vizate: verificările
continuă, dar notificările sunt suprimate și timpul nu contează la disponibilitate.

### Incidentele unei aplicații nu ajung la nimeni

Deschideți aplicația: cardul ei **Notificări** avertizează când niciun canal nu îi primește
incidentele (de exemplu când toate canalele sunt setate pe *Doar incidentele aplicațiilor selectate*
fără ea).

### Pagina afișează „Reconectare la actualizările live”

Browserul a pierdut conexiunea cu API-ul; paginile se actualizează din nou singure când revine. Dacă
persistă, verificați ca un proxy din fața Fudo să permită conexiuni de lungă durată (Server-Sent
Events) către `/api/live`.

### Mi-am pierdut telefonul

Conectați-vă cu un cod de recuperare sau rugați un administrator să vă **reseteze 2FA** pentru cont.
