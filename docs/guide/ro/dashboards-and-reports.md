<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Panouri și rapoarte

## Prezentare generală

Incidente deschise, timpul mediu de restabilire (MTTR, 30 de zile), monitoare funcționale și cu
eșecuri, aplicații în ținta SLA și câte un card pe aplicație cu banda de disponibilitate pe 30 de
zile. Paginile se actualizează live (la circa o secundă după o schimbare); bara laterală arată
**Live** cât timp există conexiune.

**Disponibilitatea** provine din istoricul stărilor: timpul indisponibil și afectat contează
împotriva ei; mentenanța programată și timpul dinaintea primei verificări, nu.

## Grafice

Fiecare monitor își arată timpul de răspuns pe 1 h, 6 h, 24 h, 7, 30 și 90 de zile (medie, p95,
eșecuri, mentenanță), ultimele verificări ca bandă de pulsuri, schimbările de stare și rezultatele
recente.

## Rapoarte

**Rapoarte** arată, pe aplicație (sau pe resursă partajată în domeniul Infrastructură globală):
disponibilitatea 24/7 și în **programul de lucru**, timpul de indisponibilitate, mentenanța
programată, incidentele, SLA atins sau nu, MTTA (timpul până la confirmare) și MTTR (timpul până la
rezolvare). Alegeți săptămâna trecută, luna trecută, ultimele 30 de zile sau date proprii și
descărcați raportul ca:

- **PDF**: în limba dvs.; rapoartele în arabă sunt așezate de la dreapta la stânga,
- **CSV**: disponibilitate și incidente, UTF-8 pentru Excel, cu nume de coloane în engleză ca foile de
  calcul și scripturile să funcționeze în continuare.

## Rapoarte programate

**Rapoarte › Programare nouă** trimite pe e-mail PDF-ul și/sau CSV-ul în fiecare luni (săptămâna
anterioară) sau pe 1 ale lunii (luna anterioară), la ora și în fusul orar alese, în limba programării,
prin serverul SMTP din Setări. **Trimite acum** trimite imediat ultima perioadă.

## Pagini de stare

**Pagini de stare › Pagină de stare nouă** afișează aplicații, resurse și monitoare alese pe o
pagină proprie la `/status/<adresă>`, cu starea generală, disponibilitatea pe 90 de zile, incidentele
curente și mentenanțele. Fiecare element primește un **nume afișat**, arătat în locul numelui intern;
elementele din același grup apar împreună. Paginile unui chiriaș pot include și infrastructura
partajată.

- **Publică**: oricine are linkul, fără conectare. Pagina arată doar nume afișate și stări simple
  (*Funcțional, Degradat, Întrerupere, Mentenanță*), niciodată nume interne, cauze, titluri de
  incidente sau nume de mentenanțe.
- **Internă**: utilizatori conectați cu acces la chiriaș, care văd și titlurile incidentelor și
  numele mentenanțelor.

Pagina se reîmprospătează în fiecare minut și folosește limba și modul luminos sau întunecat al
vizitatorului.
