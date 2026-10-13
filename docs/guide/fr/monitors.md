<!-- translation-of: monitors.md#eb8b19a2 -->
# Sondes

## La liste

La liste des sondes affiche la **ressource** de chaque sonde et les **applications** dont elle fait partie (une appartenance facultative a un contour en pointillés) ; les deux sont des liens. Cliquez sur l’en-tête d’une colonne pour trier (encore pour inverser, une troisième fois pour l’ordre par défaut) ; Fudo mémorise le tri dans ce navigateur. Le filtre cherche dans les noms, cibles, étiquettes, ressources et applications ; il ignore la casse et les accents, et chaque mot doit correspondre. Les autres longues listes (ressources, incidents, utilisateurs, maintenances, canaux, etc.) se trient et se filtrent de la même façon.

## Types de sondes

| Catégorie | Type | Contrôle |
|---|---|---|
| Web | **HTTP(S)** | plages de codes d’état, mot-clé présent/absent, valeur JSON (`$.status`), en-têtes, corps, temps de réponse |
| | **Certificat TLS** | confiance, nom d’hôte, jours avant expiration (Dégradé dans les N jours, En panne une fois expiré) |
| Réseau | **Ping** | joignabilité, latence, perte de paquets |
| | **Port TCP** | le port accepte les connexions |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, réponse attendue facultative, résolveur choisi |
| | **SNMP** | lit un OID (v1, v2c, v3) et compare la valeur ou, pour les compteurs, sa variation par seconde |
| | **Interface réseau (SNMP)** | un port de commutateur, routeur ou pare-feu : état du lien, trafic entrant et sortant (bit/s et % de la vitesse du lien), erreurs ; affiché dans le temps |
| | **NTP** | joignabilité, stratum, décalage d’horloge |
| | **SMTP** | accueil 220, EHLO, STARTTLS facultatif |
| | **LDAP / Active Directory** | l’annuaire répond (Active Directory : dégradé tant que le contrôleur de domaine n’est pas synchronisé), ou un compte se connecte et une recherche trouve des entrées ; signale les comptes verrouillés, expirés et désactivés |
| | **Expiration de domaine** | expiration de l’enregistrement via RDAP (repli sur WHOIS) |
| Bases de données | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | se connecte, requête facultative avec résultat attendu |
| Systèmes | **Commande SSH** | code de sortie ou sortie (contient, exacte, regex), épinglage facultatif de la clé d’hôte |
| | **Conteneur Docker** | en cours d’exécution, et sain s’il a un contrôle de santé |
| Infrastructure | **VM vCenter** | état d’alimentation, VMware Tools (vCenter 6.7, 7, 8) |
| | **Santé HPE iLO / Redfish** | santé matérielle du serveur via le BMC (iLO 4/5/6, iDRAC, autres BMC Redfish) |
| | **Température d’entrée d’air (iLO / Redfish)** | température de l’air qui entre dans le serveur, donc devant sa baie : dégradé dès 27 °C, en panne dès 32 °C (ASHRAE), avec graphique |
| | **Température de salle** | tous les capteurs d’entrée étiquetés `room:<name>` ensemble : en panne quand plusieurs sont chauds (problème de refroidissement), dégradé quand un seul est chaud ou que plusieurs montent vite |
| Passif | **Heartbeat push** | une tâche appelle une URL ; En panne quand elle cesse d’appeler |
| | **Traps SNMP** | traps envoyés par un équipement (v1, v2c) : en panne ou dégradé tant qu’un trap de problème est ouvert ; s’efface tout seul, par un trap de fin ou à la main |

**Tester maintenant** exécute un contrôle une fois depuis le serveur Fudo sans l’enregistrer,
pour le régler avant qu’il ne déclenche des alertes.

## Éviter les fausses alertes

- **En panne après N échecs** : une sonde ne passe En panne qu’après N contrôles échoués
  consécutifs, en réessayant entre-temps à l’*intervalle de nouvelle tentative*, plus rapide.
- **Opérationnel après M succès** : elle ne se rétablit qu’après M contrôles réussis consécutifs.
- **Dégradé au-delà de** : les réponses lentes comptent comme Dégradé plutôt qu’En panne.

## Identifiants

Les mots de passe, communautés SNMP, clés SSH et assimilés sont stockés **chiffrés** et ne sont
plus jamais affichés, exportés ni renvoyés par l’API ; seul le worker les déchiffre pour exécuter
un contrôle. Utilisez des comptes en lecture seule : un rôle vCenter *Read-only*, un utilisateur
iLO avec le privilège *Login*, un utilisateur de base de données limité à `CONNECT`/`SELECT`.

### Identifiants partagés

