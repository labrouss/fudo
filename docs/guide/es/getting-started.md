<!-- translation-of: getting-started.md#ea57bfb7 -->
# Primeros pasos

Fudo le dice si sus aplicaciones de negocio funcionan, **por qué** están caídas y qué resolvió
problemas parecidos antes. Esta página le lleva de una instalación nueva a su primera alerta.

## 1. Primer inicio de sesión

Tras la instalación (vea [Instalación](../../admin/installation.md)), abra Fudo en el navegador.
El **asistente de configuración** pide:

1. el nombre de su organización,
2. el primer administrador (nombre, correo, contraseña de al menos 12 caracteres),
3. la autenticación en dos pasos: escanee el código QR con una aplicación de autenticación
   (Microsoft Authenticator, Google Authenticator, 1Password, …) y **guarde los códigos de
   recuperación**,
4. opcionalmente el servidor de correo (SMTP), que se usa para invitaciones, alertas e informes.
   También puede configurarlo más tarde en **Ajustes**.

La autenticación en dos pasos es obligatoria para todas las cuentas.

## 2. Cree un inquilino

Un **inquilino** es una unidad de negocio, por ejemplo *Finanzas* o *RR. HH.* Sus aplicaciones,
monitores y canales de notificación están separados de los de otros inquilinos. Vaya a
**Administración › Inquilinos › Nuevo inquilino** y elíjalo en el selector de la parte superior de
la barra lateral.

La infraestructura compartida (conmutadores troncales, cabinas de almacenamiento, clústeres)
pertenece al ámbito **Infraestructura global**; vea [Conceptos](concepts.md).

## 3. Añada un monitor

**Monitores › Añadir monitor**, elija un tipo (por ejemplo *HTTP(S)* o *Ping*), indique el destino
y pulse **Probar ahora** para ejecutar la comprobación una vez sin guardarla. Guárdelo; los
resultados aparecen en un intervalo de comprobación. Para muchos hosts a la vez, use **Añadir en
bloque / plantillas**; vea [Monitores](monitors.md).

## 4. Agrupe monitores en una aplicación

**Aplicaciones › Nueva aplicación** y añada los monitores que forman el servicio (frontal web, API,
base de datos). El estado de la aplicación indica si el servicio funciona y, si no, por qué.
Defina un **objetivo de SLA** para seguirlo en los informes.

## 5. Reciba notificaciones

**Notificaciones › Añadir canal**: correo, Microsoft Teams, Slack, un webhook JSON o uno de más de
100 más (Telegram, PagerDuty, pasarelas SMS, …). **Enviar prueba** comprueba el canal. Vea
[Notificaciones](notifications.md).

## 6. Invite a sus compañeros

**Administración › Usuarios › Invitar usuario**: elija su idioma y su rol por inquilino. Reciben un
enlace de un solo uso para elegir contraseña y configurar la autenticación en dos pasos. Vea
[Usuarios y acceso](users-and-access.md).

## Siguientes pasos

- [Conceptos](concepts.md): ámbitos, activos, dependencias y cómo encuentra Fudo la causa raíz
- [Incidentes](incidents.md): qué ocurre cuando algo falla
- [Solución de problemas](troubleshooting.md): preguntas frecuentes
