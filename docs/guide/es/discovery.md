<!-- translation-of: discovery.md#cb4482b3 -->
# Descubrimiento

El **descubrimiento** encuentra los equipos de su infraestructura y propone para cada uno un
activo y monitores. No se crea nada hasta que usted elija: revisa lo encontrado, ajusta nombres y
monitores y crea los equipos que quiera en el ámbito que quiera.

El descubrimiento se ejecuta en el **ámbito de infraestructura global** (superadministradores y
administradores de infraestructura). El worker hace el análisis, así que necesita acceso de red a
lo que descubra; avise a su equipo de redes antes de analizar una red.

## Fuentes

| Fuente | Encuentra | Necesita |
|---|---|---|
| **Análisis de subred** | cada equipo que responde en una red: ping, algunos puertos TCP (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP y, por HTTPS, Redfish (iLO, iDRAC) y la API de vSphere (ESXi, vCenter) | redes (`10.0.12.0/24`), rangos (`10.0.20.10-60`), direcciones o nombres de host, como máximo 4096 direcciones; opcionalmente credenciales SNMP |
| **Inventario de vCenter** | el vCenter, sus hosts ESXi (etiquetados `cluster:<nombre>`) y sus VM, con la dirección y el sistema operativo de cada VM obtenidos de VMware Tools; cada VM depende de su host | el vCenter y una cuenta de solo lectura (credencial compartida) |
| **Vecinos de switches (LLDP/CDP)** | quién está conectado a qué puerto de switch; los servidores, hosts ESXi y almacenamiento detrás de un puerto dependen de ese switch, los enlaces entre switches se listan | los switches y credenciales SNMP |
| **HPE OneView** | chasis Synergy, módulos de cómputo con su dirección iLO, interconexiones; cada uno depende de su chasis | el appliance de OneView y una cuenta de solo lectura |

Las credenciales son credenciales compartidas del ámbito global (**Credenciales**): comunidades
SNMP o usuarios SNMPv3 para el análisis de subred y los vecinos de switches, una cuenta y
contraseña para vCenter y OneView. Solo el worker las lee.

## Cómo se reconoce un equipo

El análisis de subred reconoce un equipo por lo que responde: un servicio Redfish es un
controlador de gestión (iLO), la API de vSphere es ESXi o vCenter, SNMP indica el fabricante (por
su número de empresa) y el tipo de equipo (por su descripción: switch, switch FC, firewall,
router, cabina de almacenamiento, Windows, Linux…), y los puertos abiertos ayudan cuando nada más
lo hace (RDP y SMB: Windows; SQL Server; SSH: Linux). El nombre viene de SNMP, del DNS inverso o
del certificado.

Cada tipo propone una plantilla de monitores (por ejemplo *HPE iLO / BMC* o *Host VMware ESXi*) y
un tipo de activo. Cámbielo por equipo: otra plantilla, **Solo ping** o **Solo activo** (sin
monitores, p. ej. para un chasis o una VM sin dirección).

## Revisar y crear

- La lista muestra de cada equipo la dirección, el nombre (editable), a qué se parece
  (fabricante, modelo, detalles como puertos abiertos, descripción SNMP, clúster, puerto de
  switch) y los monitores propuestos.
- Los equipos **conocidos** —existe en algún ámbito un activo con esa dirección (o, sin dirección,
  con ese nombre), o hay monitores que comprueban esa dirección— se ocultan; desmarque *Ocultar
  equipos conocidos* para verlos y saber dónde están.
- Marque equipos, elija **Crear en** (el ámbito global o un inquilino) y etiquetas opcionales y
  luego **Vista previa**: la misma vista previa que una importación de configuración, con cada
  activo y monitor que se creará. **Crear** la aplica.
- Las dependencias se conservan cuando ambos equipos se crean juntos o cuando aquel del que se
  depende ya existe en ese ámbito (o en el ámbito global).
- Un descubrimiento en curso se puede detener; los terminados se pueden eliminar (lo creado
  permanece).
