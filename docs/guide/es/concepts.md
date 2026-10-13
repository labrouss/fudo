<!-- translation-of: concepts.md#61c26734 -->
# Conceptos

## Ámbitos: inquilinos e infraestructura global

| Ámbito | Contiene | Lo administran |
|---|---|---|
| **Inquilino** (uno por unidad de negocio) | sus aplicaciones, monitores, activos, canales e informes | administradores de inquilino |
| **Infraestructura global** | activos compartidos (conmutadores, cabinas de almacenamiento, fabrics FC, clústeres) y sus monitores | administradores de infraestructura y superadministradores |

Elija el ámbito en el selector de la parte superior de la barra lateral. Los inquilinos ven la
infraestructura compartida en solo lectura y enlazan con ella sus propios monitores y
aplicaciones, de modo que un fallo de almacenamiento aparece como causa en cada aplicación que lo
necesita.

## Piezas básicas

| Pieza | Qué es | Ejemplo |
|---|---|---|
| **Monitor** | una comprobación que se ejecuta periódicamente | HTTPS en `erp.corp.local/health` |
| **Activo** | una pieza de infraestructura, comprobada por sus monitores | `Core-SW-01`, `SAN-A` |
| **Aplicación** | un servicio de negocio: monitores (miembros) más la infraestructura que necesita | *ERP Production* |
| **Dependencia** | «esto necesita aquello»: activo → activo, aplicación → activo | clúster ESXi → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

En un activo, **Añadir existentes** le asigna monitores que ya tiene (uno que está en otro activo se traslada) y **Nuevo monitor** abre el formulario de monitor para él. Un inquilino también puede poner sus propios monitores en un activo global compartido; **Quitar** saca un monitor del activo y lo conserva.

## Estados

| Estado | Significado |
|---|---|
| **Operativo** | funciona |
| **Degradado** | funciona, pero lento o en parte (p. ej. un miembro opcional está caído) |
| **Caído** | falla, y nada de lo que necesita lo explica: es una **causa raíz** |
| **Afectado** | falla **porque** algo de lo que depende está caído; las alertas señalan la causa raíz |
| **En riesgo** | funciona, pero algo de lo que depende tiene un problema |
| **Mantenimiento** | en una ventana de mantenimiento programada: no cuenta contra la disponibilidad |
| **Pendiente** | aún sin resultado |

## Cómo encuentra Fudo la causa raíz

| Situación | Resultado |
|---|---|
| Las comprobaciones de un activo fallan y nada de lo que necesita está caído | **Caído**: causa raíz, con su propio incidente |
| Sus comprobaciones fallan **y** algo de lo que depende está caído | **Afectado por** esa causa raíz: sin avalancha de alertas |
| Sus comprobaciones pasan pero algo de lo que depende está caído | mantiene su estado, marcado **En riesgo** |
| Algo de lo que depende está en mantenimiento programado | **Afectado por mantenimiento** (programado, excluido de la disponibilidad) |

Una aplicación está sana cuando lo están sus miembros, según su regla: **todos los miembros
obligatorios operativos**, **al menos uno** o **al menos N de M** (para servicios redundantes).
Los miembros obligatorios deciden el estado; los opcionales solo pueden dejarla *Degradada*.

**¿Y si esto falla?** en un activo predice qué aplicaciones caerían, y cuáles resistirían gracias
a la redundancia, antes de pararlo para una intervención.

La página **Topología** dibuja todo con el estado en directo: pase el cursor sobre un elemento para
seguir sus dependencias; *Solo problemas* muestra lo que falla y lo que depende de ello.
