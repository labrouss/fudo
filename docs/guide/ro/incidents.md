<!-- translation-of: incidents.md#4e781264 -->
# Incidente

Fudo deschide singur incidente când ceva se defectează și le rezolvă când își revine.

## Când se deschide un incident

| Element | Deschide un incident când | Severitate |
|---|---|---|
| **Aplicație** | este Indisponibilă sau Afectată de o cauză neprogramată | după criticitate: critică → Critic, ridicată → Major, celelalte → Minor |
| **Resursă** | este Indisponibilă (este cauză principală) | Major |
| **Monitor** | este Indisponibil și nu aparține unei resurse sau aplicații | Minor |

Un incident **Afectat** este legat de incidentul cauzei sale principale (*Cauzat de INC-…*): un switch
defect produce un incident principal cu incidente afectate clar legate, nu o avalanșă de notificări.

## Viața unui incident

1. Se **deschide** automat și pleacă notificările (vedeți [Notificări](notifications.md)).
2. **Confirmă** arată că cineva se ocupă; mementourile și escaladările se opresc.
3. **Amuțește** oprește notificările pentru o vreme (30 de minute până la 1 zi), fără confirmare.
4. Se **rezolvă** automat când elementul își revine. Dacă se defectează din nou în 5 minute, același
   incident se **redeschide** în loc să se creeze unul nou. Îl puteți rezolva și manual.

**Cronologia** înregistrează fiecare pas: schimbări de stare, notificări, confirmări și note.

## Note: împărtășiți ce ați aflat

Adăugați note în cronologie ca **Comentariu**, **Acțiune efectuată** sau **Rezolvare**, cu etichete (de
ex. `supervisor`, `firmware`).

Rezolvările sunt refolosite: când mai târziu apare un incident asemănător (același element, aceeași
cauză principală, etichete comune sau text similar), **Incidente similare anterioare** arată ce l-a
rezolvat, iar notificările lui citează asta: *„Data trecută (INC-0041, 12 aug. 2026) s-a rezolvat
astfel: …”*.

## Găsirea incidentelor

**Incidente** afișează incidentele **deschise** ale domeniului ales în bara laterală; treceți la
*Rezolvat* pentru istoric și căutați după titlu, număr INC sau etichetă. Incidentele altui chiriaș
apar când treceți la acel chiriaș (vedeți [Depanare](troubleshooting.md)).

## Rapoarte post-incident

**Raport post-incident** la un incident descarcă un raport în **PDF** sau **Markdown** (pentru un wiki sau un tichet): un rezumat cu orele și cine l-a confirmat și rezolvat, incidentele afectate, rezolvarea și acțiunile efectuate, cronologia, notificările trimise și incidentele similare anterioare. Folosește limba și fusul dvs. orar și poate fi creat și cât timp incidentul este încă deschis.
