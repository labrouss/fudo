<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitoare

## Lista

Lista monitoarelor arată **resursa** fiecărui monitor și **aplicațiile** din care face parte (o apartenență opțională are contur punctat); ambele sunt linkuri. Faceți clic pe antetul unei coloane pentru sortare (din nou pentru ordine inversă, a treia oară pentru ordinea implicită); Fudo reține sortarea în acest browser. Filtrul caută în nume, ținte, etichete, resurse și aplicații; ignoră majusculele și diacriticele, iar fiecare cuvânt trebuie să se potrivească. Celelalte liste lungi (resurse, incidente, utilizatori, mentenanțe, canale și altele) se sortează și se filtrează la fel.

## Tipuri de monitoare

| Categorie | Tip | Verifică |
|---|---|---|
| Web | **HTTP(S)** | intervale de coduri de stare, cuvânt-cheie prezent/absent, valoare JSON (`$.status`), antete, corp, timp de răspuns |
| | **Certificat TLS** | încredere, nume gazdă, zile până la expirare (Degradat cu N zile înainte, Indisponibil după expirare) |
| Rețea | **Ping** | accesibilitate, latență, pierdere de pachete |
| | **Port TCP** | portul acceptă conexiuni |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, răspuns așteptat opțional, resolver ales |
| | **SNMP** | citește un OID (v1, v2c, v3) și compară valoarea sau, pentru contoare, variația ei pe secundă |
| | **Interfață de rețea (SNMP)** | un port de switch, router sau firewall: starea legăturii, traficul intrare și ieșire (bit/s și % din viteza legăturii), erori; în grafic în timp |
| | **NTP** | accesibilitate, stratum, decalajul ceasului |
| | **SMTP** | salut 220, EHLO, STARTTLS opțional |
| | **LDAP / Active Directory** | directorul răspunde (Active Directory: degradat cât timp controlerul de domeniu nu este sincronizat) sau un cont se conectează și o căutare găsește intrări; indică conturile blocate, expirate și dezactivate |
| | **Expirare domeniu** | expirarea înregistrării prin RDAP (cu WHOIS ca rezervă) |
| Baze de date | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | se conectează, interogare opțională cu rezultat așteptat |
| Sisteme | **Comandă SSH** | cod de ieșire sau ieșire (conține, exactă, regex), fixare opțională a cheii gazdei |
| | **Container Docker** | rulează și este sănătos, dacă are verificare de sănătate |
| Infrastructură | **VM vCenter** | starea alimentării, VMware Tools (vCenter 6.7, 7, 8) |
| | **Stare HPE iLO / Redfish** | starea hardware a serverului din BMC (iLO 4/5/6, iDRAC, alte BMC-uri Redfish) |
| | **Temperatura de admisie (iLO / Redfish)** | temperatura aerului care intră în server, adică în fața rackului: degradat de la 27 °C, indisponibil de la 32 °C (ASHRAE), cu grafic |
| | **Temperatura sălii** | toți senzorii de admisie cu eticheta `room:<name>` împreună: indisponibil când mai mulți sunt fierbinți (problemă de răcire), degradat când unul este fierbinte sau mai mulți cresc rapid |
| Pasiv | **Heartbeat push** | un job apelează un URL; Indisponibil când nu mai apelează |
| | **Trapuri SNMP** | trapuri trimise de un echipament (v1, v2c): indisponibil sau degradat cât timp un trap de problemă e deschis; se închide singur, printr-un trap de închidere sau manual |

**Testează acum** rulează o verificare o dată de pe serverul Fudo, fără salvare, ca să o puteți regla
înainte să trimită notificări.

## Evitarea alarmelor false

- **Indisponibil după N eșecuri**: un monitor devine Indisponibil doar după N verificări eșuate la
  rând, reîncercând între timp la *intervalul de reîncercare*, mai scurt.
- **Funcțional după M reușite**: își revine doar după M verificări reușite la rând.
- **Degradat peste**: răspunsurile lente contează ca Degradat, nu ca Indisponibil.

## Date de autentificare

Parolele, community-urile SNMP, cheile SSH și altele asemenea sunt păstrate **criptat** și nu mai
sunt afișate, exportate sau returnate de API; doar worker-ul le decriptează pentru a rula o
verificare. Folosiți conturi doar de citire: un rol vCenter *Read-only*, un utilizator iLO cu
privilegiul *Login*, un utilizator de bază de date doar cu `CONNECT`/`SELECT`.

### Credențiale partajate

