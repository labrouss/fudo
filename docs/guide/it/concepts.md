<!-- translation-of: concepts.md#61c26734 -->
# Concetti

## Ambiti: tenant e infrastruttura globale

| Ambito | Contiene | Gestito da |
|---|---|---|
| **Tenant** (uno per unità aziendale) | le sue applicazioni, monitor, risorse, canali e report | admin del tenant |
| **Infrastruttura globale** | risorse condivise (switch, storage, fabric FC, cluster) e i loro monitor | admin dell’infrastruttura e superadmin |

Scegli l’ambito nel selettore in cima alla barra laterale. I tenant vedono l’infrastruttura
condivisa in sola lettura e vi collegano i propri monitor e applicazioni: così un guasto dello
storage compare come causa in ogni applicazione che ne ha bisogno.

## Elementi di base

| Elemento | Che cos’è | Esempio |
|---|---|---|
| **Monitor** | un controllo eseguito a intervalli regolari | HTTPS su `erp.corp.local/health` |
| **Risorsa** | un elemento dell’infrastruttura, controllato dai suoi monitor | `Core-SW-01`, `SAN-A` |
| **Applicazione** | un servizio aziendale: monitor (membri) più l’infrastruttura di cui ha bisogno | *ERP Production* |
| **Dipendenza** | «questo ha bisogno di quello»: risorsa → risorsa, applicazione → risorsa | cluster ESXi → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Su un asset, **Aggiungi esistenti** vi collega monitor che avete già (uno che si trova su un altro asset viene spostato) e **Nuovo monitor** apre il modulo del monitor per quell'asset. Un tenant può anche collegare i propri monitor a un asset globale condiviso; **Rimuovi** toglie un monitor dall'asset e lo conserva.

## Stati

| Stato | Significato |
|---|---|
| **Operativo** | funziona |
| **Degradato** | funziona, ma lento o in parte (p. es. un membro facoltativo è fuori servizio) |
| **Fuori servizio** | si guasta, e nulla di ciò da cui dipende lo spiega: è una **causa principale** |
| **Impattato** | si guasta **perché** qualcosa da cui dipende è fuori servizio; gli avvisi indicano la causa principale |
| **A rischio** | funziona, ma qualcosa da cui dipende ha un problema |
| **Manutenzione** | in una finestra di manutenzione pianificata: non conta nella disponibilità |
| **In attesa** | ancora nessun risultato |

## Come Fudo trova la causa principale

| Situazione | Risultato |
|---|---|
| I controlli di una risorsa falliscono e nulla da cui dipende è fuori servizio | **Fuori servizio**: causa principale, con un proprio incidente |
| I suoi controlli falliscono **e** qualcosa da cui dipende è fuori servizio | **Impattato da** quella causa principale: niente valanga di avvisi |
| I suoi controlli riescono ma qualcosa da cui dipende è fuori servizio | mantiene il suo stato, segnato **A rischio** |
| Qualcosa da cui dipende è in manutenzione pianificata | **Impattato dalla manutenzione** (pianificata, esclusa dalla disponibilità) |

Un’applicazione è sana quando lo sono i suoi membri, secondo la sua regola: **tutti i membri
obbligatori operativi**, **almeno uno** o **almeno N su M** (per servizi ridondanti). I membri
obbligatori decidono lo stato; quelli facoltativi possono solo renderla *Degradata*.

**E se questo si guasta?** su una risorsa prevede quali applicazioni andrebbero fuori servizio, e
quali reggerebbero grazie alla ridondanza, prima di fermarla per un intervento.

La pagina **Topologia** disegna il quadro completo con lo stato in tempo reale: passa sopra un
elemento per seguirne le dipendenze; *Solo problemi* mostra cosa si guasta e cosa ne dipende.
