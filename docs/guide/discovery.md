# Discovery

**Discovery** finds the devices of your infrastructure and suggests an asset and monitors for
each. Nothing is created until you choose: you review what was found, adjust names and monitors,
and create the devices you want in the scope you want.

Discovery runs in the **Global infrastructure scope** (superadmins and infrastructure admins).
The worker does the scanning, so it needs network access to what you discover; tell your network
team before scanning a network.

## Sources

| Source | Finds | Needs |
|---|---|---|
| **Subnet scan** | every device that answers on a network: ping, a few TCP ports (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP, and over HTTPS Redfish (iLO, iDRAC) and the vSphere API (ESXi, vCenter) | networks (`10.0.12.0/24`), ranges (`10.0.20.10-60`), addresses or host names, at most 4096 addresses; optionally SNMP credentials |
| **vCenter inventory** | the vCenter, its ESXi hosts (tagged `cluster:<name>`) and VMs, with each VM's address and operating system from VMware Tools; each VM depends on its host | vCenter and a read-only account (shared credential) |
| **Switch neighbours (LLDP/CDP)** | who is connected to which switch port; servers, ESXi hosts and storage behind a port depend on that switch, links between switches are listed | the switches and SNMP credentials |
| **HPE OneView** | Synergy frames, compute modules with their iLO address, interconnects; each depends on its frame | the OneView appliance and a read-only account |

Credentials are shared credentials of the Global scope (**Credentials**): SNMP communities or
SNMPv3 users for the subnet scan and switch neighbours, an account and password for vCenter and
OneView. They are read by the worker only.

## What a device looks like

The subnet scan recognises a device by what answers: a Redfish service is a management
controller (iLO), the vSphere API is ESXi or vCenter, SNMP tells the vendor (from its
enterprise number) and the kind of device (from its description: switch, FC switch, firewall,
router, storage array, Windows, Linux…), and open ports help when nothing else does (RDP and SMB:
Windows; SQL Server; SSH: Linux). The name comes from SNMP, reverse DNS or the certificate.

Each kind suggests a monitor template (for example *HPE iLO / BMC* or *VMware ESXi host*) and an
asset kind. Change it per device: another template, **Ping only**, or **Asset only** (no
monitors, e.g. a frame or a VM without an address).

## Review and create

- The list shows each device's address, name (editable), what it looks like (vendor, model,
  details such as open ports, SNMP description, cluster, switch port) and the suggested monitors.
- **Known** devices — an asset with that address (or, without an address, that name) exists in
  any scope, or monitors check that address — are hidden; untick *Hide known devices* to see
  them and where they are.
- Tick devices, choose **Create in** (the Global scope or a tenant) and optional tags, then
  **Preview**: the same preview as a configuration import, with every asset and monitor to
  create. **Create** applies it.
- Dependencies come along when both devices are created together, or when the one depended on
  already exists in that scope (or in the Global scope).
- A running discovery can be stopped; finished ones can be deleted (what was created stays).
