<!-- translation-of: users-and-access.md#c2bf850f -->
# Usuarios y acceso

## Roles

| Rol | Dónde | Puede |
|---|---|---|
| **Superadmin** | en todas partes | todo, incluidos usuarios, inquilinos y ajustes |
| **Administrador de infraestructura** | ámbito Infraestructura global (y cada inquilino) | administrar la infraestructura compartida y los datos de todos los inquilinos |
| **Administrador de inquilino** | un inquilino | administrar el inquilino: monitores, activos, aplicaciones, canales, informes, tokens de API |
| **Operador** | un inquilino | verlo todo; pausar, reanudar y probar monitores, confirmar, silenciar y resolver incidentes, añadir notas |
| **Lector** | un inquilino | verlo todo, sin cambiar nada |

Un usuario puede tener un rol distinto en cada inquilino. Los superadministradores gestionan
usuarios e inquilinos en **Administración**.

## Invitaciones e inicio de sesión

**Administración › Usuarios › Invitar usuario**: nombre, correo, el **idioma** del usuario (para el
correo de invitación y su primer inicio de sesión) y sus roles. Recibe un enlace de un solo uso
(válido 72 horas) para elegir contraseña y configurar la **autenticación en dos pasos**,
obligatoria. Si el correo no está configurado, copie el enlace del diálogo y envíelo usted.

¿Perdió el teléfono? Inicie sesión con uno de los **códigos de recuperación**. Un administrador
también puede **Restablecer 2FA** (la contraseña se mantiene) o **Restablecer contraseña y 2FA**
desde el diálogo del usuario; este recibe un enlace nuevo.

Las cuentas se bloquean 15 minutos tras 5 intentos fallidos de contraseña o de código.

## Desactivar y eliminar usuarios

**Desactivar** bloquea el inicio de sesión al momento y conserva la cuenta. **Eliminar usuario**
borra la cuenta con sus sesiones, roles y 2FA; los incidentes, las notas y el registro de auditoría
conservan su historial (se muestra como *name@example (eliminado)*). No puede eliminarse a sí mismo
ni al último superadministrador activo.

## Tokens de API

**Acceso a la API** (administradores de inquilino por inquilino, administradores de
infraestructura en el ámbito Infraestructura global) crea tokens con un permiso:

| Permiso | Permite |
|---|---|
| **Leer** | ver monitores, incidentes e informes |
| **Operar** | además pausar/reanudar, confirmar, notas, pruebas |
| **Administrar** | además crear, cambiar y eliminar |

Un token solo funciona en su ámbito, puede caducar, puede revocarse y nunca puede gestionar
usuarios, inquilinos, ajustes ni otros tokens. Se muestra una sola vez; solo se guarda un hash.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

La documentación de la API está integrada en **/api/docs** (funciona sin conexión); la
especificación legible por máquinas está en `/api/openapi.json`.

## Registro de auditoría

**Administración › Registro de auditoría** registra inicios de sesión y fallos, bloqueos,
invitaciones y cada cambio en usuarios, inquilinos y ajustes, con los valores antes y después.

## Su perfil

En **Perfil** (al pie de la barra lateral) cambia su nombre y su contraseña, pasa la autenticación
en dos pasos a un teléfono nuevo (el anterior funciona hasta que confirme el nuevo), obtiene códigos de
recuperación nuevos, y ve sus sesiones para cerrar las demás. Cambiar la contraseña o el teléfono
cierra sus otras sesiones.

Sus pestañas: **Sus datos**, **Contraseña**, **Autenticación en dos pasos**, **Sesiones** y **Guardia** (sus guardias, medios de contacto y pasos de notificación). La dirección conserva la pestaña abierta, por ejemplo `/profile#sessions`.

Los **medios de contacto** son cómo le avisa Fudo personalmente, por ejemplo cuando está de guardia:
correo, un workflow de Microsoft Teams que escribe en su chat, o Telegram (cuando un administrador
conecta un bot de Telegram en *Ajustes*). Cada uno se confirma primero con un código de 6 dígitos.
**Sus pasos de notificación** indican qué medios usar y cuándo, por ejemplo correo al momento y
Telegram a los 5 minutos, hasta que se confirma el incidente.

## Equipos y propiedad

**Equipos** agrupa a los responsables de aplicaciones e infraestructura, por ejemplo un *Equipo de
bases de datos* en un inquilino o un *Equipo de almacenamiento* en el ámbito Infraestructura global.
Cada persona es **miembro** o **responsable**; solo se puede añadir a personas con acceso al ámbito
del equipo.

Elija el **equipo propietario** en la página de una aplicación o de un activo. Así cada incidente
muestra su propietario y responsables, también los incidentes de monitores (a través de su activo o
aplicación), y lo mismo los informes posteriores al incidente. Los elementos de un inquilino
pertenecen a equipos del inquilino; la infraestructura compartida, a equipos globales. Las guardias se
definen por equipo.
