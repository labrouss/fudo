<!-- translation-of: incidents.md#4e781264 -->
# Incidents

Fudo ouvre les incidents tout seul quand quelque chose tombe en panne et les résout au
rétablissement.

## Quand un incident s’ouvre

| Élément | Ouvre un incident quand | Gravité |
|---|---|---|
| **Application** | En panne, ou Impactée par une cause non planifiée | selon sa criticité : critique → Critique, élevée → Majeur, autres → Mineur |
| **Ressource** | En panne (c’est une cause racine) | Majeur |
| **Sonde** | En panne, et ne fait partie d’aucune ressource ni application | Mineur |

Un incident **Impacté** est relié à l’incident de sa cause racine (*Causé par INC-…*) : un
commutateur en panne donne un incident racine et des incidents impactés clairement reliés, et non
une tempête d’alertes.

## Vie d’un incident

1. **Ouvert** automatiquement, les notifications partent (voir [Notifications](notifications.md)).
2. **Acquitter** montre que quelqu’un s’en occupe ; les rappels et les escalades s’arrêtent.
3. **Mettre en sourdine** coupe les notifications un moment (30 minutes à 1 jour) sans acquitter.
4. **Résolu** automatiquement au rétablissement de l’élément. S’il retombe en panne dans les 5
   minutes, le même incident est **rouvert** au lieu d’en créer un nouveau. Vous pouvez aussi le
   résoudre à la main.

La **chronologie** enregistre chaque étape : changements d’état, notifications, acquittements et
notes.

## Notes : partager ce que vous avez appris

Ajoutez des notes à la chronologie comme **Commentaire**, **Action effectuée** ou **Résolution**,
avec des étiquettes (p. ex. `supervisor`, `firmware`).

Les résolutions sont réutilisées : quand un incident similaire survient plus tard (même élément,
même cause racine, étiquettes communes ou texte proche), **Incidents passés similaires** montre ce
qui l’a résolu, et ses alertes le citent : *« La dernière fois (INC-0041, 12 août 2026), cela a
été résolu par : … »*.

## Trouver des incidents

**Incidents** liste les incidents **ouverts** du périmètre choisi dans la barre latérale ; passez à
*Résolu* pour l’historique, et cherchez par titre, numéro INC ou étiquette. Les incidents d’un
autre locataire apparaissent quand vous passez à ce locataire (voir [Dépannage](troubleshooting.md)).

## Rapports post-incident

**Rapport post-incident** sur un incident télécharge un rapport en **PDF** ou en **Markdown** (pour un wiki ou un ticket) : un résumé avec les heures et qui l’a acquitté et résolu, les incidents impactés, la résolution et les actions effectuées, la chronologie, les notifications envoyées et les incidents passés similaires. Il utilise votre langue et votre fuseau horaire, et peut être créé pendant que l’incident est encore ouvert.
