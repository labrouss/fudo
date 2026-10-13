<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Configuration en tant que code

**Configuration** exporte le périmètre courant (ressources, sondes, applications et leurs
dépendances) en YAML et le réimporte. Conservez-le dans git, dupliquez la configuration d’un
locataire vers un autre, ou automatisez-la via l’API.

```yaml
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    dependsOn: [Core-SW-01]          # shared assets are referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    asset: FIN-APPLIANCE-01          # the asset this monitor checks
    tags: [prod]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web, { monitor: ERP SQL, required: false }]
    notify: [ERP team]               # notification channels, by name
```

## Fonctionnement de l’import

- **D’abord un aperçu** : il liste ce qui sera créé ou modifié, champ par champ, et signale les
  erreurs avec leur numéro de ligne. **Appliquer** se fait en entier ou pas du tout.
- **Les fichiers partiels sont sans risque** : un élément du fichier fait foi pour cet élément ;
  les éléments absents du fichier restent tels quels.
- **Non inclus** : les canaux de notification et les identifiants (ils contiennent des secrets)
  ainsi que les fenêtres de maintenance. Les sondes push importées reçoivent de nouvelles URL. Les
  applications désignent leurs canaux par leur nom dans `notify` ; sans `notify`, une application
  garde ses canaux actuels.
- **Identifiants partagés** : une sonde désigne celui qu’elle utilise par son nom (`credential: iLO
  read-only`). L’identifiant lui-même n’est pas exporté et doit déjà exister dans la portée cible.

## Via l’API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Nécessite un jeton d’API avec l’autorisation **Gérer** (voir
[Utilisateurs et accès](users-and-access.md)).

## Importer depuis Uptime Kuma

**Configuration › Importer depuis Uptime Kuma** lit la sauvegarde JSON d’Uptime Kuma 1.x (*Paramètres › Sauvegarde › Exporter*) ou le fichier de base de données `kuma.db` des versions 1.x et 2.x (dans le dossier de données de Kuma). Vous voyez d’abord un aperçu ; rien ne change avant l’import.

Les contrôles HTTP, mot-clé et JSON simples, port TCP, ping, DNS et push sont importés avec leurs intervalles, nouvelles tentatives, étiquettes et état de pause ; l’expiration des certificats HTTPS devient une sonde de certificat distincte, et les groupes deviennent des applications. Les notifications deviennent des canaux avec les mêmes réglages (celles par e-mail utilisent le serveur de messagerie des Paramètres) et démarrent désactivées, sauf choix contraire. Les éléments dont le nom existe déjà ne sont pas modifiés : importer à nouveau est donc sans risque. Tout ce qui ne peut pas être importé fidèlement (par exemple les sondes Docker ou de base de données, ou le mode inversé) est listé avec la raison.
