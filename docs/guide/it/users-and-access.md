<!-- translation-of: users-and-access.md#c2bf850f -->
# Utenti e accesso

## Ruoli

| Ruolo | Dove | Può |
|---|---|---|
| **Superadmin** | ovunque | tutto, compresi utenti, tenant e impostazioni |
| **Admin dell’infrastruttura** | ambito Infrastruttura globale (e ogni tenant) | gestire l’infrastruttura condivisa e i dati di tutti i tenant |
| **Admin del tenant** | un tenant | gestire il tenant: monitor, risorse, applicazioni, canali, report, token API |
| **Operatore** | un tenant | vedere tutto; mettere in pausa, riprendere e testare i monitor, confermare, silenziare e risolvere incidenti, aggiungere note |
| **Visualizzatore** | un tenant | vedere tutto, senza modificare nulla |

Un utente può avere un ruolo diverso in ogni tenant. I superadmin gestiscono utenti e tenant in
**Amministrazione**.

## Inviti e accesso

**Amministrazione › Utenti › Invita utente**: nome, email, la **lingua** dell’utente (per l’email di
invito e il primo accesso) e i suoi ruoli. Riceve un link monouso (valido 72 ore) per scegliere una
password e configurare l’**autenticazione a due fattori**, obbligatoria. Se l’email non è
configurata, copia il link dalla finestra e invialo tu.

Telefono perso? Accedi con uno dei **codici di recupero**. Un amministratore può anche
**Reimpostare la 2FA** (la password resta) o **Reimpostare password e 2FA** dalla finestra
dell’utente; l’utente riceve un nuovo link.

Gli account si bloccano per 15 minuti dopo 5 tentativi falliti di password o di codice.

## Disattivare ed eliminare utenti

**Disattiva** blocca subito l’accesso e conserva l’account. **Elimina utente** rimuove l’account con
sessioni, ruoli e 2FA; incidenti, note e registro di audit mantengono lo storico (mostrato come
*name@example (eliminato)*). Non puoi eliminare te stesso né l’ultimo superadmin attivo.

## Token API

**Accesso API** (admin del tenant per ogni tenant, admin dell’infrastruttura nell’ambito
Infrastruttura globale) crea token con un permesso:

| Permesso | Consente |
|---|---|
| **Lettura** | visualizzare monitor, incidenti e report |
| **Operatività** | anche mettere in pausa/riprendere, confermare, note, test |
| **Gestione** | anche creare, modificare ed eliminare |

Un token funziona solo nel suo ambito, può scadere, può essere revocato e non può mai gestire
utenti, tenant, impostazioni o altri token. Viene mostrato una sola volta; si salva solo un hash.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

La documentazione dell’API è integrata in **/api/docs** (funziona anche offline); la specifica
leggibile dalle macchine è su `/api/openapi.json`.

## Registro di audit

**Amministrazione › Registro di audit** registra accessi e tentativi falliti, blocchi, inviti e
ogni modifica a utenti, tenant e impostazioni, con i valori prima e dopo.

## Il tuo profilo

In **Profilo** (in fondo alla barra laterale) cambi nome e password, sposti l’autenticazione a due
fattori su un nuovo telefono (il vecchio funziona finché non confermi il nuovo), ottieni nuovi codici
di recupero, e vedi le tue sessioni per chiudere le altre. Cambiare password o telefono chiude le tue
altre sessioni.

Le schede: **I tuoi dati**, **Password**, **Autenticazione a due fattori**, **Sessioni** e **Reperibilità** (i tuoi turni di reperibilità, recapiti e passi di notifica). L'indirizzo mantiene la scheda aperta, per esempio `/profile#sessions`.

I **recapiti** sono il modo in cui Fudo ti raggiunge personalmente, per esempio quando sei reperibile:
email, un workflow di Microsoft Teams che scrive nella tua chat, o Telegram (quando un amministratore
collega un bot Telegram nelle *Impostazioni*). Ognuno viene prima confermato con un codice di 6 cifre.
**I tuoi passi di notifica** indicano quali recapiti usare e quando, per esempio email subito e
Telegram dopo 5 minuti, finché l’incidente non viene confermato.

## Team e responsabilità

**Team** raggruppa i responsabili di applicazioni e infrastruttura, per esempio un *Team database*
in un tenant o un *Team storage* nell’ambito Infrastruttura globale. Ognuno è **membro** o
**referente**; si possono aggiungere solo persone con accesso all’ambito del team.

Scegli il **team proprietario** nella pagina di un’applicazione o di una risorsa. Ogni incidente mostra
allora il proprietario e i referenti, anche gli incidenti dei monitor (tramite la loro risorsa o
applicazione), e così i report post-incidente. Gli elementi di un tenant appartengono ai team del
tenant, l’infrastruttura condivisa ai team globali. Le reperibilità si definiscono per team.
