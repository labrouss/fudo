<!-- translation-of: maintenance.md#f097f823 -->
# Fenêtres de maintenance

Planifiez les interventions pour qu’elles n’alertent personne et ne comptent pas contre la
disponibilité.

**Maintenance › Planifier une maintenance** : donnez un titre, un début et une fin, des notes
(demande de changement, contact, plan de retour arrière) et ce qu’elle **couvre** : des
ressources (avec leurs contrôles) et des sondes.

Pendant la fenêtre :

- les contrôles continuent, pour que vous voyiez ce qui se passe,
- leurs résultats sont **exclus de la disponibilité** et du SLA,
- les **alertes sont supprimées**,
- les éléments qui dépendent de quelque chose en maintenance l’affichent comme cause (*Impacté
  par une maintenance*), pour que personne ne coure après une coupure planifiée.

**Terminer maintenant** clôt une fenêtre plus tôt. Les fenêtres apparaissent comme *Planifiée*,
*En cours* ou *Terminée*.

Astuce : utilisez d’abord **Et si cela tombe en panne ?** sur la ressource pour voir quelles
applications l’intervention touchera.

## Maintenance récurrente

Choisissez **Répétition** lors de la planification : chaque jour, chaque semaine certains jours, ou
chaque mois, un jour du mois (le 31 tombe le dernier jour des mois plus courts) ou un jour d’une
semaine (le *mardi de la deuxième semaine* est le Patch Tuesday de Microsoft). Les heures sont dans le
fuseau choisi : 02:00 reste 02:00 après le changement d’heure ; une heure de fin antérieure au début
signifie le lendemain.

Fudo crée les fenêtres des 60 prochains jours, marquées **Récurrente**. **Ignorer** retire une
occurrence, et modifier une fenêtre ne change que cette occurrence. Modifier la série change ses
fenêtres futures ; la supprimer les retire, les passées et celles en cours restent.
