<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Tableaux de bord et rapports

## Vue d’ensemble

Incidents ouverts, temps moyen de rétablissement (MTTR, 30 jours), sondes opérationnelles et en
échec, applications dans leur objectif SLA, et une carte par application avec sa bande de
disponibilité sur 30 jours. Les pages se mettent à jour en direct (environ une seconde après un
changement) ; la barre latérale affiche **En direct** tant que la connexion est établie.

La **disponibilité** vient de l’historique des états : le temps en panne et impacté compte contre
elle ; la maintenance planifiée et le temps avant le premier contrôle, non.

## Graphiques

Chaque sonde affiche son temps de réponse sur 1 h, 6 h, 24 h, 7, 30 et 90 jours (moyenne, p95,
échecs, maintenance), ses derniers contrôles en bande de pulsations, ses changements d’état et
ses résultats récents.

## Rapports

**Rapports** montre, par application (ou par ressource partagée dans le périmètre Infrastructure
globale) : la disponibilité 24/7 et pendant les **heures ouvrées**, le temps d’arrêt, la
maintenance planifiée, les incidents, l’objectif SLA atteint ou non, le MTTA (délai
d’acquittement) et le MTTR (délai de résolution). Choisissez la semaine dernière, le mois
dernier, les 30 derniers jours ou vos propres dates, et téléchargez-le en :

- **PDF** : dans votre langue ; les rapports en arabe sont mis en page de droite à gauche,
- **CSV** : disponibilité et incidents, UTF-8 pour Excel, avec des noms de colonnes en anglais pour
  que tableurs et scripts continuent de fonctionner.

## Rapports planifiés

**Rapports › Nouvelle planification** envoie le PDF et/ou le CSV par e-mail chaque lundi (semaine
précédente) ou le 1er (mois précédent), à l’heure et dans le fuseau choisis, dans la langue de la
planification, via le serveur SMTP des Paramètres. **Envoyer maintenant** envoie aussitôt la
dernière période.

## Pages de statut

**Pages de statut › Nouvelle page de statut** affiche des applications, ressources et sondes
choisies sur une page dédiée à `/status/<adresse>`, avec l’état global, 90 jours de disponibilité,
les incidents en cours et les maintenances. Chaque élément reçoit un **nom affiché**, montré à la
place du nom interne ; les éléments d’un même groupe sont regroupés. Les pages d’un locataire peuvent
inclure l’infrastructure partagée.

- **Publique** : toute personne disposant du lien, sans se connecter. La page ne montre que les noms
  affichés et des états simples (*Opérationnel, Dégradé, Panne, Maintenance*), jamais les noms
  internes, les causes, les titres d’incidents ou les noms de maintenances.
- **Interne** : utilisateurs connectés ayant accès au locataire, qui voient aussi les titres
  d’incidents et les noms de maintenances.

La page s’actualise chaque minute et utilise la langue et le mode clair ou sombre du visiteur.
