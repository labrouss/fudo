<!-- translation-of: notifications.md#5487cd95 -->
# Notifications

## Canaux

**Notifications › Ajouter un canal**. Intégrés : **E-mail** (nécessite le serveur SMTP des
Paramètres), **Microsoft Teams** (webhook Workflows), **Slack** (incoming webhook) et **Webhook
(JSON)**. Plus de 100 autres (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal,
Twilio et autres passerelles SMS, Mattermost, Matrix, Google Chat, …) viennent des fournisseurs
de notification d’Uptime Kuma. **Envoyer un test** vérifie un canal ; **Journal** montre chaque
envoi et pourquoi un canal a été ignoré.

Les messages de discussion commencent par **[Fudo]**, pour les distinguer facilement d’autres
outils qui publient dans la même discussion.

## Quels incidents un canal reçoit

| Réglage | Effet |
|---|---|
| **Envoyer** | *Tous les incidents de ce locataire* (par défaut) ou *Uniquement les incidents des applications sélectionnées* |
| **Gravité minimale** | Mineur et plus (tous), Majeur et Critique, ou Critique uniquement |
| **Événements** | ouverture, acquittement, résolution |
| **Ignorer les incidents causés par un autre incident** | causes racines uniquement, pas les incidents impactés qui leur sont reliés |
| **Rappeler tant que non acquitté** | répéter toutes les N minutes tant que personne n’acquitte |
| **Langue des messages** | la langue du canal ; par défaut celle de l’organisation (Paramètres) |

Les canaux d’un locataire reçoivent ses incidents, y compris ceux causés par l’infrastructure
partagée (avec la cause racine dans le message). Les canaux globaux reçoivent les incidents
d’infrastructure ; avec **tous les locataires** (un canal NOC), ils reçoivent aussi les incidents
de chaque locataire, sauf ceux causés par un incident d’infrastructure déjà reçu.

**Par application :** un canal réglé sur *Uniquement les incidents des applications
sélectionnées* n’est informé que de celles-ci. Choisissez-les dans le formulaire du canal, ou sur
la page d’une application, dans sa carte **Notifications**, qui avertit aussi quand les incidents
d’une application n’atteignent aucun canal.

## Escalade

Donnez un délai à un canal (**Escalader : non acquitté après 15 min**) et il devient une étape
d’escalade : il n’est notifié que si l’incident est encore ouvert, non acquitté et non en
sourdine après ce délai, puis reçoit son acquittement et sa résolution. Enchaînez-en plusieurs :
Teams tout de suite → SMS d’astreinte après 15 minutes → responsable après 60 minutes.

## Envoi

Les messages passent par une file d’envoi avec nouvelles tentatives (après 1, 5 et 15 minutes) et
une limite de débit par canal, pour qu’un afflux d’incidents ne fasse pas bloquer votre bot ou
votre relais de messagerie.

## Contenu du webhook

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Définissez un **secret de signature** pour recevoir `X-Fudo-Signature: sha256=<HMAC du corps>`. Le
contenu reste en anglais (c’est un format stable pour les intégrations) ; `incident.titleParts`
contient le titre sous forme de codes de message, si vous voulez le traduire vous-même.

## Astreintes

Les équipes alertent des personnes pour les incidents de leurs éléments. Dans **Équipes › Astreinte**,
placez les membres dans l’ordre de rotation, choisissez la durée d’astreinte (un jour, une semaine, deux
semaines ou un nombre de jours), l’heure de relève et le fuseau, et les incidents à alerter. Les étapes
d’**escalade** indiquent qui est alerté et quand, à partir de l’ouverture de l’incident : par exemple la
personne d’astreinte tout de suite, la suivante après 15 minutes et les responsables après 30. Les
**remplacements** permettent à quelqu’un d’autre de couvrir une période, comme un échange ou des congés.

Chaque personne est jointe par ses propres étapes de notification (voir *Votre profil*), ou par e-mail à
son adresse de connexion si elle n’en a pas. Les alertes s’arrêtent dès que quelqu’un acquitte
l’incident et sont suspendues pendant une mise en sourdine. La page de l’incident montre qui a été
alerté et ce qui a été envoyé ; votre profil montre vos prochaines astreintes.

Les messages d’astreinte contiennent les liens **Acquitter** et **Ouvrir dans Fudo** (définissez `PUBLIC_URL`). Acquitter ouvre une page où un simple appui acquitte l’incident en votre nom, sans vous connecter ; ouvrir le lien seul ne change rien, si bien que les aperçus de liens et les analyseurs d’e-mails ne peuvent pas acquitter par erreur. Chaque lien fonctionne une fois, pendant 24 heures, tant que l’incident est ouvert, et seulement si votre rôle permet d’acquitter des incidents.
