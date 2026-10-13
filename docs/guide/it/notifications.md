<!-- translation-of: notifications.md#5487cd95 -->
# Notifiche

## Canali

**Notifiche › Aggiungi canale**. Integrati: **Email** (richiede il server SMTP delle
Impostazioni), **Microsoft Teams** (webhook di Workflows), **Slack** (incoming webhook) e
**Webhook (JSON)**. Oltre 100 altri (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover,
Signal, Twilio e altri gateway SMS, Mattermost, Matrix, Google Chat, …) provengono dai provider di
notifica di Uptime Kuma. **Invia test** verifica un canale; **Registro** mostra ogni invio e
perché un canale è stato saltato.

I messaggi di chat iniziano con **[Fudo]**, così si distinguono facilmente da altri strumenti che
scrivono nella stessa chat.

## Quali incidenti riceve un canale

| Impostazione | Effetto |
|---|---|
| **Invia** | *Tutti gli incidenti di questo tenant* (predefinito) o *Solo gli incidenti delle applicazioni selezionate* |
| **Gravità minima** | Minore e superiori (tutti), Maggiore e Critico, o solo Critico |
| **Eventi** | apertura, conferma, risoluzione |
| **Salta gli incidenti causati da un altro incidente** | solo cause principali, non gli incidenti impattati collegati |
| **Promemoria finché non confermato** | ripete ogni N minuti finché nessuno conferma |
| **Lingua dei messaggi** | la lingua del canale; predefinita: quella dell’organizzazione (Impostazioni) |

I canali di un tenant ricevono i suoi incidenti, compresi quelli causati dall’infrastruttura
condivisa (con la causa principale nel messaggio). I canali globali ricevono gli incidenti
dell’infrastruttura; con **tutti i tenant** (un canale NOC) ricevono anche gli incidenti di ogni
tenant, tranne quelli causati da un incidente dell’infrastruttura già ricevuto.

**Per applicazione:** un canale con *Solo gli incidenti delle applicazioni selezionate* viene
informato solo di quelle. Sceglile nel modulo del canale, o nella pagina di un’applicazione, nella
sua scheda **Notifiche**, che avvisa anche quando gli incidenti di un’applicazione non arrivano a
nessun canale.

## Escalation

Dai a un canale un ritardo (**Escalation: non confermato dopo 15 min**) e diventa un passo di
escalation: viene avvisato solo se dopo quel tempo l’incidente è ancora aperto, non confermato e
non silenziato, e poi ne riceve la conferma e la risoluzione. Concatenane diversi: Teams subito →
SMS di reperibilità dopo 15 minuti → responsabile dopo 60 minuti.

## Consegna

I messaggi passano da una coda di uscita con nuovi tentativi (dopo 1, 5 e 15 minuti) e un limite
di frequenza per canale, così una valanga di incidenti non fa bloccare il tuo bot o il relay di
posta.

## Contenuto del webhook

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Imposta un **segreto di firma** per ricevere `X-Fudo-Signature: sha256=<HMAC del corpo>`. Il
contenuto resta in inglese (è un formato stabile per le integrazioni); `incident.titleParts`
riporta il titolo come codici di messaggio, se vuoi tradurlo tu.

## Reperibilità

I team avvisano le persone per gli incidenti dei loro elementi. In **Team › Reperibilità** metti i membri
nell’ordine di rotazione, scegli la durata del turno (un giorno, una settimana, due settimane o un numero
di giorni), l’ora del cambio e il fuso orario, e gli incidenti per cui avvisare. I passi di
**escalation** dicono chi viene avvisato e quando, dall’apertura dell’incidente: per esempio subito la
persona reperibile, dopo 15 minuti la successiva e dopo 30 i referenti. Le **sostituzioni** permettono a
qualcun altro di coprire un periodo, come uno scambio o le ferie.

Ogni persona viene raggiunta con i propri passi di notifica (vedi *Il tuo profilo*), o via email
all’indirizzo di accesso se non ne ha. Gli avvisi si fermano appena qualcuno conferma l’incidente e si
sospendono mentre è silenziato. La pagina dell’incidente mostra chi è stato avvisato e cosa è stato
inviato; il tuo profilo mostra i tuoi prossimi turni.

I messaggi di reperibilità contengono i link **Conferma** e **Apri in Fudo** (imposta `PUBLIC_URL`). Conferma apre una pagina dove un tocco conferma l’incidente a tuo nome, senza accedere; aprire soltanto il link non cambia nulla, quindi anteprime dei link e scanner email non possono confermare per errore. Ogni link funziona una volta, per 24 ore, finché l’incidente è aperto, e solo se il tuo ruolo permette di confermare incidenti.
