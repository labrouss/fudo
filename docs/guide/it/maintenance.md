<!-- translation-of: maintenance.md#f097f823 -->
# Finestre di manutenzione

Pianifica gli interventi in modo che non avvisino nessuno e non contino nella disponibilità.

**Manutenzione › Pianifica manutenzione**: indica titolo, inizio e fine, note (richiesta di
modifica, contatto, piano di ripristino) e che cosa **copre**: risorse (con i loro controlli) e
monitor.

Durante la finestra:

- i controlli continuano, così vedi che cosa succede,
- i loro risultati sono **esclusi dalla disponibilità** e dallo SLA,
- gli **avvisi sono soppressi**,
- ciò che dipende da qualcosa in manutenzione lo mostra come causa (*Impattato dalla
  manutenzione*), così nessuno insegue un’interruzione pianificata.

**Termina ora** chiude una finestra in anticipo. Le finestre compaiono come *Pianificata*, *In
corso* o *Conclusa*.

Suggerimento: usa prima **E se questo si guasta?** sulla risorsa per vedere quali applicazioni
toccherà l’intervento.

## Manutenzione ricorrente

Scegli **Ripeti** quando pianifichi: ogni giorno, ogni settimana nei giorni scelti, oppure ogni mese,
in un giorno del mese (il 31 cade sull’ultimo giorno dei mesi più corti) o in un giorno di una
settimana (il *martedì della seconda settimana* è il Patch Tuesday di Microsoft). Gli orari sono nel
fuso scelto, quindi le 02:00 restano le 02:00 anche dopo il cambio dell’ora; un orario di fine
precedente all’inizio indica il giorno dopo.

Fudo crea le finestre dei prossimi 60 giorni, segnate con **Si ripete**. **Salta** rimuove
un’occorrenza, e modificare una finestra cambia solo quell’occorrenza. Modificare la serie cambia le
sue finestre future; eliminarla le rimuove, mentre quelle passate e in corso restano.
