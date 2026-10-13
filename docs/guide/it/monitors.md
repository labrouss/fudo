<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitor

## L’elenco

L’elenco dei monitor mostra la **risorsa** di ogni monitor e le **applicazioni** di cui fa parte (un’appartenenza facoltativa ha un bordo tratteggiato); entrambi sono link. Fai clic sull’intestazione di una colonna per ordinare (di nuovo per invertire, una terza volta per l’ordine predefinito); Fudo ricorda l’ordinamento in questo browser. Il filtro cerca in nomi, destinazioni, tag, risorse e applicazioni; ignora maiuscole e accenti, e ogni parola deve corrispondere. Gli altri elenchi lunghi (risorse, incidenti, utenti, manutenzioni, canali e altri) si ordinano e filtrano allo stesso modo.

## Tipi di monitor

| Categoria | Tipo | Controlla |
|---|---|---|
| Web | **HTTP(S)** | intervalli di codici di stato, parola chiave presente/assente, valore JSON (`$.status`), intestazioni, corpo, tempo di risposta |
| | **Certificato TLS** | attendibilità, nome host, giorni alla scadenza (Degradato entro N giorni, Fuori servizio a scadenza) |
| Rete | **Ping** | raggiungibilità, latenza, perdita di pacchetti |
| | **Porta TCP** | la porta accetta connessioni |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, risposta attesa facoltativa, resolver scelto |
| | **SNMP** | legge un OID (v1, v2c, v3) e confronta il valore o, per i contatori, la sua variazione al secondo |
| | **Interfaccia di rete (SNMP)** | una porta di switch, router o firewall: stato del collegamento, traffico in entrata e in uscita (bit/s e % della velocità del collegamento), errori; in grafico nel tempo |
| | **NTP** | raggiungibilità, stratum, scarto dell’orologio |
| | **SMTP** | saluto 220, EHLO, STARTTLS facoltativo |
| | **LDAP / Active Directory** | la directory risponde (Active Directory: degradato finché il domain controller non è sincronizzato), oppure un account accede e una ricerca trova voci; segnala account bloccati, scaduti e disattivati |
| | **Scadenza dominio** | scadenza della registrazione tramite RDAP (con WHOIS di riserva) |
| Database | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | si connette, query facoltativa con risultato atteso |
| Sistemi | **Comando SSH** | codice di uscita o output (contiene, esatto, regex), blocco facoltativo della chiave host |
| | **Container Docker** | in esecuzione, e integro se ha un controllo di integrità |
| Infrastruttura | **VM vCenter** | stato di alimentazione, VMware Tools (vCenter 6.7, 7, 8) |
| | **Stato HPE iLO / Redfish** | stato dell’hardware del server dal BMC (iLO 4/5/6, iDRAC, altri BMC Redfish) |
| | **Temperatura di ingresso (iLO / Redfish)** | temperatura dell’aria che entra nel server, cioè davanti al rack: degradato da 27 °C, non disponibile da 32 °C (ASHRAE), con grafico |
| | **Temperatura della sala** | tutti i sensori di ingresso con il tag `room:<name>` insieme: non disponibile quando diversi sono caldi (problema di raffreddamento), degradato quando uno è caldo o diversi salgono rapidamente |
| Passivo | **Heartbeat push** | un job chiama un URL; Fuori servizio quando smette di chiamare |
| | **Trap SNMP** | trap inviati da un dispositivo (v1, v2c): fuori servizio o degradato finché un trap di problema è aperto; si cancella da solo, con un trap di chiusura o a mano |

**Testa ora** esegue un controllo una volta dal server Fudo senza salvarlo, per regolarlo prima
che inizi a mandare avvisi.

## Evitare i falsi allarmi

- **Fuori servizio dopo N errori**: un monitor diventa Fuori servizio solo dopo N controlli falliti
  di fila, riprovando nel frattempo con l’*intervallo di ripetizione*, più rapido.
- **Operativo dopo M successi**: torna operativo solo dopo M controlli riusciti di fila.
- **Degradato oltre**: le risposte lente contano come Degradato invece che Fuori servizio.

## Credenziali

Password, community SNMP, chiavi SSH e simili sono salvate **cifrate** e non vengono più mostrate,
esportate né restituite dall’API; solo il worker le decifra per eseguire un controllo. Usa account
in sola lettura: un ruolo vCenter *Read-only*, un utente iLO con il privilegio *Login*, un utente
di database solo con `CONNECT`/`SELECT`.

### Credenziali condivise

