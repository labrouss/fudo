<!-- translation-of: maintenance.md#f097f823 -->
# Ventanas de mantenimiento

Planifique los trabajos para que no avisen a nadie ni cuenten contra la disponibilidad.

**Mantenimiento › Programar mantenimiento**: indique un título, inicio y fin, notas (petición de
cambio, contacto, plan de vuelta atrás) y qué **abarca**: activos (con sus comprobaciones) y
monitores.

Durante la ventana:

- las comprobaciones siguen ejecutándose, para que vea qué ocurre,
- sus resultados se **excluyen de la disponibilidad** y del SLA,
- las **alertas se suprimen**,
- lo que depende de algo en mantenimiento lo muestra como causa (*Afectado por mantenimiento*),
  para que nadie persiga una parada programada.

**Terminar ahora** cierra una ventana antes de tiempo. Las ventanas aparecen como *Programado*,
*En curso* o *Finalizado*.

Consejo: use antes **¿Y si esto falla?** en el activo para ver a qué aplicaciones afectará el
trabajo.

## Mantenimiento recurrente

Elija **Repetir** al programar: cada día, cada semana en los días elegidos, o cada mes, en un día del
mes (el 31 cae en el último día de los meses más cortos) o en un día de una semana (el *martes de la
segunda semana* es el Patch Tuesday de Microsoft). Las horas son de la zona horaria elegida, así que
las 02:00 siguen siendo las 02:00 tras el cambio de hora; una hora de fin anterior al inicio significa
el día siguiente.

Fudo crea las ventanas de los próximos 60 días, marcadas con **Se repite**. **Omitir** quita una
aparición, y editar una ventana solo cambia esa aparición. Editar la serie cambia sus ventanas
futuras; eliminarla las quita, mientras las pasadas y las que están en curso se mantienen.
