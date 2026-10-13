<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Risoluzione dei problemi

### Ho ricevuto un avviso, ma l’elenco degli incidenti è vuoto

- **Un altro tenant**: l’elenco mostra l’ambito scelto nella barra laterale. Un canale con *tutti i
  tenant* riceve gli incidenti di ogni tenant; cambia tenant per vederli.
- **Già risolto**: brevi interruzioni aprono e chiudono un incidente in pochi minuti; guarda in
  *Risolto*.
- **Non viene da Fudo**: i messaggi di chat di Fudo iniziano con **[Fudo]** e non contengono mai
  codici di errore grezzi come `EHOSTUNREACH`. Se un altro strumento di monitoraggio (per esempio
  Uptime Kuma) scrive ancora nella stessa chat, l’avviso viene da lì. Il **Registro** del canale
  elenca tutto ciò che Fudo ha inviato.

### Un monitor fallisce con «Host non raggiungibile» o «Timeout»

Il controllo viene eseguito dal container **worker** di Fudo, non dal tuo PC. Verifica che l’host
del worker raggiunga la destinazione (instradamento, firewall). Per il ping, i container hanno
bisogno della capability `NET_RAW` (impostata in `docker-compose.yml`).

### «Il certificato del server SMTP non è attendibile»

Il tuo relay di posta usa un certificato autofirmato o interno. Attiva **Accetta certificati
autofirmati** in Impostazioni › Email (SMTP).

### Tutto ciò che sta dietro uno switch è diventato rosso insieme

È previsto, e Fudo lo gestisce: lo switch è **Fuori servizio** (causa principale) e ciò che sta
dietro è **Impattato**. Ricevi un incidente principale con gli altri collegati. Assicurati che le
dipendenze siano modellate (la risorsa *dipende dallo* switch) perché Fudo possa saperlo.

### Una modifica pianificata ha avvisato la reperibilità

Crea prima una [finestra di manutenzione](maintenance.md) per le risorse interessate: i controlli
continuano, ma gli avvisi sono soppressi e il tempo non conta nella disponibilità.

### Gli incidenti di un’applicazione non arrivano a nessuno

Apri l’applicazione: la sua scheda **Notifiche** avvisa quando nessun canale ne riceve gli
incidenti (per esempio quando tutti i canali sono impostati su *Solo gli incidenti delle
applicazioni selezionate* senza di essa).

### La pagina mostra «Riconnessione agli aggiornamenti live»

Il browser ha perso la connessione con l’API; le pagine si aggiornano di nuovo da sole appena torna.
Se persiste, verifica che un proxy davanti a Fudo consenta connessioni di lunga durata (Server-Sent
Events) verso `/api/live`.

### Ho perso il telefono

Accedi con un codice di recupero, o chiedi a un amministratore di **reimpostare la 2FA** del tuo
account.