Quando molti monitor accedono con lo stesso account (un utente iLO in sola lettura per tutti i
server, una community SNMP per gli switch), salvalo una volta in **Credenziali** e lascia che i
monitor lo usino. Quando la password cambia, modifica la credenziale una sola volta: ogni monitor
che la usa ricontrolla subito con il nuovo valore.

- Una credenziale ha un tipo: *Account e password*, *Chiave SSH*, *Community SNMP (v1, v2c)* o
  *Utente SNMPv3*. Nel modulo del monitor, i tipi che accedono offrono **Inseriscilo qui** o **Usa
  una credenziale condivisa**; con una credenziale, i campi dell’account spariscono dal modulo.
- Le credenziali appartengono a un ambito: i monitor di un tenant possono usare solo le credenziali
  di quel tenant, e i monitor dell’infrastruttura globale solo quelle globali.
- I segreti sono in sola scrittura, come quelli di un monitor: salvati cifrati, mai mostrati,
  esportati o restituiti. L’elenco mostra l’account e quali monitor lo usano.
- **Stesso account in più monitor**: la pagina elenca i monitor che memorizzano già lo stesso
  account e la stessa password. Dai un nome al gruppo e scegli **Crea credenziale condivisa**: la
  password viene copiata sul server, nessuno deve conoscerla.
- **Usa per…** collega altri monitor a una credenziale; il loro account e la loro password vengono
  rimossi. Una credenziale in uso non si può eliminare né cambiare tipo.
- Un monitor che smette di usare una credenziale ha di nuovo bisogno di una propria password.
- Nella [configurazione come codice](configuration-as-code.md) un monitor indica la sua
  credenziale (`credential: iLO read-only`); la credenziale si crea nell’interfaccia. Anche
  l’aggiunta in blocco di controlli di temperatura può usarla.
- Ogni modifica è nel registro di audit, con i nomi dei segreti cambiati, mai i loro valori.

## Monitor push

Un monitor push aspetta che il tuo job lo chiami. Dopo il salvataggio, la sua pagina mostra l’URL:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Diventa Fuori servizio quando non arriva nessuna chiamata entro l’intervallo più il periodo di
tolleranza. **Nuovo URL** sostituisce il token se è trapelato.

## Aggiunta in blocco e modelli

**Monitor › Aggiunta in blocco / modelli** crea controlli per molti host insieme:

1. incolla un host o un URL per riga (o carica un CSV con `name,host,port`),
2. scegli un **modello**, per esempio *server Windows* (ping, RDP, WinRM), *server Linux*,
   *HPE iLO*, *dispositivo di rete*, *host ESXi*, *vCenter*, *SQL Server*, *storage* o
   *applicazione web*, oppure un singolo tipo di controllo,
3. facoltativamente crea una risorsa per riga, falle dipendere da una risorsa esistente e
   aggiungile a un’applicazione.

Prima di applicare mostra un’anteprima di tutto ciò che verrà creato.

## Note per tipo

- **VM vCenter** trova da sola la versione giusta dell’API e riusa le sessioni (un accesso per
  vCenter ogni 20 minuti). Il controllo di VMware Tools richiede vCenter 7.0 o successivo.
- **HPE iLO / Redfish** indica il componente guasto su HPE iLO (ventole, alimentatori, storage,
  ridondanza). Warning → Degradato, Critical o spento → Fuori servizio.
- **Comando SSH**: imposta l’*Impronta della chiave host* (`ssh-keyscan host | ssh-keygen -lf -`)
  in modo che una chiave del server cambiata venga segnalata invece che accettata.
- **Container Docker** usa il socket Docker locale (montalo nel container del worker, vedi
  `docker-compose.yml`) o l’URL di un’API Docker remota.
- **Scadenza dominio**: alcuni registri nazionali non pubblicano né RDAP né WHOIS; Fudo lo segnala
  come Degradato con una spiegazione.
- **Ping** richiede la capability `NET_RAW` nel container del worker, e in quello dell’API per
  **Testa ora** (entrambe impostate in `docker-compose.yml`).

## Trap SNMP

Indirizza i trap SNMP (v1 o v2c) dei tuoi dispositivi al server Fudo, porta UDP 162. La pagina
**Trap** mostra se i trap arrivano e ogni trap con i suoi campi.

- Un monitor **Trap SNMP** raccoglie i trap dei dispositivi indicati in **Da**: indirizzi, nomi
  host o intervalli IPv4 (`10.0.12.0/24`). Con una **Community** (o una credenziale condivisa di
  tipo community SNMP) raccoglie solo i trap che la riportano; la community non viene mai
  salvata.
