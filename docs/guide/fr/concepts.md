<!-- translation-of: concepts.md#61c26734 -->
# Concepts

## Périmètres : locataires et infrastructure globale

| Périmètre | Contient | Géré par |
|---|---|---|
| **Locataire** (un par entité métier) | ses applications, sondes, ressources, canaux et rapports | administrateurs de locataire |
| **Infrastructure globale** | les ressources partagées (commutateurs, baies de stockage, fabrics FC, clusters) et leurs sondes | administrateurs d’infrastructure et superadministrateurs |

Choisissez le périmètre dans le sélecteur en haut de la barre latérale. Les locataires voient
l’infrastructure partagée en lecture seule et y relient leurs propres sondes et applications ;
ainsi, une panne de stockage apparaît comme cause dans chaque application qui en a besoin.

## Éléments de base

| Élément | Ce que c’est | Exemple |
|---|---|---|
| **Sonde** | un contrôle exécuté à intervalles réguliers | HTTPS sur `erp.corp.local/health` |
| **Ressource** | un élément d’infrastructure, contrôlé par ses sondes | `Core-SW-01`, `SAN-A` |
| **Application** | un service métier : des sondes (membres) et l’infrastructure dont il a besoin | *ERP Production* |
| **Dépendance** | « ceci a besoin de cela » : ressource → ressource, application → ressource | cluster ESXi → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Sur un actif, **Ajouter une existante** y place des sondes que vous avez déjà (une sonde rattachée à un autre actif est déplacée) et **Nouvelle sonde** ouvre le formulaire de sonde pour cet actif. Un locataire peut aussi placer ses propres sondes sur un actif global partagé ; **Retirer** détache une sonde de l'actif et la conserve.

## États

| État | Signification |
|---|---|
| **Opérationnel** | fonctionne |
| **Dégradé** | fonctionne, mais lentement ou en partie (p. ex. un membre facultatif est en panne) |
| **En panne** | échoue, et rien de ce dont il dépend ne l’explique : c’est une **cause racine** |
| **Impacté** | échoue **parce que** quelque chose dont il dépend est en panne ; les alertes désignent la cause racine |
| **À risque** | fonctionne, mais quelque chose dont il dépend a un problème |
| **Maintenance** | dans une fenêtre de maintenance planifiée : ne compte pas contre la disponibilité |
| **En attente** | pas encore de résultat |

## Comment Fudo trouve la cause racine

| Situation | Résultat |
|---|---|
| Les contrôles d’une ressource échouent et rien de ce dont elle dépend n’est en panne | **En panne** : cause racine, avec son propre incident |
| Ses contrôles échouent **et** quelque chose dont elle dépend est en panne | **Impacté par** cette cause racine : pas de tempête d’alertes |
| Ses contrôles réussissent mais quelque chose dont elle dépend est en panne | garde son état, marqué **À risque** |
| Quelque chose dont elle dépend est en maintenance planifiée | **Impacté par une maintenance** (planifiée, exclue de la disponibilité) |

Une application est saine quand ses membres le sont, selon sa règle : **tous les membres
obligatoires opérationnels**, **au moins un**, ou **au moins N sur M** (pour les services
redondants). Les membres obligatoires déterminent l’état ; les membres facultatifs ne peuvent que
le rendre *Dégradé*.

**Et si cela tombe en panne ?** sur une ressource prédit quelles applications tomberaient en
panne, et lesquelles tiendraient grâce à la redondance, avant de l’arrêter pour une
intervention.

La page **Topologie** dessine l’ensemble avec l’état en direct : survolez un élément pour suivre
ses dépendances ; *Problèmes uniquement* montre ce qui échoue et ce qui en dépend.
