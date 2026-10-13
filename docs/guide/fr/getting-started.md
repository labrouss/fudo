<!-- translation-of: getting-started.md#ea57bfb7 -->
# Prise en main

Fudo vous indique si vos applications métier fonctionnent, **pourquoi** elles sont en panne, et ce
qui a résolu des problèmes similaires auparavant. Cette page vous mène d’une nouvelle installation
à votre première notification.

## 1. Première connexion

Après l’installation (voir [Installation](../../admin/installation.md)), ouvrez Fudo dans le
navigateur. L’**assistant de configuration** demande :

1. le nom de votre organisation,
2. le premier administrateur (nom, e-mail, mot de passe d’au moins 12 caractères),
3. l’authentification à deux facteurs : scannez le code QR avec une application
   d’authentification (Microsoft Authenticator, Google Authenticator, 1Password, …) et
   **conservez les codes de récupération**,
4. éventuellement le serveur de messagerie (SMTP), utilisé pour les invitations, les alertes et
   les rapports. Vous pouvez aussi le configurer plus tard dans les **Paramètres**.

L’authentification à deux facteurs est obligatoire pour chaque compte.

## 2. Créer un locataire

Un **locataire** est une entité métier, par exemple *Finance* ou *RH*. Ses applications, ses
sondes et ses canaux de notification sont séparés de ceux des autres locataires. Allez dans
**Administration › Locataires › Nouveau locataire**, puis choisissez-le dans le sélecteur en haut
de la barre latérale.

L’infrastructure partagée (commutateurs de cœur, baies de stockage, clusters) appartient au
périmètre **Infrastructure globale** ; voir [Concepts](concepts.md).

## 3. Ajouter une sonde

**Sondes › Ajouter une sonde**, choisissez un type (par exemple *HTTP(S)* ou *Ping*), indiquez la
cible et cliquez sur **Tester maintenant** pour exécuter le contrôle une fois sans l’enregistrer.
Enregistrez-la ; les résultats apparaissent en un intervalle de contrôle. Pour de nombreux hôtes
à la fois, utilisez **Ajout en masse / modèles** ; voir [Sondes](monitors.md).

## 4. Regrouper les sondes dans une application

**Applications › Nouvelle application**, puis ajoutez les sondes qui composent le service
(frontal web, API, base de données). L’état de l’application indique si le service fonctionne, et
sinon pourquoi. Définissez un **objectif SLA** pour le suivre dans les rapports.

## 5. Être notifié

**Notifications › Ajouter un canal** : e-mail, Microsoft Teams, Slack, un webhook JSON ou l’un des
plus de 100 autres (Telegram, PagerDuty, passerelles SMS, …). **Envoyer un test** vérifie le
canal. Voir [Notifications](notifications.md).

## 6. Inviter vos collègues

**Administration › Utilisateurs › Inviter un utilisateur** : choisissez sa langue et son rôle par
locataire. Il reçoit un lien à usage unique pour choisir un mot de passe et configurer
l’authentification à deux facteurs. Voir [Utilisateurs et accès](users-and-access.md).

## Pour aller plus loin

- [Concepts](concepts.md) : périmètres, ressources, dépendances et comment Fudo trouve la cause racine
- [Incidents](incidents.md) : ce qui se passe quand quelque chose tombe en panne
- [Dépannage](troubleshooting.md) : questions fréquentes