- **Trap di problema**: quelli standard (link down, avvio a freddo e a caldo, errore di
  autenticazione), solo i trap elencati (nomi o OID; un OID include anche tutto ciò che sta sotto,
  es. il prefisso enterprise di un produttore) o qualsiasi trap. *Solo se un campo contiene*
  limita ai trap con un testo come `Critical`.
- Finché un problema è aperto il monitor è **Fuori servizio** (o Degradato, se lo scegli);
  incidente, notifiche e reperibilità funzionano come per ogni controllo, entro un secondo dal
  trap.
- I problemi sono tenuti per trap e interfaccia: un link down su due porte sono due problemi, e il
  **link up** di una porta chiude solo il problema di quella porta.
- **I problemi si cancellano** automaticamente quando per un po’ non arrivano nuovi trap (30
  minuti predefiniti), oppure solo a mano: la pagina del monitor elenca i trap aperti con
  **Cancella** (fino al prossimo trap corrispondente). Anche i *trap di chiusura* chiudono i
  problemi, es. il trap «condizione risolta» di un produttore.
- Un trap **che nessun monitor raccoglie** viene comunque conservato: presso il tenant dell’asset
  con quell’indirizzo, altrimenti nell’ambito dell’infrastruttura globale. **Crea monitor** nella
  pagina Trap prepara un monitor per il suo dispositivo.
- Un dispositivo che inonda di trap viene limitato (50 al secondo, picchi di 500); i trap
  scartati sono contati nella pagina Trap dell’ambito globale. I trap sono conservati 30 giorni
  (Impostazioni › Conservazione dei dati).

## Interfacce di rete

Un monitor **Interfaccia di rete (SNMP)** controlla una porta di uno switch, router o firewall.

- **Trova interfacce…** (dopo l’host e l’accesso SNMP, o una credenziale condivisa) elenca le
  interfacce del dispositivo con descrizione, velocità e stato. Scegline una o, quando aggiungi,
  selezionane più d’una: ognuna diventa un monitor con le impostazioni del modulo, con il nome
  dell’interfaccia.
- L’interfaccia è ricordata per **nome** (o descrizione o alias), non per numero, perché alcuni
  dispositivi rinumerano le interfacce dopo un riavvio. Funziona anche un numero.
- Il **traffico** è la differenza tra due letture dei contatori a 64 bit: il primo controllo legge
  due volte a due secondi di distanza; i successivi usano la lettura conservata dal controllo
  precedente. Dopo un riavvio del dispositivo la coppia viene scartata, quindi niente falsi picchi.
  I dispositivi senza contatori a 64 bit (SNMP v1) usano quelli a 32 bit, poco affidabili oltre
  circa 100 Mbit/s con un intervallo di un minuto.
- **Stato**: collegamento interrotto → Fuori servizio; testing o dormant → Degradato; una porta
  disabilitata di proposito è Operativa (o Fuori servizio, se lo scegli). La direzione più carica
  sopra *Degradato da utilizzo* (80 % predefinito) → Degradato, sopra *Fuori servizio da utilizzo*
  (disattivato di default) → Fuori servizio; errori al minuto sopra il limite → Degradato. Se il
  dispositivo riporta una velocità errata (un tunnel, un circuito a banda limitata), imposta
  *Velocità del collegamento*.
- La pagina del monitor mostra il traffico in entrata e in uscita con la linea di Degradato.
- *Confronta: la sua variazione al secondo* del monitor **SNMP** fa lo stesso per qualsiasi
  contatore (frame di una porta SAN, sessioni di un firewall, eventi di un UPS).

## Temperatura del data center

**Temperatura** mostra ogni sensore di temperatura di ingresso, raggruppato per tag `room:<name>` e ordinato dal più caldo, con il suo rack (`rack:<name>`), il valore attuale, le ultime 6 ore, la variazione su 15 minuti e l’intervallo di 24 ore. **Aggiungi sensori** li crea per un elenco di indirizzi iLO (o altri BMC Redfish) con un account condiviso di sola lettura.

Un sensore diventa degradato anche quando la sua temperatura **sale rapidamente** (per impostazione predefinita 3 °C in 15 minuti), pur restando sotto le soglie: il primo segnale di un guasto al raffreddamento. **Crea avviso di sala** aggiunge un monitor *Temperatura della sala*: non disponibile quando 3 sensori sono caldi, degradato quando uno è caldo o 2 salgono rapidamente. Apre incidenti come ogni monitor, quindi proprietari, reperibilità e pagine di stato funzionano anche per lui.
