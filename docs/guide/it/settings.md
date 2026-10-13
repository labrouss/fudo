<!-- translation-of: settings.md#401e7e53 -->
# Impostazioni

**Impostazioni** (in fondo alla barra laterale) contiene le tue preferenze personali, per tutti, e
le impostazioni di sistema, per i superadmin.

Ogni sezione è una scheda. L'indirizzo mantiene la scheda aperta (per esempio `/settings#retention`), quindi una scheda si può salvare nei preferiti o inviare come link.

## Le tue preferenze

- **Lingua dell’interfaccia**: 13 lingue, compreso l’arabo con layout da destra a sinistra. Viene
  salvata nel tuo profilo, quindi ti segue in ogni browser. Si traducono anche i titoli degli
  incidenti e i risultati dei controlli.
- **Tema**: **Sistema** (segue la modalità chiara o scura del sistema operativo), **Chiaro**,
  **Scuro**, **Monokai**, più gli eventuali temi aggiunti dal tuo amministratore.

## Impostazioni di sistema (superadmin)

### Lingua delle notifiche

**Lingua predefinita** di notifiche e report pianificati. Ogni canale e ogni pianificazione può
usarne una propria; le email a una persona (inviti, reimpostazioni) usano la lingua di quella
persona. Non cambia l’interfaccia: ognuno la sceglie in *Preferenze*.

### Email (SMTP)

Usata per inviti, notifiche via email e report pianificati.

| Campo | Note |
|---|---|
| Host SMTP, porta | 587 (STARTTLS) o 465 (*Usa TLS dall’inizio*); 25 per un relay interno |
| Nome utente, password | facoltativi; la password è salvata cifrata e non viene più mostrata |
| Indirizzo del mittente | p. es. `fudo@corp.local` |
| **Accetta certificati autofirmati** | per un relay locale con certificato autofirmato o interno: la connessione resta cifrata, si salta solo la verifica del certificato |

**Invia email di test** indica il motivo preciso quando qualcosa non va: un certificato non
attendibile, una password errata, un server non raggiungibile o una modalità TLS che non
corrisponde alla porta.

## Per gli amministratori

Nuove lingue e nuovi temi si aggiungono mettendo file in cartelle, senza ricompilare; vedi
`locales/README.md` e `themes/README.md` nel repository.

## Conservazione dei dati

**Impostazioni › Conservazione dei dati** (superadmin) stabilisce per quanto tempo si conserva ogni tipo di dati e mostra lo spazio occupato: risultati grezzi dei controlli, riepiloghi orari e giornalieri, storico degli stati, incidenti risolti, registro delle notifiche, registro di audit e finestre di manutenzione concluse. I dati vecchi vengono rimossi ogni ora, poco alla volta. Dei minimi proteggono ciò che Fudo mostra (grafici a 90 giorni, report di disponibilità, pagine di stato), e l’ultimo cambiamento di stato prima del limite viene sempre conservato, così la disponibilità resta esatta. Gli incidenti aperti e le notifiche ancora da inviare non vengono mai rimossi.
