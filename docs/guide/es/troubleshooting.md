<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Solución de problemas

### Recibí una alerta, pero la lista de incidentes está vacía

- **Otro inquilino**: la lista muestra el ámbito elegido en la barra lateral. Un canal con *todos
  los inquilinos* recibe los incidentes de cada inquilino; cambie de inquilino para verlos.
- **Ya resuelto**: los cortes breves abren y cierran un incidente en minutos; mire en *Resuelto*.
- **No es de Fudo**: los mensajes de chat de Fudo empiezan por **[Fudo]** y nunca contienen códigos
  de error en bruto como `EHOSTUNREACH`. Si otra herramienta de monitorización (por ejemplo Uptime
  Kuma) sigue publicando en el mismo chat, la alerta vino de ella. El **Registro** del canal lista
  todo lo que envió Fudo.

### Un monitor falla con «Host inaccesible» o «Tiempo agotado»

La comprobación se ejecuta desde el contenedor **worker** de Fudo, no desde su equipo. Asegúrese de
que el host del worker llega al destino (enrutamiento, cortafuegos). Para Ping, los contenedores
necesitan la capacidad `NET_RAW` (definida en `docker-compose.yml`).

### «El certificado del servidor SMTP no es de confianza»

Su relé de correo usa un certificado autofirmado o interno. Active **Aceptar certificados
autofirmados** en Ajustes › Correo (SMTP).

### Todo lo que hay detrás de un conmutador se puso en rojo a la vez

Es lo esperado, y Fudo lo gestiona: el conmutador está **Caído** (causa raíz) y lo que hay detrás
está **Afectado**. Recibe un incidente raíz con los demás enlazados a él. Asegúrese de que las
dependencias están modeladas (el activo *depende del* conmutador) para que Fudo lo sepa.

### Un cambio programado avisó al equipo de guardia

Cree antes una [ventana de mantenimiento](maintenance.md) para los activos afectados: las
comprobaciones continúan, pero las alertas se suprimen y el tiempo no cuenta contra la
disponibilidad.

### Los incidentes de una aplicación no llegan a nadie

Abra la aplicación: su tarjeta **Notificaciones** avisa cuando ningún canal recibe sus incidentes
(por ejemplo cuando todos los canales tienen *Solo incidentes de las aplicaciones seleccionadas*
sin ella).

### La página muestra «Reconectando con las actualizaciones en directo»

El navegador perdió la conexión con la API; las páginas se vuelven a actualizar solas en cuanto
vuelve. Si persiste, compruebe que un proxy delante de Fudo permite conexiones de larga duración
(Server-Sent Events) a `/api/live`.

### Perdí el teléfono

Inicie sesión con un código de recuperación o pida a un administrador que **restablezca la 2FA**
de su cuenta.