Quand de nombreuses sondes se connectent avec le même compte (un utilisateur iLO en lecture seule
pour tous les serveurs, une communauté SNMP pour les commutateurs), enregistrez-le une fois sous
**Identifiants** et laissez les sondes l’utiliser. Quand le mot de passe change, modifiez
l’identifiant une seule fois : chaque sonde qui l’utilise refait aussitôt un contrôle avec la
nouvelle valeur.

- Un identifiant a un type : *Compte et mot de passe*, *Clé SSH*, *Communauté SNMP (v1, v2c)* ou
  *Utilisateur SNMPv3*. Dans le formulaire de sonde, les types qui se connectent proposent **Le
  saisir ici** ou **Utiliser un identifiant partagé** ; avec un identifiant, les champs du compte
  disparaissent du formulaire.
- Les identifiants appartiennent à une portée : les sondes d’un locataire ne peuvent utiliser que
  les identifiants de ce locataire, et les sondes de l’infrastructure globale que les identifiants
  globaux.
- Les secrets sont en écriture seule, comme ceux d’une sonde : stockés chiffrés, jamais affichés,
  exportés ni renvoyés. La liste montre le compte et les sondes qui l’utilisent.
- **Même compte dans plusieurs sondes** : la page liste les sondes qui stockent déjà le même
  compte et le même mot de passe. Donnez un nom au groupe et choisissez **En faire un identifiant
  partagé** : le mot de passe est copié sur le serveur, personne n’a besoin de le connaître.
- **Utiliser pour…** associe d’autres sondes à un identifiant ; leur propre compte et leur mot de
  passe sont supprimés. Un identifiant utilisé ne peut pas être supprimé, et son type ne peut pas
  changer.
- Une sonde qui n’utilise plus d’identifiant a de nouveau besoin de son propre mot de passe.
- Dans la [configuration en tant que code](configuration-as-code.md), une sonde désigne son
  identifiant (`credential: iLO read-only`) ; l’identifiant lui-même se crée dans l’interface.
  L’ajout en masse de contrôles de température peut aussi en utiliser un.
- Chaque modification figure dans le journal d’audit, avec le nom des secrets modifiés, jamais
  leur valeur.

## Sondes push

Une sonde push attend que votre tâche l’appelle. Après l’enregistrement, sa page affiche l’URL :

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Elle passe En panne quand aucun appel n’arrive dans l’intervalle plus le délai de grâce.
**Nouvelle URL** remplace le jeton s’il a fuité.

## Ajout en masse et modèles

**Sondes › Ajout en masse / modèles** crée des contrôles pour de nombreux hôtes à la fois :

1. collez un hôte ou une URL par ligne (ou chargez un CSV avec `name,host,port`),
2. choisissez un **modèle**, par exemple *serveur Windows* (ping, RDP, WinRM), *serveur Linux*,
   *HPE iLO*, *équipement réseau*, *hôte ESXi*, *vCenter*, *SQL Server*, *baie de stockage* ou
   *application web*, ou un seul type de contrôle,
3. créez éventuellement une ressource par ligne, faites-les dépendre d’une ressource existante et
   ajoutez-les à une application.

Un aperçu de tout ce qui sera créé s’affiche avant l’application.

## Remarques par type

- **VM vCenter** trouve seule la bonne version de l’API et réutilise les sessions (une connexion
  par vCenter toutes les 20 minutes). Le contrôle des VMware Tools nécessite vCenter 7.0 ou plus.
- **HPE iLO / Redfish** nomme l’élément défaillant sur HPE iLO (ventilateurs, alimentations,
  stockage, redondance). Warning → Dégradé, Critical ou éteint → En panne.
- **Commande SSH** : renseignez l’*Empreinte de la clé d’hôte* (`ssh-keyscan host | ssh-keygen -lf -`)
  pour qu’une clé de serveur modifiée soit signalée au lieu d’être acceptée.
- **Conteneur Docker** utilise le socket Docker local (montez-le dans le conteneur worker, voir
  `docker-compose.yml`) ou l’URL d’une API Docker distante.
- **Expiration de domaine** : certains registres nationaux ne publient ni RDAP ni WHOIS ; Fudo le
  signale comme Dégradé avec une explication.
- **Ping** nécessite la capacité `NET_RAW` dans le conteneur worker, et dans le conteneur API pour
  **Tester maintenant** (les deux sont définies dans `docker-compose.yml`).

## Traps SNMP

Dirigez les traps SNMP (v1 ou v2c) de vos équipements vers le serveur Fudo, port UDP 162. La page
**Traps** indique si des traps sont reçus et affiche chaque trap avec ses champs.

- Une sonde **Traps SNMP** prend les traps des équipements indiqués dans **De** : adresses, noms
  d’hôte ou plages IPv4 (`10.0.12.0/24`). Avec une **Communauté** (ou un identifiant partagé de
  type communauté SNMP), elle ne prend que les traps qui la portent ; la communauté n’est jamais
  stockée.
