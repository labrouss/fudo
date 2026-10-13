<!-- translation-of: discovery.md#cb4482b3 -->
# Rilevamento

Il **rilevamento** trova i dispositivi della vostra infrastruttura e propone per ciascuno un asset
e dei monitor. Non viene creato nulla finché non scegliete: esaminate ciò che è stato trovato,
modificate nomi e monitor e create i dispositivi che volete nell'ambito che volete.

Il rilevamento funziona nell'**ambito dell'infrastruttura globale** (superamministratori e
amministratori dell'infrastruttura). La scansione la esegue il worker, che quindi deve poter
raggiungere in rete ciò che rilevate; avvisate il team di rete prima di scansionare una rete.

## Origini

| Origine | Trova | Richiede |
|---|---|---|
| **Scansione di sottorete** | ogni dispositivo che risponde in una rete: ping, alcune porte TCP (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP e, via HTTPS, Redfish (iLO, iDRAC) e l'API vSphere (ESXi, vCenter) | reti (`10.0.12.0/24`), intervalli (`10.0.20.10-60`), indirizzi o nomi host, al massimo 4096 indirizzi; facoltativamente credenziali SNMP |
| **Inventario vCenter** | il vCenter, i suoi host ESXi (etichettati `cluster:<nome>`) e le VM, con indirizzo e sistema operativo di ogni VM forniti da VMware Tools; ogni VM dipende dal suo host | il vCenter e un account in sola lettura (credenziale condivisa) |
| **Vicini degli switch (LLDP/CDP)** | chi è collegato a quale porta di switch; server, host ESXi e storage dietro una porta dipendono da quello switch, i collegamenti tra switch vengono elencati | gli switch e credenziali SNMP |
| **HPE OneView** | frame Synergy, moduli di calcolo con il loro indirizzo iLO, interconnect; ognuno dipende dal suo frame | l'appliance OneView e un account in sola lettura |

Le credenziali sono credenziali condivise dell'ambito globale (**Credenziali**): community SNMP o
utenti SNMPv3 per la scansione di sottorete e i vicini degli switch, un account con password per
vCenter e OneView. Le legge solo il worker.

## Come viene riconosciuto un dispositivo

La scansione di sottorete riconosce un dispositivo da ciò che risponde: un servizio Redfish è un
controller di gestione (iLO), l'API vSphere è ESXi o vCenter, SNMP indica il produttore (dal suo
numero enterprise) e il tipo di dispositivo (dalla descrizione: switch, switch FC, firewall,
router, storage array, Windows, Linux…), e le porte aperte aiutano quando non c'è altro (RDP e
SMB: Windows; SQL Server; SSH: Linux). Il nome viene da SNMP, dal DNS inverso o dal certificato.

Ogni tipo propone un modello di monitor (per esempio *HPE iLO / BMC* o *Host VMware ESXi*) e un
tipo di asset. Cambiatelo per dispositivo: un altro modello, **Solo ping** o **Solo asset**
(nessun monitor, ad es. per un frame o una VM senza indirizzo).

## Esaminare e creare

- L'elenco mostra per ogni dispositivo indirizzo, nome (modificabile), a cosa somiglia
  (produttore, modello, dettagli come porte aperte, descrizione SNMP, cluster, porta dello switch)
  e i monitor proposti.
- I dispositivi **noti** — in qualche ambito esiste un asset con quell'indirizzo (o, senza
  indirizzo, con quel nome), oppure dei monitor controllano quell'indirizzo — sono nascosti;
  togliete la spunta da *Nascondi i dispositivi noti* per vederli e sapere dove si trovano.
- Spuntate i dispositivi, scegliete **Crea in** (l'ambito globale o un tenant) e tag facoltativi,
  poi **Anteprima**: la stessa anteprima di un'importazione di configurazione, con ogni asset e
  monitor da creare. **Crea** la applica.
- Le dipendenze vengono mantenute quando entrambi i dispositivi sono creati insieme, o quando
  quello da cui si dipende esiste già in quell'ambito (o nell'ambito globale).
- Un rilevamento in corso può essere fermato; quelli terminati possono essere eliminati (ciò che è
  stato creato resta).
