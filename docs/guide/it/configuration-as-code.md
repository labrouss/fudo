<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Configurazione come codice

**Configurazione** esporta l’ambito corrente (risorse, monitor, applicazioni e le loro dipendenze)
in YAML e lo reimporta. Conservalo in git, copia la configurazione di un tenant in un altro, o
automatizzala tramite l’API.

```yaml
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    dependsOn: [Core-SW-01]          # shared assets are referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    asset: FIN-APPLIANCE-01          # the asset this monitor checks
    tags: [prod]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web, { monitor: ERP SQL, required: false }]
    notify: [ERP team]               # notification channels, by name
```

## Come funziona l’importazione

- **Prima un’anteprima**: elenca che cosa verrà creato o modificato, campo per campo, e segnala
  gli errori con il numero di riga. **Applica** è tutto o niente.
- **I file parziali sono sicuri**: un elemento del file fa fede per quell’elemento; ciò che non è
  nel file resta com’è.
- **Non inclusi**: canali di notifica e credenziali (contengono segreti) e finestre di
  manutenzione. I monitor push importati ricevono URL nuovi. Le applicazioni indicano i loro
  canali per nome in `notify`; senza `notify`, un’applicazione mantiene i canali attuali.
- **Credenziali condivise**: un monitor indica per nome quella che usa (`credential: iLO
  read-only`). La credenziale non viene esportata e deve già esistere nell’ambito di destinazione.

## Tramite l’API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Richiede un token API con il permesso **Gestione** (vedi [Utenti e accesso](users-and-access.md)).

## Importare da Uptime Kuma

**Configurazione › Importa da Uptime Kuma** legge il backup JSON di Uptime Kuma 1.x (*Impostazioni › Backup › Esporta*) o il file di database `kuma.db` delle versioni 1.x e 2.x (nella cartella dati di Kuma). Vedi prima un’anteprima; nulla cambia finché non importi.

I controlli HTTP, per parola chiave e JSON semplici, porta TCP, ping, DNS e push vengono importati con intervalli, tentativi, tag e stato di pausa; la scadenza dei certificati HTTPS diventa un monitor del certificato separato e i gruppi diventano applicazioni. Le notifiche diventano canali con le stesse impostazioni (quelle email usano il server di posta delle Impostazioni) e partono disattivate, salvo scelta diversa. Gli elementi il cui nome esiste già restano come sono, quindi importare di nuovo è sicuro. Tutto ciò che non si può importare fedelmente (per esempio monitor Docker o di database, o la modalità invertita) è elencato con il motivo.
