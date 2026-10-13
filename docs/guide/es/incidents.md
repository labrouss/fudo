<!-- translation-of: incidents.md#4e781264 -->
# Incidentes

Fudo abre incidentes por sí mismo cuando algo falla y los resuelve cuando se recupera.

## Cuándo se abre un incidente

| Elemento | Abre un incidente cuando | Gravedad |
|---|---|---|
| **Aplicación** | está Caída, o Afectada por una causa no programada | según su criticidad: crítica → Crítico, alta → Alto, otras → Bajo |
| **Activo** | está Caído (es una causa raíz) | Alto |
| **Monitor** | está Caído y no forma parte de un activo ni de una aplicación | Bajo |

Un incidente **Afectado** se enlaza con el incidente de su causa raíz (*Causado por INC-…*): un
conmutador caído da un incidente raíz con incidentes afectados claramente enlazados, no una
avalancha de alertas.

## Vida de un incidente

1. Se **abre** automáticamente y salen las notificaciones (vea [Notificaciones](notifications.md)).
2. **Confirmar** indica que alguien se ocupa; se detienen los recordatorios y las escaladas.
3. **Silenciar** acalla las notificaciones un tiempo (30 minutos a 1 día) sin confirmar.
4. Se **resuelve** automáticamente cuando el elemento se recupera. Si vuelve a fallar en 5
   minutos, el mismo incidente se **reabre** en vez de crear uno nuevo. También puede resolverlo a
   mano.

La **cronología** registra cada paso: cambios de estado, notificaciones, confirmaciones y notas.

## Notas: comparta lo aprendido

Añada notas a la cronología como **Comentario**, **Acción realizada** o **Resolución**, con
etiquetas (p. ej. `supervisor`, `firmware`).

Las resoluciones se reutilizan: cuando más adelante ocurre un incidente parecido (mismo elemento,
misma causa raíz, etiquetas en común o texto similar), **Incidentes anteriores similares** muestra
qué lo resolvió, y sus alertas lo citan: *«La última vez (INC-0041, 12 ago 2026) se resolvió así:
…»*.

## Encontrar incidentes

**Incidentes** lista los incidentes **abiertos** del ámbito elegido en la barra lateral; cambie a
*Resuelto* para el historial y busque por título, número INC o etiqueta. Los incidentes de otro
inquilino aparecen al cambiar a ese inquilino (vea [Solución de problemas](troubleshooting.md)).

## Informes posteriores al incidente

**Informe posterior al incidente** en un incidente descarga un informe en **PDF** o **Markdown** (para una wiki o un ticket): un resumen con las horas y quién lo confirmó y resolvió, los incidentes afectados, la resolución y las acciones realizadas, la cronología, las notificaciones enviadas y los incidentes anteriores similares. Usa su idioma y su zona horaria, y puede crearse mientras el incidente sigue abierto.
