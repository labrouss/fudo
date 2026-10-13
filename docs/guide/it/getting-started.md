<!-- translation-of: getting-started.md#ea57bfb7 -->
# Per iniziare

Fudo ti dice se le tue applicazioni aziendali funzionano, **perché** sono fuori servizio e che
cosa ha risolto problemi simili in passato. Questa pagina ti accompagna da una nuova installazione
alla prima notifica.

## 1. Primo accesso

Dopo l’installazione (vedi [Installazione](../../admin/installation.md)), apri Fudo nel browser.
La **procedura guidata di configurazione** chiede:

1. il nome della tua organizzazione,
2. il primo amministratore (nome, email, password di almeno 12 caratteri),
3. l’autenticazione a due fattori: scansiona il codice QR con un’app di autenticazione (Microsoft
   Authenticator, Google Authenticator, 1Password, …) e **conserva i codici di recupero**,
4. facoltativamente il server di posta (SMTP), usato per inviti, notifiche e report. Puoi anche
   configurarlo più tardi in **Impostazioni**.

L’autenticazione a due fattori è obbligatoria per ogni account.

## 2. Crea un tenant

Un **tenant** è un’unità aziendale, per esempio *Finanza* o *Risorse umane*. Le sue applicazioni,
i suoi monitor e i suoi canali di notifica sono separati da quelli degli altri tenant. Vai in
**Amministrazione › Tenant › Nuovo tenant**, poi sceglilo nel selettore in cima alla barra
laterale.

L’infrastruttura condivisa (switch di core, storage, cluster) appartiene invece all’ambito
**Infrastruttura globale**; vedi [Concetti](concepts.md).

## 3. Aggiungi un monitor

**Monitor › Aggiungi monitor**, scegli un tipo (per esempio *HTTP(S)* o *Ping*), indica la
destinazione e premi **Testa ora** per eseguire il controllo una volta senza salvarlo. Salvalo; i
risultati compaiono entro un intervallo di controllo. Per molti host insieme usa **Aggiunta in
blocco / modelli**; vedi [Monitor](monitors.md).

## 4. Raggruppa i monitor in un’applicazione

**Applicazioni › Nuova applicazione**, poi aggiungi i monitor che compongono il servizio (front end
web, API, database). Lo stato dell’applicazione mostra se il servizio funziona e, se no, perché.
Imposta un **obiettivo SLA** per seguirlo nei report.

## 5. Ricevi le notifiche

**Notifiche › Aggiungi canale**: email, Microsoft Teams, Slack, un webhook JSON o uno degli oltre
100 altri (Telegram, PagerDuty, gateway SMS, …). **Invia test** verifica il canale. Vedi
[Notifiche](notifications.md).

## 6. Invita i colleghi

**Amministrazione › Utenti › Invita utente**: scegli la loro lingua e il loro ruolo per tenant.
Ricevono un link monouso per scegliere una password e configurare l’autenticazione a due fattori.
Vedi [Utenti e accesso](users-and-access.md).

## Dove andare dopo

- [Concetti](concepts.md): ambiti, risorse, dipendenze e come Fudo trova la causa principale
- [Incidenti](incidents.md): cosa succede quando qualcosa si guasta
- [Risoluzione dei problemi](troubleshooting.md): domande frequenti
