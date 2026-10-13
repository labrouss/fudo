<!-- translation-of: concepts.md#61c26734 -->
# Concepte

## Domenii: chiriași și infrastructură globală

| Domeniu | Conține | Gestionat de |
|---|---|---|
| **Chiriaș** (câte unul pe unitate de business) | aplicațiile, monitoarele, resursele, canalele și rapoartele lui | administratorii de chiriaș |
| **Infrastructură globală** | resurse partajate (switch-uri, matrice de stocare, fabric-uri FC, clustere) și monitoarele lor | administratorii de infrastructură și superadministratorii |

Alegeți domeniul din selectorul din partea de sus a barei laterale. Chiriașii văd infrastructura
partajată doar în citire și își leagă de ea propriile monitoare și aplicații, astfel încât o defecțiune
a stocării apare drept cauză în fiecare aplicație care are nevoie de ea.

## Elemente de bază

| Element | Ce este | Exemplu |
|---|---|---|
| **Monitor** | o verificare rulată periodic | HTTPS pe `erp.corp.local/health` |
| **Resursă** | o componentă de infrastructură, verificată de monitoarele ei | `Core-SW-01`, `SAN-A` |
| **Aplicație** | un serviciu de business: monitoare (membri) plus infrastructura de care are nevoie | *ERP Production* |
| **Dependență** | „asta are nevoie de aia”: resursă → resursă, aplicație → resursă | cluster ESXi → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Pe o resursă, **Adaugă existente** atașează monitoare pe care le aveți deja (unul aflat pe altă resursă este mutat), iar **Monitor nou** deschide formularul de monitor pentru ea. Un chiriaș își poate atașa monitoarele proprii și la o resursă globală partajată; **Elimină** scoate un monitor de pe resursă și îl păstrează.

## Stări

| Stare | Semnificație |
|---|---|
| **Funcțional** | funcționează |
| **Degradat** | funcționează, dar lent sau parțial (de ex. un membru opțional este indisponibil) |
| **Indisponibil** | nu funcționează și nimic de care depinde nu explică asta: este o **cauză principală** |
| **Afectat** | nu funcționează **pentru că** ceva de care depinde este indisponibil; notificările indică cauza principală |
| **La risc** | funcționează, dar ceva de care depinde are o problemă |
| **Mentenanță** | într-o fereastră de mentenanță programată: nu contează la disponibilitate |
| **În așteptare** | încă niciun rezultat |

## Cum găsește Fudo cauza principală

| Situație | Rezultat |
|---|---|
| Verificările unei resurse eșuează și nimic de care depinde nu este indisponibil | **Indisponibil**: cauză principală, cu incident propriu |
| Verificările ei eșuează **și** ceva de care depinde este indisponibil | **Afectat de** acea cauză principală: fără avalanșă de notificări |
| Verificările ei trec, dar ceva de care depinde este indisponibil | își păstrează starea, marcată **La risc** |
| Ceva de care depinde este în mentenanță programată | **Afectat de mentenanță** (programată, exclusă din disponibilitate) |

O aplicație este sănătoasă când membrii ei sunt, după regula ei: **toți membrii obligatorii
funcționali**, **cel puțin unul** sau **cel puțin N din M** (pentru servicii redundante). Membrii
obligatorii decid starea; cei opționali o pot face doar *Degradată*.

**Ce se întâmplă dacă aceasta cade?** pe o resursă prezice ce aplicații ar cădea și care ar rezista
datorită redundanței, înainte să o opriți pentru o intervenție.

Pagina **Topologie** desenează întregul tablou cu starea live: treceți cu mouse-ul peste un element
pentru a-i urmări dependențele; *Doar probleme* arată ce nu funcționează și ce depinde de asta.