Când multe monitoare se autentifică cu același cont (un utilizator iLO doar de citire pentru toate
serverele, o comunitate SNMP pentru switch-uri), păstrați-l o singură dată în **Credențiale** și
lăsați monitoarele să îl folosească. Când parola se schimbă, editați credențiala o singură dată:
fiecare monitor care o folosește verifică imediat din nou cu noua valoare.

- O credențială are un tip: *Cont și parolă*, *Cheie SSH*, *Comunitate SNMP (v1, v2c)* sau
  *Utilizator SNMPv3*. În formularul monitorului, tipurile care se autentifică oferă **Introduceți
  aici** sau **Folosiți o credențială partajată**; cu o credențială, câmpurile contului dispar din
  formular.
- Credențialele aparțin unui domeniu: monitoarele unui chiriaș pot folosi doar credențialele
  acelui chiriaș, iar monitoarele domeniului infrastructurii globale doar pe cele globale.
- Secretele sunt doar de scriere, ca ale unui monitor: stocate criptat, niciodată afișate,
  exportate sau returnate. Lista arată contul și ce monitoare îl folosesc.
- **Același cont în mai multe monitoare**: pagina arată monitoarele care stochează deja același
  cont și aceeași parolă. Dați un nume grupului și alegeți **Creați o credențială partajată**:
  parola este copiată pe server, nimeni nu trebuie să o cunoască.
- **Folosiți pentru…** asociază mai multe monitoare unei credențiale; contul și parola lor proprii
  sunt eliminate. O credențială folosită nu poate fi ștearsă, iar tipul ei nu se poate schimba.
- Un monitor care nu mai folosește o credențială are din nou nevoie de propria parolă.
- În [configurația ca cod](configuration-as-code.md) un monitor își numește credențiala
  (`credential: iLO read-only`); credențiala în sine se creează în interfață. Și adăugarea în masă
  a verificărilor de temperatură o poate folosi.
- Fiecare modificare apare în jurnalul de audit, cu numele secretelor schimbate, niciodată cu
  valorile lor.

## Monitoare push

Un monitor push așteaptă ca jobul dvs. să-l apeleze. După salvare, pagina lui afișează URL-ul:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Devine Indisponibil când niciun apel nu sosește în interval plus perioada de grație. **URL nou**
înlocuiește tokenul dacă a fost divulgat.

## Adăugare în bloc și șabloane

**Monitoare › Adăugare în bloc / șabloane** creează verificări pentru multe gazde deodată:

1. lipiți câte o gazdă sau un URL pe rând (sau încărcați un CSV cu `name,host,port`),
2. alegeți un **șablon**, de exemplu *server Windows* (ping, RDP, WinRM), *server Linux*, *HPE iLO*,
   *dispozitiv de rețea*, *gazdă ESXi*, *vCenter*, *SQL Server*, *matrice de stocare* sau *aplicație
   web*, ori un singur tip de verificare,
3. opțional creați câte o resursă pe rând, faceți-le să depindă de o resursă existentă și adăugați-le
   la o aplicație.

Înainte de aplicare arată o previzualizare a tot ce va fi creat.

## Observații pe tipuri

- **VM vCenter** găsește singur versiunea potrivită a API-ului și refolosește sesiunile (o conectare
  la vCenter la fiecare 20 de minute). Verificarea VMware Tools necesită vCenter 7.0 sau mai nou.
- **HPE iLO / Redfish** numește în HPE iLO componenta defectă (ventilatoare, surse, stocare,
  redundanță). Warning → Degradat, Critical sau oprit → Indisponibil.
- **Comandă SSH**: setați *Amprenta cheii host* (`ssh-keyscan host | ssh-keygen -lf -`), ca o cheie de
  server schimbată să fie raportată, nu acceptată.
- **Container Docker** folosește socketul Docker local (montați-l în containerul worker, vedeți
  `docker-compose.yml`) sau URL-ul unui API Docker la distanță.
- **Expirare domeniu**: unele registre naționale nu publică nici RDAP, nici WHOIS; Fudo raportează
  asta ca Degradat, cu o explicație.
- **Ping** are nevoie de capability-ul `NET_RAW` în containerul worker, iar pentru **Testează acum** și
  în containerul API (ambele setate în `docker-compose.yml`).

## Trapuri SNMP

Îndreptați trapurile SNMP (v1 sau v2c) ale echipamentelor spre serverul Fudo, portul UDP 162.
Pagina **Trapuri** arată dacă se primesc trapuri, și fiecare trap cu câmpurile sale.

- Un monitor **Trapuri SNMP** preia trapurile echipamentelor din **De la**: adrese, nume de gazdă
  sau intervale IPv4 (`10.0.12.0/24`). Cu o **Comunitate** (sau o credențială partajată de tip
  comunitate SNMP) preia doar trapurile care o poartă; comunitatea nu se păstrează niciodată.
