<!-- translation-of: notifications.md#5487cd95 -->
# Notificaciones

## Canales

**Notificaciones › Añadir canal**. Integrados: **Correo** (necesita el servidor SMTP de Ajustes),
**Microsoft Teams** (webhook de Workflows), **Slack** (incoming webhook) y **Webhook (JSON)**. Más
de 100 más (Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal, Twilio y otras
pasarelas SMS, Mattermost, Matrix, Google Chat, …) provienen de los proveedores de notificación de
Uptime Kuma. **Enviar prueba** comprueba un canal; **Registro** muestra cada envío y por qué se
omitió un canal.

Los mensajes de chat empiezan por **[Fudo]**, para distinguirlos fácilmente de otras herramientas
que publican en el mismo chat.

## Qué incidentes recibe un canal

| Ajuste | Efecto |
|---|---|
| **Enviar** | *Todos los incidentes de este inquilino* (predeterminado) o *Solo incidentes de las aplicaciones seleccionadas* |
| **Gravedad mínima** | Bajo y superiores (todos), Alto y Crítico, o solo Crítico |
| **Eventos** | apertura, confirmación, resolución |
| **Omitir incidentes causados por otro incidente** | solo causas raíz, no los incidentes afectados enlazados a ellas |
| **Recordar mientras no se confirme** | repetir cada N minutos mientras nadie confirme |
| **Idioma de los mensajes** | el idioma del canal; predeterminado: el de la organización (Ajustes) |

Los canales de un inquilino reciben sus incidentes, incluidos los causados por la infraestructura
compartida (con la causa raíz en el mensaje). Los canales globales reciben incidentes de
infraestructura; con **todos los inquilinos** (un canal de NOC) reciben además los incidentes de
cada inquilino, salvo los causados por un incidente de infraestructura que ya recibieron.

**Por aplicación:** un canal con *Solo incidentes de las aplicaciones seleccionadas* solo se
entera de esas. Elíjalas en el formulario del canal, o en la página de una aplicación, en su
tarjeta **Notificaciones**, que también avisa cuando los incidentes de una aplicación no llegan a
ningún canal.

## Escalado

Dé a un canal un retraso (**Escalar: sin confirmar tras 15 min**) y se convierte en un paso de
escalado: solo se le notifica si el incidente sigue abierto, sin confirmar y sin silenciar tras
ese tiempo, y después recibe su confirmación y su resolución. Encadene varios: Teams al momento →
SMS de guardia a los 15 minutos → responsable a los 60 minutos.

## Entrega

Los mensajes pasan por una cola de salida con reintentos (tras 1, 5 y 15 minutos) y un límite de
envío por canal, para que una avalancha de incidentes no haga bloquear su bot o su relé de correo.

## Contenido del webhook

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Defina un **secreto de firma** para recibir `X-Fudo-Signature: sha256=<HMAC del cuerpo>`. El
contenido sigue en inglés (es un formato estable para integraciones); `incident.titleParts` lleva
el título como códigos de mensaje, por si quiere traducirlo usted.

## Guardias

Los equipos avisan a personas por los incidentes de sus elementos. En **Equipos › Guardia**, ordene a los
miembros en la rotación, elija la duración de la guardia (un día, una semana, dos semanas o cualquier
número de días), la hora del relevo y la zona horaria, y los incidentes por los que avisar. Los pasos de
**escalado** indican a quién se avisa y cuándo, desde que se abrió el incidente: por ejemplo a la persona
de guardia al momento, a la siguiente a los 15 minutos y a los responsables a los 30. Las
**sustituciones** permiten que otra persona cubra un periodo, como un cambio o unas vacaciones.

A cada persona se la avisa con sus propios pasos de notificación (vea *Su perfil*), o por correo a su
dirección de inicio de sesión si no tiene. Los avisos paran en cuanto alguien confirma el incidente y se
pausan mientras está silenciado. La página del incidente muestra a quién se avisó y qué se envió; su
perfil muestra sus próximas guardias.

Los mensajes de guardia incluyen los enlaces **Confirmar** y **Abrir en Fudo** (configure `PUBLIC_URL`). Confirmar abre una página donde un toque confirma el incidente en su nombre, sin iniciar sesión; solo abrir el enlace no cambia nada, así que las vistas previas de enlaces y los analizadores de correo no pueden confirmar por error. Cada enlace funciona una vez, durante 24 horas, mientras el incidente está abierto, y solo si su rol permite confirmar incidentes.
