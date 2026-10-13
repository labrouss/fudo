<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Dépannage

### J’ai reçu une alerte, mais la liste des incidents est vide

- **Autre locataire** : la liste montre le périmètre choisi dans la barre latérale. Un canal réglé
  sur *tous les locataires* reçoit les incidents de chaque locataire ; changez de locataire pour
  les voir.
- **Déjà résolu** : de courtes coupures ouvrent et ferment un incident en quelques minutes ;
  regardez dans *Résolu*.
- **Pas de Fudo** : les messages de discussion de Fudo commencent par **[Fudo]** et ne contiennent
  jamais de codes d’erreur bruts comme `EHOSTUNREACH`. Si un autre outil de supervision (par
  exemple Uptime Kuma) publie encore dans la même discussion, l’alerte vient de lui. Le **Journal**
  du canal liste tout ce que Fudo a envoyé.

### Une sonde échoue avec « Hôte injoignable » ou « Délai dépassé »

Le contrôle s’exécute depuis le conteneur **worker** de Fudo, pas depuis votre poste. Vérifiez que
l’hôte du worker atteint la cible (routage, pare-feu). Pour le ping, les conteneurs ont besoin de
la capacité `NET_RAW` (définie dans `docker-compose.yml`).

### « Le certificat du serveur SMTP n’est pas approuvé »

Votre relais de messagerie utilise un certificat auto-signé ou interne. Activez **Accepter les
certificats auto-signés** dans Paramètres › E-mail (SMTP).

### Tout ce qui est derrière un commutateur est passé au rouge en même temps

C’est normal, et Fudo le gère : le commutateur est **En panne** (cause racine) et les éléments
derrière lui sont **Impactés**. Vous recevez un incident racine avec les autres reliés à lui.
Vérifiez que les dépendances sont modélisées (la ressource *dépend du* commutateur) pour que Fudo
puisse le savoir.

### Un changement planifié a alerté l’équipe d’astreinte

Créez d’abord une [fenêtre de maintenance](maintenance.md) pour les ressources concernées : les
contrôles continuent, mais les alertes sont supprimées et le temps ne compte pas contre la
disponibilité.

### Les incidents d’une application n’atteignent personne

Ouvrez l’application : sa carte **Notifications** avertit quand aucun canal ne reçoit ses
incidents (par exemple quand tous les canaux sont réglés sur *Uniquement les incidents des
applications sélectionnées* sans elle).

### La page affiche « Reconnexion aux mises à jour en direct »

Le navigateur a perdu la connexion à l’API ; les pages se mettent de nouveau à jour
automatiquement dès qu’elle revient. Si cela persiste, vérifiez qu’un proxy devant Fudo autorise
les connexions de longue durée (Server-Sent Events) vers `/api/live`.

### J’ai perdu mon téléphone

Connectez-vous avec un code de récupération, ou demandez à un administrateur de **Réinitialiser la
2FA** de votre compte.
