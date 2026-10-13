<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitores

## La lista

La lista de monitores muestra el **activo** de cada monitor y las **aplicaciones** a las que pertenece (una pertenencia opcional tiene un borde discontinuo); ambos son enlaces. Haga clic en el encabezado de una columna para ordenar (otra vez para invertir, una tercera para el orden predeterminado); Fudo recuerda el orden en este navegador. El filtro busca en nombres, destinos, etiquetas, activos y aplicaciones; ignora mayúsculas y acentos, y deben coincidir todas las palabras. Las demás listas largas (activos, incidentes, usuarios, mantenimientos, canales y otras) se ordenan y filtran igual.

## Tipos de monitor

| Categoría | Tipo | Comprueba |
|---|---|---|
| Web | **HTTP(S)** | rangos de códigos de estado, palabra clave presente/ausente, valor JSON (`$.status`), cabeceras, cuerpo, tiempo de respuesta |
| | **Certificado TLS** | confianza, nombre de host, días hasta la caducidad (Degradado dentro de N días, Caído al caducar) |
| Red | **Ping** | accesibilidad, latencia, pérdida de paquetes |
| | **Puerto TCP** | el puerto acepta conexiones |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, respuesta esperada opcional, resolutor elegido |
| | **SNMP** | lee un OID (v1, v2c, v3) y compara el valor o, en los contadores, su cambio por segundo |
| | **Interfaz de red (SNMP)** | un puerto de switch, router o firewall: estado del enlace, tráfico de entrada y salida (bit/s y % de la velocidad del enlace), errores; en gráfico a lo largo del tiempo |
| | **NTP** | accesibilidad, estrato, desfase del reloj |
| | **SMTP** | saludo 220, EHLO, STARTTLS opcional |
| | **LDAP / Active Directory** | el directorio responde (Active Directory: degradado mientras el controlador de dominio no esté sincronizado), o una cuenta inicia sesión y una búsqueda encuentra entradas; indica cuentas bloqueadas, caducadas y desactivadas |
| | **Caducidad de dominio** | caducidad del registro vía RDAP (con WHOIS como respaldo) |
| Bases de datos | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | se conecta, consulta opcional con resultado esperado |
| Sistemas | **Comando SSH** | código de salida o salida (contiene, exacta, regex), fijación opcional de la clave del host |
| | **Contenedor Docker** | en ejecución, y sano si tiene comprobación de salud |
| Infraestructura | **VM de vCenter** | estado de alimentación, VMware Tools (vCenter 6.7, 7, 8) |
| | **Salud HPE iLO / Redfish** | salud del hardware del servidor desde el BMC (iLO 4/5/6, iDRAC, otros BMC con Redfish) |
| | **Temperatura de entrada (iLO / Redfish)** | temperatura del aire que entra en el servidor, es decir, delante de su rack: degradado desde 27 °C, caído desde 32 °C (ASHRAE), con gráfico |
| | **Temperatura de sala** | todos los sensores de entrada con la etiqueta `room:<name>` juntos: caído cuando varios están calientes (problema de refrigeración), degradado cuando uno está caliente o varios suben rápido |
| Pasivo | **Heartbeat push** | una tarea llama a una URL; Caído cuando deja de llamar |
| | **Traps SNMP** | traps que envía un equipo (v1, v2c): caído o degradado mientras haya un trap de problema abierto; se borra solo, con un trap de fin o a mano |

**Probar ahora** ejecuta una comprobación una vez desde el servidor de Fudo sin guardarla, para
ajustarla antes de que empiece a alertar.

## Evitar falsas alarmas

- **Caído tras N fallos**: un monitor pasa a Caído solo tras N comprobaciones fallidas seguidas,
  reintentando entretanto con el *intervalo de reintento*, más rápido.
- **Operativo tras M éxitos**: solo se recupera tras M comprobaciones correctas seguidas.
- **Degradado por encima de**: las respuestas lentas cuentan como Degradado en vez de Caído.

## Credenciales

Contraseñas, comunidades SNMP, claves SSH y similares se guardan **cifradas** y no se vuelven a
mostrar, exportar ni devolver por la API; solo el worker las descifra para ejecutar una
comprobación. Use cuentas de solo lectura: un rol de vCenter *Read-only*, un usuario de iLO con el
privilegio *Login*, un usuario de base de datos solo con `CONNECT`/`SELECT`.

### Credenciales compartidas