- **Trapuri de problemă**: cele standard (link down, pornire la rece și la cald, eroare de
  autentificare), doar trapurile din listă (nume sau OID-uri; un OID cuprinde și tot ce e sub el,
  de ex. prefixul enterprise al unui producător) sau orice trap. *Doar când un câmp conține*
  restrânge la trapuri cu un text precum `Critical`.
- Cât timp o problemă e deschisă, monitorul este **Indisponibil** (sau Degradat, dacă alegeți);
  incidentul, notificările și gărzile funcționează ca la orice verificare, într-o secundă de la
  trap.
- Problemele sunt ținute pe trap și interfață: link down pe două porturi înseamnă două probleme,
  iar **link up** al unui port închide doar problema acelui port.
- **Problemele se închid** automat când nu mai vine un trap nou o vreme (implicit 30 de minute)
  sau doar manual: pagina monitorului afișează trapurile deschise cu **Ștergeți** (până la
  următorul trap potrivit). *Trapurile de închidere* închid și ele probleme, de ex. trapul
  „condiție rezolvată” al unui producător.
- Un trap pe care **nu îl preia niciun monitor** se păstrează totuși: la chiriașul resursei cu
  acea adresă, altfel în domeniul infrastructurii globale. **Creați monitor** pe pagina Trapuri
  completează un monitor pentru echipamentul său.
- Un echipament care inundă cu trapuri este limitat (50 pe secundă, vârfuri de 500); trapurile
  ignorate sunt numărate pe pagina Trapuri a domeniului global. Trapurile se păstrează 30 de zile
  (Setări › Păstrarea datelor).

## Interfețe de rețea

Un monitor **Interfață de rețea (SNMP)** urmărește un port al unui switch, router sau firewall.

- **Găsiți interfețele…** (după gazdă și accesul SNMP sau o credențială partajată) afișează
  interfețele echipamentului cu descriere, viteză și stare. Alegeți una sau, la adăugare, bifați
  mai multe: fiecare devine un monitor cu setările formularului, numit după interfață.
- Interfața este reținută după **nume** (sau descriere sau alias), nu după număr, pentru că unele
  echipamente își renumerotează interfețele după o repornire. Merge și un număr.
- **Traficul** este diferența dintre două citiri ale contoarelor pe 64 de biți: prima verificare
  citește de două ori, la două secunde distanță; următoarele folosesc citirea păstrată de la
  verificarea anterioară. După o repornire a echipamentului perechea este ignorată, deci nu apare un
  vârf fals. Echipamentele fără contoare pe 64 de biți (SNMP v1) folosesc contoare pe 32 de biți,
  care nu sunt fiabile peste circa 100 Mbit/s la un interval de un minut.
- **Stare**: legătură căzută → Indisponibil; testing sau dormant → Degradat; un port dezactivat
  intenționat este Funcțional (sau Indisponibil, dacă alegeți). Direcția mai încărcată peste
  *Degradat de la utilizare* (implicit 80 %) → Degradat, peste *Indisponibil de la utilizare*
  (oprit implicit) → Indisponibil; erori pe minut peste limită → Degradat. Dacă echipamentul
  raportează o viteză greșită (un tunel, un circuit cu rată limitată), setați *Viteza legăturii*.
- Pagina monitorului afișează traficul intrare și ieșire cu linia pentru Degradat.
- *Comparați: variația ei pe secundă* din monitorul **SNMP** face același lucru pentru orice
  contor (cadre pe un port SAN, sesiuni de firewall, evenimente UPS).

## Temperatura centrului de date

**Temperatură** afișează fiecare senzor de temperatură de admisie, grupat după eticheta `room:<name>` și ordonat de la cel mai cald, cu rackul (`rack:<name>`), valoarea actuală, ultimele 6 ore, schimbarea în 15 minute și intervalul pe 24 de ore. **Adaugă senzori** îi creează pentru o listă de adrese iLO (sau alte BMC Redfish) cu un cont comun doar pentru citire.

Un senzor devine degradat și atunci când temperatura **crește rapid** (implicit 3 °C în 15 minute), chiar sub praguri: primul semn al unei defecțiuni de răcire. **Creează alertă de sală** adaugă un monitor *Temperatura sălii*: indisponibil când 3 senzori sunt fierbinți, degradat când unul este fierbinte sau 2 cresc rapid. Deschide incidente ca orice monitor, așa că proprietarii, gărzile și paginile de stare funcționează și pentru el.
