<!-- translation-of: discovery.md#cb4482b3 -->
# Erkennung

Die **Erkennung** findet die Geräte Ihrer Infrastruktur und schlägt für jedes ein Asset und
Monitore vor. Es wird nichts angelegt, bis Sie wählen: Sie prüfen, was gefunden wurde, passen
Namen und Monitore an und legen die gewünschten Geräte im gewünschten Bereich an.

Die Erkennung läuft im **globalen Infrastrukturbereich** (Superadmins und
Infrastruktur-Administratoren). Der Worker führt die Suche aus und braucht daher Netzwerkzugriff
auf das, was Sie erkennen; informieren Sie Ihr Netzwerkteam, bevor Sie ein Netz durchsuchen.

## Quellen

| Quelle | Findet | Benötigt |
|---|---|---|
| **Subnetz-Scan** | jedes Gerät, das in einem Netz antwortet: Ping, einige TCP-Ports (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP sowie über HTTPS Redfish (iLO, iDRAC) und die vSphere-API (ESXi, vCenter) | Netze (`10.0.12.0/24`), Bereiche (`10.0.20.10-60`), Adressen oder Hostnamen, höchstens 4096 Adressen; optional SNMP-Zugangsdaten |
| **vCenter-Inventar** | das vCenter, seine ESXi-Hosts (markiert mit `cluster:<name>`) und VMs, mit Adresse und Betriebssystem jeder VM aus den VMware Tools; jede VM hängt von ihrem Host ab | das vCenter und ein Nur-Lese-Konto (gemeinsame Zugangsdaten) |
| **Switch-Nachbarn (LLDP/CDP)** | wer an welchem Switch-Port hängt; Server, ESXi-Hosts und Speicher hinter einem Port hängen von diesem Switch ab, Verbindungen zwischen Switches werden aufgelistet | die Switches und SNMP-Zugangsdaten |
| **HPE OneView** | Synergy-Frames, Compute-Module mit ihrer iLO-Adresse, Interconnects; jedes hängt von seinem Frame ab | die OneView-Appliance und ein Nur-Lese-Konto |

Zugangsdaten sind gemeinsame Zugangsdaten des globalen Bereichs (**Zugangsdaten**):
SNMP-Communities oder SNMPv3-Benutzer für den Subnetz-Scan und die Switch-Nachbarn, ein Konto mit
Passwort für vCenter und OneView. Nur der Worker liest sie.

## Woran ein Gerät erkannt wird

Der Subnetz-Scan erkennt ein Gerät daran, was antwortet: Ein Redfish-Dienst ist ein
Management-Controller (iLO), die vSphere-API ist ESXi oder vCenter, SNMP nennt den Hersteller
(über seine Enterprise-Nummer) und die Geräteart (über seine Beschreibung: Switch, FC-Switch,
Firewall, Router, Speichersystem, Windows, Linux…), und offene Ports helfen, wenn sonst nichts
hilft (RDP und SMB: Windows; SQL Server; SSH: Linux). Der Name stammt aus SNMP, dem Reverse-DNS
oder dem Zertifikat.

Jede Art schlägt eine Monitorvorlage (zum Beispiel *HPE iLO / BMC* oder *VMware-ESXi-Host*) und
eine Asset-Art vor. Ändern Sie sie je Gerät: eine andere Vorlage, **Nur Ping** oder **Nur Asset**
(keine Monitore, z. B. für einen Frame oder eine VM ohne Adresse).

## Prüfen und anlegen

- Die Liste zeigt für jedes Gerät Adresse, Namen (bearbeitbar), wonach es aussieht (Hersteller,
  Modell, Details wie offene Ports, SNMP-Beschreibung, Cluster, Switch-Port) und die
  vorgeschlagenen Monitore.
- **Bekannte** Geräte – ein Asset mit dieser Adresse (oder, ohne Adresse, diesem Namen) existiert
  in irgendeinem Bereich, oder Monitore prüfen diese Adresse – werden ausgeblendet; deaktivieren
  Sie *Bekannte Geräte ausblenden*, um sie und ihren Ort zu sehen.
- Haken Sie Geräte an, wählen Sie **Anlegen in** (den globalen Bereich oder einen Mandanten) und
  optional Tags, dann **Vorschau**: dieselbe Vorschau wie bei einem Konfigurationsimport, mit
  jedem anzulegenden Asset und Monitor. **Anlegen** wendet sie an.
- Abhängigkeiten werden übernommen, wenn beide Geräte zusammen angelegt werden oder wenn das
  Gerät, von dem abgehangen wird, in diesem Bereich (oder im globalen Bereich) bereits existiert.
- Eine laufende Erkennung lässt sich stoppen; abgeschlossene lassen sich löschen (Angelegtes
  bleibt).