- **Traps de problème** : les traps standard (link down, démarrage à froid et à chaud, échec
  d’authentification), seulement les traps listés (noms ou OID ; un OID couvre aussi tout ce qui
  est en dessous, p. ex. le préfixe d’entreprise d’un constructeur), ou tout trap. *Seulement si
  un champ contient* restreint aux traps contenant un texte comme `Critical`.
- Tant qu’un problème est ouvert, la sonde est **En panne** (ou Dégradée, si vous le choisissez) ;
  incident, notifications et astreinte fonctionnent comme pour tout contrôle, moins d’une seconde
  après le trap.
- Les problèmes sont suivis par trap et par interface : un link down sur deux ports fait deux
  problèmes, et le **link up** d’un port ne termine que le problème de ce port.
- **Les problèmes s’effacent** automatiquement quand aucun nouveau trap n’arrive pendant un moment
  (30 minutes par défaut), ou seulement à la main : la page de la sonde liste les traps ouverts
  avec **Effacer** (jusqu’au prochain trap correspondant). Les *traps de fin* terminent aussi des
  problèmes, p. ex. le trap « condition résolue » d’un constructeur.
- Un trap **qu’aucune sonde ne prend** est quand même conservé : chez le locataire de l’actif
  ayant cette adresse, sinon dans la portée de l’infrastructure globale. **Créer une sonde** sur
  la page Traps prépare une sonde pour son équipement.
- Un équipement qui inonde de traps est limité (50 par seconde, pointes de 500) ; les traps
  ignorés sont comptés sur la page Traps de la portée globale. Les traps sont conservés 30 jours
  (Paramètres › Conservation des données).

## Interfaces réseau

Une sonde **Interface réseau (SNMP)** surveille un port d’un commutateur, d’un routeur ou d’un
pare-feu.

- **Trouver les interfaces…** (après l’hôte et l’accès SNMP, ou un identifiant partagé) liste les
  interfaces de l’équipement avec leur description, leur vitesse et leur état. Choisissez-en une,
  ou, lors d’un ajout, cochez-en plusieurs : chacune devient une sonde avec les réglages du
  formulaire, nommée d’après l’interface.
- L’interface est retenue par son **nom** (ou sa description ou son alias), pas par son numéro,
  car certains équipements renumérotent leurs interfaces après un redémarrage. Un numéro
  fonctionne aussi.
- Le **trafic** est la différence entre deux lectures des compteurs 64 bits : le premier contrôle
  lit deux fois, à deux secondes d’intervalle ; les suivants utilisent la lecture conservée du
  contrôle précédent. Après un redémarrage de l’équipement, la paire est ignorée : pas de faux pic.
  Les équipements sans compteurs 64 bits (SNMP v1) utilisent des compteurs 32 bits, peu fiables
  au-delà d’environ 100 Mbit/s avec un intervalle d’une minute.
- **État** : lien coupé → En panne ; testing ou dormant → Dégradé ; un port désactivé volontairement
  est Opérationnel (ou En panne, si vous le choisissez). Le sens le plus chargé au-dessus de
  *Dégradé à partir d’une utilisation de* (80 % par défaut) → Dégradé, au-dessus de *En panne à
  partir d’une utilisation de* (désactivé par défaut) → En panne ; des erreurs par minute au-dessus
  de la limite → Dégradé. Si l’équipement indique une mauvaise vitesse (un tunnel, un circuit à
  débit limité), renseignez *Vitesse du lien*.
- La page de la sonde affiche le trafic entrant et sortant avec la ligne Dégradé.
- *Comparer : sa variation par seconde* de la sonde **SNMP** fait de même pour n’importe quel
  compteur (trames d’un port SAN, sessions d’un pare-feu, événements d’un onduleur).

## Température du datacenter

**Température** affiche chaque capteur de température d’entrée d’air, regroupé par son étiquette `room:<name>` et trié du plus chaud au plus froid, avec sa baie (`rack:<name>`), sa valeur actuelle, les 6 dernières heures, la variation sur 15 minutes et la plage sur 24 heures. **Ajouter des capteurs** les crée pour une liste d’adresses iLO (ou d’autres BMC Redfish) avec un compte partagé en lecture seule.

Un capteur passe aussi en dégradé quand sa température **monte vite** (par défaut 3 °C en 15 minutes), même sous ses seuils : le premier signe d’une panne de refroidissement. **Créer une alerte de salle** ajoute une sonde *Température de salle* : en panne quand 3 capteurs sont chauds, dégradé quand un seul est chaud ou que 2 montent vite. Elle ouvre des incidents comme toute sonde : propriétaires, astreintes et pages de statut fonctionnent donc aussi pour elle.
