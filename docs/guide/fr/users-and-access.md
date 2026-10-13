<!-- translation-of: users-and-access.md#c2bf850f -->
# Utilisateurs et accès

## Rôles

| Rôle | Où | Peut |
|---|---|---|
| **Superadmin** | partout | tout faire, y compris gérer les utilisateurs, les locataires et les paramètres |
| **Administrateur d’infrastructure** | périmètre Infrastructure globale (et chaque locataire) | gérer l’infrastructure partagée ; gérer les données de tous les locataires |
| **Administrateur de locataire** | un locataire | gérer le locataire : sondes, ressources, applications, canaux, rapports, jetons d’API |
| **Opérateur** | un locataire | tout voir ; suspendre, reprendre et tester les sondes, acquitter, mettre en sourdine et résoudre les incidents, ajouter des notes |
| **Lecteur** | un locataire | tout voir, ne rien modifier |

Un utilisateur peut avoir un rôle différent dans chaque locataire. Les superadministrateurs gèrent
les utilisateurs et les locataires dans **Administration**.

## Invitations et connexion

**Administration › Utilisateurs › Inviter un utilisateur** : nom, e-mail, **langue** de
l’utilisateur (pour l’e-mail d’invitation et sa première connexion) et ses rôles. Il reçoit un lien
à usage unique (valable 72 heures) pour choisir un mot de passe et configurer
l’**authentification à deux facteurs**, obligatoire. Si l’e-mail n’est pas configuré, copiez le
lien depuis la fenêtre et envoyez-le vous-même.

Téléphone perdu ? Connectez-vous avec l’un des **codes de récupération**. Un administrateur peut
aussi **Réinitialiser la 2FA** (le mot de passe est conservé) ou **Réinitialiser le mot de passe
et la 2FA** depuis la fenêtre de l’utilisateur ; celui-ci reçoit un nouveau lien.

Les comptes sont verrouillés 15 minutes après 5 tentatives de mot de passe ou de code échouées.

## Désactiver et supprimer des utilisateurs

**Désactiver** bloque immédiatement la connexion et conserve le compte. **Supprimer
l’utilisateur** retire le compte avec ses sessions, ses rôles et sa 2FA ; les incidents, les
notes et le journal d’audit conservent leur historique (affiché comme *name@example
(supprimé)*). Vous ne pouvez supprimer ni vous-même ni le dernier superadministrateur actif.

## Jetons d’API

**Accès API** (administrateurs de locataire par locataire, administrateurs d’infrastructure dans
le périmètre Infrastructure globale) crée des jetons avec une autorisation :

| Autorisation | Permet |
|---|---|
| **Lire** | consulter les sondes, incidents et rapports |
| **Exploiter** | également suspendre/reprendre, acquitter, notes, tests |
| **Gérer** | également créer, modifier et supprimer |

Un jeton ne fonctionne que dans son périmètre, peut expirer, peut être révoqué, et ne peut jamais
gérer les utilisateurs, les locataires, les paramètres ni d’autres jetons. Il est affiché une
seule fois ; seule une empreinte est stockée.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

La documentation de l’API est intégrée à **/api/docs** (fonctionne hors ligne) ; la spécification
lisible par machine est sur `/api/openapi.json`.

## Journal d’audit

**Administration › Journal d’audit** enregistre les connexions et les échecs, les verrouillages,
les invitations, et chaque modification des utilisateurs, des locataires et des paramètres, avec
les valeurs avant et après.

## Votre profil

Dans **Profil** (en bas de la barre latérale), vous changez votre nom et votre mot de passe,
passez l’authentification à deux facteurs sur un nouveau téléphone (l’ancien fonctionne jusqu’à la
confirmation du nouveau), obtenez de nouveaux codes de récupération, et voyez vos sessions pour
déconnecter les autres. Changer de mot de passe ou de téléphone déconnecte vos autres sessions.

Ses onglets : **Vos informations**, **Mot de passe**, **Authentification à deux facteurs**, **Sessions** et **Astreinte** (vos astreintes, moyens de contact et étapes de notification). L'adresse conserve l'onglet ouvert, par exemple `/profile#sessions`.

Les **moyens de contact** sont la façon dont Fudo vous joint personnellement, par exemple pendant une
astreinte : e-mail, un workflow Microsoft Teams qui écrit dans votre conversation, ou Telegram (dès
qu’un administrateur a connecté un bot Telegram dans les *Paramètres*). Chacun est d’abord confirmé par
un code à 6 chiffres. **Vos étapes de notification** indiquent quels moyens utiliser et quand, par
exemple e-mail tout de suite et Telegram après 5 minutes, jusqu’à ce que l’incident soit acquitté.

## Équipes et responsabilité

**Équipes** regroupe les responsables des applications et de l’infrastructure, par exemple une
*Équipe bases de données* dans un locataire ou une *Équipe stockage* dans le périmètre Infrastructure
globale. Chacun est **membre** ou **responsable** ; seules les personnes ayant accès au périmètre de
l’équipe peuvent être ajoutées.

Choisissez l’**équipe propriétaire** sur la page d’une application ou d’une ressource. Chaque incident
affiche alors le propriétaire et ses responsables, y compris les incidents des sondes (via leur
ressource ou leur application), tout comme les rapports post-incident. Les éléments d’un locataire
appartiennent aux équipes du locataire, l’infrastructure partagée aux équipes globales. Les astreintes
se définissent par équipe.
