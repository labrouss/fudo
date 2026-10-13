<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Configuración como código

**Configuración** exporta el ámbito actual (activos, monitores, aplicaciones y sus dependencias)
como YAML y lo vuelve a importar. Guárdelo en git, copie la configuración de un inquilino a otro o
automatícela a través de la API.

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

## Cómo funciona la importación

- **Primero, una vista previa**: lista qué se creará o cambiará, campo por campo, e indica los
  errores con su número de línea. **Aplicar** es todo o nada.
- **Los archivos parciales son seguros**: un elemento del archivo manda sobre ese elemento; lo que
  no está en el archivo queda como estaba.
- **No incluido**: canales de notificación y credenciales (contienen secretos) y ventanas de
  mantenimiento. Los monitores push importados reciben URL nuevas. Las aplicaciones nombran sus
  canales en `notify`; sin `notify`, una aplicación conserva sus canales actuales.
- **Credenciales compartidas**: un monitor nombra la que usa (`credential: iLO read-only`). La
  credencial en sí no se exporta y debe existir ya en el ámbito de destino.

## Mediante la API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Requiere un token de API con el permiso **Administrar** (vea [Usuarios y acceso](users-and-access.md)).

## Importar desde Uptime Kuma

**Configuración › Importar desde Uptime Kuma** lee la copia JSON de Uptime Kuma 1.x (*Ajustes › Copia de seguridad › Exportar*) o el archivo de base de datos `kuma.db` de las versiones 1.x y 2.x (en la carpeta de datos de Kuma). Primero ve una vista previa; nada cambia hasta que importe.

Las comprobaciones HTTP, de palabra clave y JSON simples, puerto TCP, ping, DNS y push se importan con sus intervalos, reintentos, etiquetas y estado de pausa; la caducidad de certificados HTTPS pasa a un monitor de certificado aparte y los grupos pasan a ser aplicaciones. Las notificaciones pasan a ser canales con la misma configuración (las de correo usan el servidor de correo de Ajustes) y empiezan desactivadas salvo que elija otra cosa. Los elementos cuyo nombre ya existe no se tocan, así que volver a importar es seguro. Todo lo que no se puede importar fielmente (por ejemplo monitores Docker o de bases de datos, o el modo invertido) aparece con el motivo.
