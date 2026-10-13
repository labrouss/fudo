<!-- translation-of: settings.md#401e7e53 -->
# Paramètres

**Paramètres** (en bas de la barre latérale) contient vos préférences personnelles, pour tous, et
les paramètres du système, pour les superadministrateurs.

Chaque section est un onglet. L'adresse conserve l'onglet ouvert (par exemple `/settings#retention`) : un onglet peut donc être mis en favori ou envoyé sous forme de lien.

## Vos préférences

- **Langue de l’interface** : 13 langues, dont l’arabe avec une mise en page de droite à gauche. Enregistrée dans
  votre profil, elle vous suit dans tous les navigateurs. Les titres d’incidents et les résultats
  de contrôles sont traduits aussi.
- **Thème** : **Système** (suit le mode clair ou sombre de votre système d’exploitation),
  **Clair**, **Sombre**, **Monokai**, et tout thème ajouté par votre administrateur.

## Paramètres du système (superadministrateurs)

### Langue des notifications

**Langue par défaut** des notifications et des rapports planifiés. Chaque canal et chaque
planification peut avoir la sienne ; les e-mails adressés à une personne (invitations,
réinitialisations) utilisent la langue de cette personne. Elle ne change pas l’interface : chacun
la choisit dans *Préférences*.

### E-mail (SMTP)

Utilisé pour les invitations, les alertes par e-mail et les rapports planifiés.

| Champ | Remarques |
|---|---|
| Hôte SMTP, port | 587 (STARTTLS) ou 465 (*Utiliser TLS dès le départ*) ; 25 pour un relais interne |
| Nom d’utilisateur, mot de passe | facultatifs ; le mot de passe est stocké chiffré et n’est plus jamais affiché |
| Adresse de l’expéditeur | p. ex. `fudo@corp.local` |
| **Accepter les certificats auto-signés** | pour un relais local avec un certificat auto-signé ou interne : la connexion reste chiffrée, seule la vérification du certificat est ignorée |

**Envoyer un e-mail de test** indique la raison précise en cas de problème : un certificat non
approuvé, un mauvais mot de passe, un serveur injoignable, ou un mode TLS qui ne correspond pas au
port.

## Pour les administrateurs

De nouvelles langues et de nouveaux thèmes s’ajoutent en déposant des fichiers dans des dossiers,
sans reconstruire ; voir `locales/README.md` et `themes/README.md` dans le dépôt.

## Conservation des données

**Paramètres › Conservation des données** (superadministrateurs) fixe la durée de conservation de chaque type de données et montre la place occupée : résultats bruts des contrôles, résumés horaires et quotidiens, historique des états, incidents résolus, journal des notifications, journal d’audit et fenêtres de maintenance terminées. Les anciennes données sont supprimées chaque heure, petit à petit. Des minimums protègent ce que Fudo affiche (graphiques sur 90 jours, rapports de disponibilité, pages de statut), et le dernier changement d’état avant la limite est toujours conservé, pour que la disponibilité reste exacte. Les incidents ouverts et les notifications en attente d’envoi ne sont jamais supprimés.
