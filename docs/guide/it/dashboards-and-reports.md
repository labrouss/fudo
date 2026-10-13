<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Dashboard e report

## Panoramica

Incidenti aperti, tempo medio di ripristino (MTTR, 30 giorni), monitor operativi e in errore,
applicazioni entro l’obiettivo SLA e una scheda per applicazione con la sua striscia di
disponibilità a 30 giorni. Le pagine si aggiornano in tempo reale (circa un secondo dopo una
modifica); la barra laterale mostra **Live** finché c’è connessione.

La **disponibilità** deriva dallo storico degli stati: il tempo fuori servizio e impattato conta
contro di essa; la manutenzione pianificata e il tempo prima del primo controllo no.

## Grafici

Ogni monitor mostra il suo tempo di risposta su 1 h, 6 h, 24 h, 7, 30 e 90 giorni (media, p95,
errori, manutenzione), gli ultimi controlli come striscia di battiti, i cambi di stato e i
risultati recenti.

## Report

**Report** mostra, per applicazione (o per risorsa condivisa nell’ambito Infrastruttura globale):
disponibilità 24/7 e in **orario lavorativo**, tempo fuori servizio, manutenzione pianificata,
incidenti, SLA raggiunto o mancato, MTTA (tempo di conferma) e MTTR (tempo di risoluzione).
Scegli la settimana scorsa, il mese scorso, gli ultimi 30 giorni o date a piacere, e scaricalo
come:

- **PDF**: nella tua lingua; i report in arabo sono impaginati da destra a sinistra,
- **CSV**: disponibilità e incidenti, UTF-8 per Excel, con nomi di colonna in inglese perché fogli
  di calcolo e script continuino a funzionare.

## Report pianificati

**Report › Nuova pianificazione** invia via email il PDF e/o il CSV ogni lunedì (settimana
precedente) o il giorno 1 (mese precedente) all’ora e nel fuso orario scelti, nella lingua della
pianificazione, tramite il server SMTP delle Impostazioni. **Invia ora** invia subito l’ultimo
periodo.

## Pagine di stato

**Pagine di stato › Nuova pagina di stato** mostra applicazioni, risorse e monitor scelti in una
pagina dedicata su `/status/<indirizzo>`, con lo stato complessivo, 90 giorni di disponibilità, gli
incidenti in corso e le manutenzioni. Ogni elemento ha un **nome visualizzato**, mostrato al posto del
nome interno; gli elementi dello stesso gruppo compaiono insieme. Le pagine di un tenant possono
includere l’infrastruttura condivisa.

- **Pubblica**: chiunque abbia il link, senza accedere. La pagina mostra solo nomi visualizzati e
  stati semplici (*Operativo, Degradato, Interruzione, Manutenzione*), mai nomi interni, cause,
  titoli di incidenti o nomi di manutenzioni.
- **Interna**: utenti che hanno effettuato l’accesso con accesso al tenant, che vedono anche i titoli
  degli incidenti e i nomi delle manutenzioni.

La pagina si aggiorna ogni minuto e usa la lingua e la modalità chiara o scura del visitatore.