Cuando muchos monitores inician sesión con la misma cuenta (un usuario de iLO de solo lectura para
todos los servidores, una comunidad SNMP para los switches), guárdela una vez en **Credenciales** y
deje que los monitores la usen. Cuando cambie la contraseña, edite la credencial una sola vez:
todos los monitores que la usan vuelven a comprobar enseguida con el nuevo valor.

- Una credencial tiene un tipo: *Cuenta y contraseña*, *Clave SSH*, *Comunidad SNMP (v1, v2c)* o
  *Usuario SNMPv3*. En el formulario del monitor, los tipos que inician sesión ofrecen
  **Introducirla aquí** o **Usar una credencial compartida**; con una credencial, los campos de la
  cuenta desaparecen del formulario.
- Las credenciales pertenecen a un ámbito: los monitores de un inquilino solo pueden usar las
  credenciales de ese inquilino, y los del ámbito de la infraestructura global solo las globales.
- Los secretos son de solo escritura, como los de un monitor: se guardan cifrados y nunca se
  muestran, exportan ni devuelven. La lista muestra la cuenta y qué monitores la usan.
- **La misma cuenta en varios monitores**: la página lista los monitores que ya guardan la misma
  cuenta y contraseña. Dé un nombre al grupo y elija **Crear credencial compartida**: la contraseña
  se copia en el servidor, nadie necesita conocerla.
- **Usar para…** asigna más monitores a una credencial; su propia cuenta y contraseña se eliminan.
  Una credencial en uso no se puede eliminar ni cambiar de tipo.
- Un monitor que deja de usar una credencial vuelve a necesitar su propia contraseña.
- En la [configuración como código](configuration-as-code.md) un monitor nombra su credencial
  (`credential: iLO read-only`); la credencial se crea en la interfaz. El alta masiva de
  comprobaciones de temperatura también puede usarla.
- Cada cambio queda en el registro de auditoría, con los nombres de los secretos modificados, nunca
  sus valores.

## Monitores push

Un monitor push espera a que su tarea lo llame. Tras guardarlo, su página muestra la URL:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Pasa a Caído cuando no llega ninguna llamada dentro del intervalo más el periodo de gracia.
**Nueva URL** sustituye el token si se ha filtrado.

## Añadir en bloque y plantillas

**Monitores › Añadir en bloque / plantillas** crea comprobaciones para muchos hosts a la vez:

1. pegue un host o una URL por línea (o cargue un CSV con `name,host,port`),
2. elija una **plantilla**, por ejemplo *servidor Windows* (ping, RDP, WinRM), *servidor Linux*,
   *HPE iLO*, *dispositivo de red*, *host ESXi*, *vCenter*, *SQL Server*, *cabina de
   almacenamiento* o *aplicación web*, o un solo tipo de comprobación,
3. opcionalmente cree un activo por línea, hágalos depender de un activo existente y añádalos a
   una aplicación.

Antes de aplicarlo muestra una vista previa de todo lo que creará.

## Notas por tipo

- **VM de vCenter** encuentra sola la versión correcta de la API y reutiliza las sesiones (un
  inicio de sesión por vCenter cada 20 minutos). La comprobación de VMware Tools requiere vCenter
  7.0 o posterior.
- **HPE iLO / Redfish** nombra la pieza que falla en HPE iLO (ventiladores, fuentes de
  alimentación, almacenamiento, redundancia). Warning → Degradado, Critical o apagado → Caído.
- **Comando SSH**: indique la *Huella de la clave del host* (`ssh-keyscan host | ssh-keygen -lf -`)
  para que una clave de servidor cambiada se notifique en vez de aceptarse.
- **Contenedor Docker** usa el socket local de Docker (móntelo en el contenedor del worker, vea
  `docker-compose.yml`) o una URL de API de Docker remota.
- **Caducidad de dominio**: algunos registros nacionales no publican ni RDAP ni WHOIS; Fudo lo
  indica como Degradado con una explicación.
- **Ping** necesita la capacidad `NET_RAW` en el contenedor del worker, y en el de la API para
  **Probar ahora** (ambas definidas en `docker-compose.yml`).

## Traps SNMP

Dirija los traps SNMP (v1 o v2c) de sus equipos al servidor Fudo, puerto UDP 162. La página
**Traps** muestra si se están recibiendo traps y cada trap con sus campos.

- Un monitor **Traps SNMP** recoge los traps de los equipos indicados en **De**: direcciones,
  nombres de host o rangos IPv4 (`10.0.12.0/24`). Con una **Comunidad** (o una credencial
  compartida de tipo comunidad SNMP) solo recoge los traps que la llevan; la comunidad nunca se
  guarda.
