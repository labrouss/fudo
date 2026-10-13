<!-- translation-of: discovery.md#cb4482b3 -->
# Detectie

**Detectie** vindt de apparaten van uw infrastructuur en stelt voor elk een asset en monitors
voor. Er wordt niets aangemaakt totdat u kiest: u bekijkt wat er gevonden is, past namen en
monitors aan en maakt de gewenste apparaten aan in het gewenste bereik.

Detectie werkt in het **globale infrastructuurbereik** (superadmins en infrastructuurbeheerders).
De worker voert de scan uit en heeft dus netwerktoegang nodig tot wat u detecteert; laat uw
netwerkteam het weten voordat u een netwerk scant.

## Bronnen

| Bron | Vindt | Nodig |
|---|---|---|
| **Subnetscan** | elk apparaat dat op een netwerk antwoordt: ping, een paar TCP-poorten (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP en via HTTPS Redfish (iLO, iDRAC) en de vSphere-API (ESXi, vCenter) | netwerken (`10.0.12.0/24`), reeksen (`10.0.20.10-60`), adressen of hostnamen, maximaal 4096 adressen; optioneel SNMP-inloggegevens |
| **vCenter-inventaris** | de vCenter, zijn ESXi-hosts (getagd `cluster:<naam>`) en VM's, met het adres en besturingssysteem van elke VM uit VMware Tools; elke VM is afhankelijk van zijn host | de vCenter en een alleen-lezen account (gedeelde inloggegevens) |
| **Switchburen (LLDP/CDP)** | wie op welke switchpoort is aangesloten; servers, ESXi-hosts en opslag achter een poort zijn afhankelijk van die switch, verbindingen tussen switches worden vermeld | de switches en SNMP-inloggegevens |
| **HPE OneView** | Synergy-frames, rekenmodules met hun iLO-adres, interconnects; elk is afhankelijk van zijn frame | de OneView-appliance en een alleen-lezen account |

Inloggegevens zijn gedeelde inloggegevens van het globale bereik (**Inloggegevens**):
SNMP-community's of SNMPv3-gebruikers voor de subnetscan en switchburen, een account met
wachtwoord voor vCenter en OneView. Alleen de worker leest ze.

## Waaraan een apparaat herkend wordt

De subnetscan herkent een apparaat aan wat er antwoordt: een Redfish-dienst is een
beheercontroller (iLO), de vSphere-API is ESXi of vCenter, SNMP vertelt de fabrikant (via het
enterprisenummer) en het soort apparaat (via de beschrijving: switch, FC-switch, firewall, router,
opslagsysteem, Windows, Linux…), en open poorten helpen als niets anders dat doet (RDP en SMB:
Windows; SQL Server; SSH: Linux). De naam komt uit SNMP, reverse DNS of het certificaat.

Elk soort stelt een monitorsjabloon voor (bijvoorbeeld *HPE iLO / BMC* of *VMware ESXi-host*) en
een assetsoort. Wijzig het per apparaat: een ander sjabloon, **Alleen ping** of **Alleen asset**
(geen monitors, bijv. voor een frame of een VM zonder adres).

## Bekijken en aanmaken

- De lijst toont per apparaat het adres, de naam (bewerkbaar), waar het op lijkt (fabrikant,
  model, details zoals open poorten, SNMP-beschrijving, cluster, switchpoort) en de voorgestelde
  monitors.
- **Bekende** apparaten — er bestaat in een bereik een asset met dat adres (of, zonder adres, die
  naam), of monitors controleren dat adres — worden verborgen; vink *Bekende apparaten
  verbergen* uit om ze te zien en waar ze staan.
- Vink apparaten aan, kies **Aanmaken in** (het globale bereik of een tenant) en optionele tags,
  daarna **Voorbeeld**: hetzelfde voorbeeld als bij een configuratie-import, met elke aan te maken
  asset en monitor. **Aanmaken** voert het uit.
- Afhankelijkheden gaan mee als beide apparaten samen worden aangemaakt, of als het apparaat
  waarvan wordt afgehangen al in dat bereik (of in het globale bereik) bestaat.
- Een lopende detectie kan worden gestopt; afgeronde detecties kunnen worden verwijderd (wat is
  aangemaakt blijft).
