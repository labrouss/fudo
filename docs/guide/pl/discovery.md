<!-- translation-of: discovery.md#cb4482b3 -->
# Wykrywanie

**Wykrywanie** znajduje urządzenia Twojej infrastruktury i proponuje dla każdego zasób i monitory.
Nic nie jest tworzone, dopóki nie wybierzesz: przeglądasz, co znaleziono, poprawiasz nazwy i
monitory, a potem tworzysz wybrane urządzenia w wybranym zakresie.

Wykrywanie działa w **zakresie globalnej infrastruktury** (superadministratorzy i administratorzy
infrastruktury). Skanowanie wykonuje worker, więc potrzebuje dostępu sieciowego do tego, co
wykrywasz; uprzedź zespół sieciowy przed skanowaniem sieci.

## Źródła

| Źródło | Znajduje | Wymaga |
|---|---|---|
| **Skanowanie podsieci** | każde urządzenie, które odpowiada w sieci: ping, kilka portów TCP (SSH, HTTPS, RDP, SMB, SQL Server, vSphere…), SNMP, a przez HTTPS Redfish (iLO, iDRAC) i API vSphere (ESXi, vCenter) | sieci (`10.0.12.0/24`), zakresy (`10.0.20.10-60`), adresy lub nazwy hostów, najwyżej 4096 adresów; opcjonalnie dane logowania SNMP |
| **Inwentarz vCenter** | vCenter, jego hosty ESXi (oznaczone `cluster:<nazwa>`) i maszyny wirtualne, z adresem i systemem operacyjnym każdej maszyny z VMware Tools; każda maszyna zależy od swojego hosta | vCenter i konto tylko do odczytu (wspólne dane logowania) |
| **Sąsiedzi przełączników (LLDP/CDP)** | kto jest podłączony do którego portu przełącznika; serwery, hosty ESXi i macierze za portem zależą od tego przełącznika, połączenia między przełącznikami są wypisywane | przełączniki i dane logowania SNMP |
| **HPE OneView** | ramy Synergy, moduły obliczeniowe z adresem iLO, interkonekty; każdy element zależy od swojej ramy | urządzenie OneView i konto tylko do odczytu |

Dane logowania to wspólne dane logowania zakresu globalnego (**Dane logowania**): społeczności SNMP
lub użytkownicy SNMPv3 dla skanowania podsieci i sąsiadów przełączników, konto z hasłem dla
vCenter i OneView. Czyta je tylko worker.

## Po czym rozpoznawane jest urządzenie

Skanowanie podsieci rozpoznaje urządzenie po tym, co odpowiada: usługa Redfish to kontroler
zarządzania (iLO), API vSphere to ESXi lub vCenter, SNMP podaje producenta (z numeru enterprise) i
rodzaj urządzenia (z opisu: przełącznik, przełącznik FC, zapora, router, macierz, Windows,
Linux…), a otwarte porty pomagają, gdy nic innego nie pomaga (RDP i SMB: Windows; SQL Server;
SSH: Linux). Nazwa pochodzi z SNMP, odwrotnego DNS lub certyfikatu.

Każdy rodzaj proponuje szablon monitorów (na przykład *HPE iLO / BMC* lub *Host VMware ESXi*) i
rodzaj zasobu. Zmień go dla każdego urządzenia: inny szablon, **Tylko ping** lub **Tylko zasób**
(bez monitorów, np. dla ramy lub maszyny wirtualnej bez adresu).

## Przegląd i tworzenie

- Lista pokazuje dla każdego urządzenia adres, nazwę (edytowalną), na co wygląda (producent,
  model, szczegóły takie jak otwarte porty, opis SNMP, klaster, port przełącznika) i proponowane
  monitory.
- **Znane** urządzenia — w którymś zakresie istnieje zasób o tym adresie (lub, bez adresu, o tej
  nazwie) albo monitory sprawdzają ten adres — są ukryte; odznacz *Ukryj znane urządzenia*, aby
  je zobaczyć wraz z miejscem, w którym są.
- Zaznacz urządzenia, wybierz **Utwórz w** (zakres globalny lub dzierżawcę) i opcjonalne tagi,
  potem **Podgląd**: ten sam podgląd co przy imporcie konfiguracji, z każdym zasobem i monitorem
  do utworzenia. **Utwórz** go stosuje.
- Zależności są zachowywane, gdy oba urządzenia są tworzone razem albo gdy to, od którego drugie
  zależy, już istnieje w tym zakresie (lub w zakresie globalnym).
- Trwające wykrywanie można zatrzymać; zakończone można usunąć (to, co utworzono, zostaje).