- **Traps de problema**: los estándar (link down, arranque en frío y en caliente, fallo de
  autenticación), solo los traps listados (nombres u OID; un OID abarca también todo lo que hay
  debajo, p. ej. el prefijo de empresa de un fabricante) o cualquier trap. *Solo si un campo
  contiene* lo limita a traps con un texto como `Critical`.
- Mientras haya un problema abierto el monitor está **Caído** (o Degradado, si lo elige); la
  incidencia, las notificaciones y las guardias funcionan como en cualquier comprobación, en menos
  de un segundo tras el trap.
- Los problemas se llevan por trap e interfaz: un link down en dos puertos son dos problemas, y el
  **link up** de un puerto solo termina el problema de ese puerto.
- **Los problemas se borran** automáticamente cuando no llega un trap nuevo durante un tiempo (30
  minutos por defecto), o solo a mano: la página del monitor lista los traps abiertos con
  **Borrar** (hasta el próximo trap que coincida). Los *traps de fin* también terminan problemas,
  p. ej. el trap «condición resuelta» de un fabricante.
- Un trap **que ningún monitor recoge** se guarda igualmente: en el inquilino del activo con esa
  dirección o, si no, en el ámbito de la infraestructura global. **Crear monitor** en la página
  Traps rellena un monitor para su equipo.
- Un equipo que inunda de traps se limita (50 por segundo, picos de 500); los traps descartados se
  cuentan en la página Traps del ámbito global. Los traps se guardan 30 días (Ajustes ›
  Conservación de datos).

## Interfaces de red

Un monitor **Interfaz de red (SNMP)** vigila un puerto de un switch, router o firewall.

- **Buscar interfaces…** (tras el host y el acceso SNMP, o una credencial compartida) lista las
  interfaces del equipo con descripción, velocidad y estado. Elija una o, al añadir, marque varias:
  cada una se convierte en un monitor con los ajustes del formulario, con el nombre de la interfaz.
- La interfaz se recuerda por su **nombre** (o descripción o alias), no por su número, porque
  algunos equipos renumeran sus interfaces tras reiniciarse. Un número también sirve.
- El **tráfico** es la diferencia entre dos lecturas de los contadores de 64 bits: la primera
  comprobación lee dos veces con dos segundos de separación; las siguientes usan la lectura
  guardada de la comprobación anterior. Tras un reinicio del equipo se descarta el par, así que no
  hay picos falsos. Los equipos sin contadores de 64 bits (SNMP v1) usan los de 32 bits, poco
  fiables por encima de unos 100 Mbit/s con un intervalo de un minuto.
- **Estado**: enlace caído → Caído; testing o dormant → Degradado; un puerto deshabilitado a
  propósito está Operativo (o Caído, si lo elige). El sentido más cargado por encima de *Degradado
  desde una utilización de* (80 % por defecto) → Degradado, por encima de *Caído desde una
  utilización de* (desactivado por defecto) → Caído; errores por minuto por encima del límite →
  Degradado. Si el equipo indica una velocidad errónea (un túnel, un circuito con límite de
  velocidad), indique *Velocidad del enlace*.
- La página del monitor muestra el tráfico de entrada y salida con la línea de Degradado.
- *Comparar: su cambio por segundo* del monitor **SNMP** hace lo mismo con cualquier contador
  (tramas de un puerto SAN, sesiones de un firewall, eventos de un SAI).

## Temperatura del centro de datos

**Temperatura** muestra cada sensor de temperatura de entrada, agrupado por su etiqueta `room:<name>` y ordenado del más caliente al más frío, con su rack (`rack:<name>`), el valor actual, las últimas 6 horas, el cambio en 15 minutos y el rango de 24 horas. **Añadir sensores** los crea para una lista de direcciones iLO (u otros BMC Redfish) con una cuenta compartida de solo lectura.

Un sensor también pasa a degradado cuando su temperatura **sube rápido** (por defecto 3 °C en 15 minutos), aunque esté por debajo de sus umbrales: la primera señal de un fallo de refrigeración. **Crear alerta de sala** añade un monitor *Temperatura de sala*: caído cuando 3 sensores están calientes, degradado cuando uno está caliente o 2 suben rápido. Abre incidentes como cualquier monitor, así que propietarios, guardias y páginas de estado también funcionan con él.
