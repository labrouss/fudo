<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Configurație ca cod

**Configurație** exportă domeniul curent (resurse, monitoare, aplicații și dependențele lor) ca YAML
și îl importă înapoi. Păstrați-l în git, copiați configurația unui chiriaș la altul sau automatizați-o
prin API.

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

## Cum funcționează importul

- **Întâi o previzualizare**: arată câmp cu câmp ce va fi creat sau modificat și semnalează erorile
  cu numărul rândului. **Aplică** se face integral sau deloc.
- **Fișierele parțiale sunt sigure**: un element din fișier stabilește acel element; ce nu e în fișier
  rămâne neschimbat.
- **Nu sunt incluse**: canalele de notificare și datele de autentificare (conțin secrete) și
  ferestrele de mentenanță. Monitoarele push importate primesc URL-uri noi. Aplicațiile își numesc
  canalele în `notify`; fără `notify`, o aplicație își păstrează canalele actuale.
- **Credențiale partajate**: un monitor o numește pe cea pe care o folosește (`credential: iLO
  read-only`). Credențiala în sine nu se exportă și trebuie să existe deja în domeniul țintă.

## Prin API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Necesită un token API cu permisiunea **Gestionare** (vedeți [Utilizatori și acces](users-and-access.md)).

## Import din Uptime Kuma

**Configurație › Import din Uptime Kuma** citește backupul JSON din Uptime Kuma 1.x (*Setări › Backup › Export*) sau fișierul de bază de date `kuma.db` din versiunile 1.x și 2.x (în folderul de date al Kuma). Vedeți întâi o previzualizare; nimic nu se schimbă până la import.

Verificările HTTP, de cuvânt-cheie și JSON simplu, port TCP, ping, DNS și push sunt importate cu intervalele, reîncercările, etichetele și starea de pauză; expirarea certificatelor HTTPS devine un monitor separat de certificat, iar grupurile devin aplicații. Notificările devin canale cu aceleași setări (cele prin e-mail folosesc serverul de e-mail din Setări) și pornesc dezactivate, dacă nu alegeți altfel. Elementele al căror nume există deja rămân neschimbate, deci un nou import este sigur. Tot ce nu poate fi importat fidel (de exemplu monitoare Docker sau de baze de date, ori modul inversat) este listat cu motivul.
