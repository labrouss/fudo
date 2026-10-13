<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Paneles e informes

## Resumen

Incidentes abiertos, tiempo medio de recuperación (MTTR, 30 días), monitores operativos y con
fallos, aplicaciones dentro de su objetivo de SLA y una tarjeta por aplicación con su franja de
disponibilidad de 30 días. Las páginas se actualizan en directo (alrededor de un segundo tras un
cambio); la barra lateral muestra **En directo** mientras hay conexión.

La **disponibilidad** sale del historial de estados: el tiempo caído y afectado cuenta en contra;
el mantenimiento programado y el tiempo anterior a la primera comprobación, no.

## Gráficos

Cada monitor muestra su tiempo de respuesta en 1 h, 6 h, 24 h, 7, 30 y 90 días (media, p95,
fallos, mantenimiento), sus últimas comprobaciones como franja de latidos, sus cambios de estado y
sus resultados recientes.

## Informes

**Informes** muestra, por aplicación (o por activo compartido en el ámbito Infraestructura
global): disponibilidad 24/7 y en **horario laboral**, tiempo caído, mantenimiento programado,
incidentes, SLA cumplido o no, MTTA (tiempo hasta confirmar) y MTTR (tiempo hasta resolver). Elija
la semana pasada, el mes pasado, los últimos 30 días o fechas propias, y descárguelo como:

- **PDF**: en su idioma; los informes en árabe se maquetan de derecha a izquierda,
- **CSV**: disponibilidad e incidentes, UTF-8 para Excel, con nombres de columna en inglés para
  que hojas de cálculo y scripts sigan funcionando.

## Informes programados

**Informes › Nueva programación** envía por correo el PDF y/o el CSV cada lunes (semana anterior)
o el día 1 (mes anterior) a la hora y zona horaria elegidas, en el idioma de la programación, a
través del servidor SMTP de Ajustes. **Enviar ahora** envía de inmediato el último periodo.

## Páginas de estado

**Páginas de estado › Nueva página de estado** muestra aplicaciones, activos y monitores elegidos
en una página propia en `/status/<dirección>`, con el estado general, 90 días de disponibilidad, los
incidentes actuales y los mantenimientos. Cada elemento recibe un **nombre visible**, que se muestra
en lugar del nombre interno; los elementos del mismo grupo aparecen juntos. Las páginas de un
inquilino pueden incluir infraestructura compartida.

- **Pública**: cualquiera con el enlace, sin iniciar sesión. La página solo muestra nombres visibles
  y estados simples (*Operativo, Degradado, Interrupción, Mantenimiento*), nunca nombres internos,
  causas, títulos de incidentes ni nombres de mantenimientos.
- **Interna**: usuarios con sesión iniciada y acceso al inquilino, que además ven los títulos de
  incidentes y los nombres de mantenimientos.

La página se actualiza cada minuto y usa el idioma y el modo claro u oscuro del visitante.
