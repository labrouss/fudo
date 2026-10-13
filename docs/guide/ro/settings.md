<!-- translation-of: settings.md#401e7e53 -->
# Setări

**Setări** (în partea de jos a barei laterale) cuprinde preferințele dvs. personale, pentru toți, și
setările de sistem, pentru superadministratori.

Fiecare secțiune este o filă. Adresa păstrează fila deschisă (de exemplu `/settings#retention`), astfel încât o filă poate fi salvată ca marcaj sau trimisă ca link.

## Preferințele dvs.

- **Limba interfeței**: 13 limbi, inclusiv araba, cu aranjare de la dreapta la stânga. Se salvează în
  profilul dvs., așa că vă urmează în orice browser. Se traduc și titlurile incidentelor și
  rezultatele verificărilor.
- **Temă**: **Sistem** (urmează modul luminos sau întunecat al sistemului de operare), **Luminoasă**,
  **Întunecată**, **Monokai**, plus temele adăugate de administrator.

## Setări de sistem (superadministratori)

### Limba notificărilor

**Limba implicită** a notificărilor și a rapoartelor programate. Fiecare canal și fiecare programare
își poate folosi propria limbă; e-mailurile către o persoană (invitații, resetări) sunt în limba
acesteia. Nu schimbă interfața: pe aceasta fiecare o alege în *Preferințe*.

### E-mail (SMTP)

Folosit pentru invitații, notificări pe e-mail și rapoarte programate.

| Câmp | Observații |
|---|---|
| Gazdă SMTP, port | 587 (STARTTLS) sau 465 (*Folosește TLS de la început*); 25 pentru un releu intern |
| Nume utilizator, parolă | opționale; parola se păstrează criptat și nu mai este afișată |
| Adresa expeditorului | de ex. `fudo@corp.local` |
| **Acceptă certificate autosemnate** | pentru un releu local cu certificat autosemnat sau intern: conexiunea rămâne criptată, se omite doar verificarea certificatului |

**Trimite e-mail de test** arată motivul exact când ceva nu merge: un certificat care nu este de
încredere, o parolă greșită, un server inaccesibil sau un mod TLS care nu se potrivește cu portul.

## Pentru administratori

Limbi și teme noi se adaugă punând fișiere în foldere, fără recompilare; vedeți
`locales/README.md` și `themes/README.md` în depozit.

## Păstrarea datelor

**Setări › Păstrarea datelor** (superadministratori) stabilește cât timp se păstrează fiecare tip de date și arată spațiul ocupat: rezultate brute ale verificărilor, rezumate orare și zilnice, istoricul stărilor, incidente rezolvate, jurnalul notificărilor, jurnalul de audit și ferestrele de mentenanță încheiate. Datele vechi sunt eliminate în fiecare oră, puțin câte puțin. Valori minime protejează ce arată Fudo (grafice pe 90 de zile, rapoarte de disponibilitate, pagini de stare), iar ultima schimbare de stare dinaintea limitei se păstrează întotdeauna, ca disponibilitatea să rămână exactă. Incidentele deschise și notificările care așteaptă trimiterea nu sunt eliminate niciodată.
