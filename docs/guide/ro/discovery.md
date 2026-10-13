<!-- translation-of: discovery.md#cb4482b3 -->
# Descoperire

**Descoperirea** găsește dispozitivele infrastructurii dumneavoastră și propune pentru fiecare o
resursă și monitoare. Nu se creează nimic până nu alegeți: examinați ce s-a găsit, ajustați
numele și monitoarele și creați dispozitivele dorite în domeniul dorit.

Descoperirea rulează în **domeniul infrastructurii globale** (superadministratori și
administratori de infrastructură). Scanarea o face worker-ul, deci are nevoie de acces de rețea
la ce descoperiți; anunțați echipa de rețea înainte de a scana o rețea.

## Surse

| Sursă | Găsește | Necesită |
|---|---|---|
| **Scanare subrețea** | fiecare dispozitiv care răspunde într-o rețea: ping, câteva porturi TCP (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP și, prin HTTPS, Redfish (iLO, iDRAC) și API-ul vSphere (ESXi, vCenter) | rețele (`10.0.12.0/24`), intervale (`10.0.20.10-60`), adrese sau nume de gazdă, cel mult 4096 de adrese; opțional credențiale SNMP |
| **Inventar vCenter** | vCenter-ul, gazdele sale ESXi (etichetate `cluster:<nume>`) și VM-urile, cu adresa și sistemul de operare al fiecărei VM din VMware Tools; fiecare VM depinde de gazda sa | vCenter-ul și un cont doar-citire (credențială partajată) |
| **Vecini de switch (LLDP/CDP)** | cine este conectat la ce port de switch; serverele, gazdele ESXi și stocarea din spatele unui port depind de acel switch, legăturile dintre switch-uri sunt listate | switch-urile și credențiale SNMP |
| **HPE OneView** | frame-uri Synergy, module de calcul cu adresa lor iLO, interconectări; fiecare depinde de frame-ul său | appliance-ul OneView și un cont doar-citire |

Credențialele sunt credențiale partajate ale domeniului global (**Credențiale**): comunități SNMP
sau utilizatori SNMPv3 pentru scanarea subrețelei și vecinii de switch, un cont cu parolă pentru
vCenter și OneView. Doar worker-ul le citește.

## După ce se recunoaște un dispozitiv

Scanarea subrețelei recunoaște un dispozitiv după ce răspunde: un serviciu Redfish este un
controler de management (iLO), API-ul vSphere este ESXi sau vCenter, SNMP indică producătorul
(după numărul enterprise) și tipul dispozitivului (după descriere: switch, switch FC, firewall,
router, sistem de stocare, Windows, Linux…), iar porturile deschise ajută când nimic altceva nu
ajută (RDP și SMB: Windows; SQL Server; SSH: Linux). Numele vine din SNMP, din DNS-ul invers sau
din certificat.

Fiecare tip propune un șablon de monitoare (de exemplu *HPE iLO / BMC* sau *Host VMware ESXi*) și
un tip de resursă. Schimbați-l per dispozitiv: alt șablon, **Doar ping** sau **Doar resursă**
(fără monitoare, de ex. pentru un frame sau o VM fără adresă).

## Examinare și creare

- Lista arată pentru fiecare dispozitiv adresa, numele (editabil), cu ce seamănă (producător,
  model, detalii ca porturile deschise, descrierea SNMP, clusterul, portul de switch) și
  monitoarele propuse.
- Dispozitivele **cunoscute** — într-un domeniu oarecare există o resursă cu acea adresă (sau,
  fără adresă, cu acel nume) ori monitoare verifică acea adresă — sunt ascunse; debifați *Ascunde
  dispozitivele cunoscute* pentru a le vedea și a afla unde sunt.
- Bifați dispozitive, alegeți **Creează în** (domeniul global sau un chiriaș) și etichete
  opționale, apoi **Previzualizare**: aceeași previzualizare ca la un import de configurație, cu
  fiecare resursă și monitor de creat. **Creează** o aplică.
- Dependențele se păstrează când ambele dispozitive sunt create împreună sau când cel de care
  depinde celălalt există deja în acel domeniu (sau în domeniul global).
- O descoperire în curs poate fi oprită; cele terminate pot fi șterse (ce s-a creat rămâne).
