<!-- translation-of: discovery.md#cb4482b3 -->
# Découverte

La **découverte** trouve les équipements de votre infrastructure et propose pour chacun un actif
et des sondes. Rien n'est créé tant que vous n'avez pas choisi : vous examinez ce qui a été
trouvé, ajustez les noms et les sondes, puis créez les équipements voulus dans le périmètre voulu.

La découverte s'exécute dans le **périmètre Infrastructure globale** (superadministrateurs et
administrateurs d'infrastructure). C'est le worker qui analyse ; il lui faut donc un accès réseau
à ce que vous découvrez. Prévenez votre équipe réseau avant d'analyser un réseau.

## Sources

| Source | Trouve | Nécessite |
|---|---|---|
| **Analyse de sous-réseau** | chaque équipement qui répond sur un réseau : ping, quelques ports TCP (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP et, en HTTPS, Redfish (iLO, iDRAC) et l'API vSphere (ESXi, vCenter) | des réseaux (`10.0.12.0/24`), des plages (`10.0.20.10-60`), des adresses ou des noms d'hôte, 4096 adresses au maximum ; éventuellement des identifiants SNMP |
| **Inventaire vCenter** | le vCenter, ses hôtes ESXi (étiquetés `cluster:<nom>`) et ses VM, avec l'adresse et le système d'exploitation de chaque VM fournis par VMware Tools ; chaque VM dépend de son hôte | le vCenter et un compte en lecture seule (identifiant partagé) |
| **Voisins des commutateurs (LLDP/CDP)** | qui est branché sur quel port de commutateur ; les serveurs, hôtes ESXi et baies de stockage derrière un port dépendent de ce commutateur, les liens entre commutateurs sont listés | les commutateurs et des identifiants SNMP |
| **HPE OneView** | les châssis Synergy, les modules de calcul avec leur adresse iLO, les interconnexions ; chacun dépend de son châssis | l'appliance OneView et un compte en lecture seule |

Les identifiants sont des identifiants partagés du périmètre global (**Identifiants**) :
communautés SNMP ou utilisateurs SNMPv3 pour l'analyse de sous-réseau et les voisins des
commutateurs, un compte et un mot de passe pour vCenter et OneView. Seul le worker les lit.

## À quoi un équipement est reconnu

L'analyse de sous-réseau reconnaît un équipement à ce qui répond : un service Redfish est un
contrôleur de gestion (iLO), l'API vSphere est un ESXi ou un vCenter, SNMP donne le fabricant
(par son numéro d'entreprise) et le type d'équipement (par sa description : commutateur,
commutateur FC, pare-feu, routeur, baie de stockage, Windows, Linux…), et les ports ouverts aident
quand rien d'autre ne le fait (RDP et SMB : Windows ; SQL Server ; SSH : Linux). Le nom vient de
SNMP, du DNS inverse ou du certificat.

Chaque type propose un modèle de sondes (par exemple *HPE iLO / BMC* ou *Hôte VMware ESXi*) et un
type d'actif. Modifiez-le par équipement : un autre modèle, **Ping seulement** ou **Actif
seulement** (aucune sonde, par exemple pour un châssis ou une VM sans adresse).

## Examiner et créer

- La liste montre pour chaque équipement son adresse, son nom (modifiable), ce à quoi il
  ressemble (fabricant, modèle, détails comme les ports ouverts, la description SNMP, le cluster,
  le port de commutateur) et les sondes proposées.
- Les équipements **connus** — un actif avec cette adresse (ou, sans adresse, ce nom) existe dans
  un périmètre quelconque, ou des sondes vérifient cette adresse — sont masqués ; décochez
  *Masquer les équipements connus* pour les voir, ainsi que l'endroit où ils se trouvent.
- Cochez des équipements, choisissez **Créer dans** (le périmètre global ou un locataire) et des
  étiquettes facultatives, puis **Aperçu** : le même aperçu qu'un import de configuration, avec
  chaque actif et chaque sonde à créer. **Créer** l'applique.
- Les dépendances suivent quand les deux équipements sont créés ensemble, ou quand celui dont on
  dépend existe déjà dans ce périmètre (ou dans le périmètre global).
- Une découverte en cours peut être arrêtée ; les découvertes terminées peuvent être supprimées
  (ce qui a été créé reste).
