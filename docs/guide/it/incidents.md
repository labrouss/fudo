<!-- translation-of: incidents.md#4e781264 -->
# Incidenti

Fudo apre gli incidenti da solo quando qualcosa si guasta e li risolve al ripristino.

## Quando si apre un incidente

| Elemento | Apre un incidente quando | Gravità |
|---|---|---|
| **Applicazione** | è Fuori servizio, o Impattata da una causa non pianificata | dalla sua criticità: critica → Critico, alta → Maggiore, altre → Minore |
| **Risorsa** | è Fuori servizio (è una causa principale) | Maggiore |
| **Monitor** | è Fuori servizio e non fa parte di una risorsa o di un’applicazione | Minore |

Un incidente **Impattato** è collegato all’incidente della sua causa principale (*Causato da
INC-…*): uno switch guasto produce un incidente principale con incidenti impattati chiaramente
collegati, non una valanga di avvisi.

## Vita di un incidente

1. Si **apre** automaticamente e partono le notifiche (vedi [Notifiche](notifications.md)).
2. **Conferma** indica che qualcuno se ne occupa; promemoria ed escalation si fermano.
3. **Silenzia** zittisce le notifiche per un po’ (da 30 minuti a 1 giorno) senza confermare.
4. Si **risolve** automaticamente quando l’elemento si ripristina. Se si guasta di nuovo entro 5
   minuti, lo stesso incidente si **riapre** invece di crearne uno nuovo. Puoi anche risolverlo a
   mano.

La **cronologia** registra ogni passo: cambi di stato, notifiche, conferme e note.

## Note: condividi ciò che hai imparato

Aggiungi note alla cronologia come **Commento**, **Azione eseguita** o **Risoluzione**, con tag
(p. es. `supervisor`, `firmware`).

Le risoluzioni vengono riutilizzate: quando più avanti capita un incidente simile (stesso elemento,
stessa causa principale, tag in comune o testo simile), **Incidenti passati simili** mostra che
cosa l’ha risolto, e i suoi avvisi lo citano: *«L’ultima volta (INC-0041, 12 ago 2026) è stato
risolto così: …»*.

## Trovare gli incidenti

**Incidenti** elenca gli incidenti **aperti** dell’ambito scelto nella barra laterale; passa a
*Risolto* per lo storico e cerca per titolo, numero INC o tag. Gli incidenti di un altro tenant
compaiono quando passi a quel tenant (vedi [Risoluzione dei problemi](troubleshooting.md)).

## Report post-incidente

**Report post-incidente** su un incidente scarica un report in **PDF** o **Markdown** (per un wiki o un ticket): un riepilogo con gli orari e chi l’ha confermato e risolto, gli incidenti impattati, la risoluzione e le azioni eseguite, la cronologia, le notifiche inviate e gli incidenti passati simili. Usa la tua lingua e il tuo fuso orario, e si può creare anche mentre l’incidente è ancora aperto.
