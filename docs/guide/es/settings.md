<!-- translation-of: settings.md#401e7e53 -->
# Ajustes

**Ajustes** (en la parte inferior de la barra lateral) reúne sus preferencias personales, para
todos, y los ajustes del sistema, para los superadministradores.

Cada sección es una pestaña. La dirección conserva la pestaña abierta (por ejemplo `/settings#retention`), así que una pestaña se puede guardar en marcadores o enviar como enlace.

## Sus preferencias

- **Idioma de la interfaz**: 13 idiomas, incluido el árabe con diseño de derecha a izquierda. Se
  guarda en su perfil, así que le acompaña en cualquier navegador. También se traducen los títulos
  de incidentes y los resultados de las comprobaciones.
- **Tema**: **Sistema** (sigue el modo claro u oscuro de su sistema operativo), **Claro**,
  **Oscuro**, **Monokai**, además de los temas que añada su administrador.

## Ajustes del sistema (superadministradores)

### Idioma de las notificaciones

**Idioma predeterminado** de las notificaciones y los informes programados. Cada canal y cada
programación puede usar el suyo; los correos a una persona (invitaciones, restablecimientos) usan
el idioma de esa persona. No cambia la interfaz: cada persona la elige en *Preferencias*.

### Correo (SMTP)

Se usa para invitaciones, alertas por correo e informes programados.

| Campo | Notas |
|---|---|
| Host SMTP, puerto | 587 (STARTTLS) o 465 (*Usar TLS desde el inicio*); 25 para un relé interno |
| Usuario, contraseña | opcionales; la contraseña se guarda cifrada y no se vuelve a mostrar |
| Dirección del remitente | p. ej. `fudo@corp.local` |
| **Aceptar certificados autofirmados** | para un relé local con certificado autofirmado o interno: la conexión sigue cifrada, solo se omite la comprobación del certificado |

**Enviar correo de prueba** indica el motivo exacto cuando algo falla: un certificado que no es de
confianza, una contraseña incorrecta, un servidor inaccesible o un modo TLS que no coincide con el
puerto.

## Para administradores

Se pueden añadir idiomas y temas nuevos dejando archivos en carpetas, sin reconstruir; vea
`locales/README.md` y `themes/README.md` en el repositorio.

## Conservación de datos

**Ajustes › Conservación de datos** (superadministradores) fija cuánto tiempo se conserva cada tipo de datos y muestra el espacio que ocupa: resultados sin procesar, resúmenes por hora y diarios, historial de estados, incidentes resueltos, registro de notificaciones, registro de auditoría y ventanas de mantenimiento finalizadas. Los datos antiguos se eliminan cada hora, poco a poco. Unos mínimos protegen lo que muestra Fudo (gráficos de 90 días, informes de disponibilidad, páginas de estado), y siempre se conserva el último cambio de estado anterior al límite, para que la disponibilidad siga siendo exacta. Nunca se eliminan incidentes abiertos ni notificaciones pendientes de envío.
