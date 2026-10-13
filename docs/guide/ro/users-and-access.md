<!-- translation-of: users-and-access.md#c2bf850f -->
# Utilizatori și acces

## Roluri

| Rol | Unde | Poate |
|---|---|---|
| **Superadmin** | oriunde | orice, inclusiv utilizatori, chiriași și setări |
| **Administrator de infrastructură** | domeniul Infrastructură globală (și orice chiriaș) | gestiona infrastructura partajată și datele tuturor chiriașilor |
| **Administrator de chiriaș** | un chiriaș | gestiona chiriașul: monitoare, resurse, aplicații, canale, rapoarte, tokenuri API |
| **Operator** | un chiriaș | vedea totul; pune pe pauză, relua și testa monitoare, confirma, amuți și rezolva incidente, adăuga note |
| **Vizualizator** | un chiriaș | vedea totul, fără să modifice nimic |

Un utilizator poate avea un rol diferit la fiecare chiriaș. Superadministratorii gestionează
utilizatorii și chiriașii în **Administrare**.

## Invitații și conectare

**Administrare › Utilizatori › Invită utilizator**: nume, e-mail, **limba** utilizatorului (pentru
e-mailul de invitație și prima conectare) și rolurile. Primește un link de unică folosință (valabil 72
de ore) pentru a-și alege parola și a configura **autentificarea în doi pași**, care este
obligatorie. Dacă e-mailul nu este configurat, copiați linkul din fereastră și trimiteți-l
dumneavoastră.

Ați pierdut telefonul? Conectați-vă cu unul dintre **codurile de recuperare**. Un administrator poate,
din fereastra utilizatorului, să **Reseteze 2FA** (parola rămâne) sau să **Reseteze parola și 2FA**;
utilizatorul primește un link nou.

Conturile sunt blocate 15 minute după 5 încercări eșuate de parolă sau de cod.

## Dezactivarea și ștergerea utilizatorilor

**Dezactivează** blochează imediat conectarea și păstrează contul. **Șterge utilizatorul** elimină
contul cu sesiunile, rolurile și 2FA; incidentele, notele și jurnalul de audit își păstrează istoricul
(afișat ca *name@example (șters)*). Nu vă puteți șterge pe dvs. și nici ultimul superadministrator
activ.

## Tokenuri API

**Acces API** (administratorii de chiriaș pentru chiriașul lor, administratorii de infrastructură în
domeniul Infrastructură globală) creează tokenuri cu o permisiune:

| Permisiune | Permite |
|---|---|
| **Citire** | vizualizarea monitoarelor, incidentelor și rapoartelor |
| **Operare** | și pauză/reluare, confirmare, note, teste |
| **Gestionare** | și creare, modificare și ștergere |

Un token funcționează doar în domeniul său, poate expira, poate fi revocat și nu poate gestiona
niciodată utilizatori, chiriași, setări sau alte tokenuri. Este afișat o singură dată; se păstrează
doar un hash.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

Documentația API este inclusă la **/api/docs** (funcționează și offline); specificația citibilă de
mașini este la `/api/openapi.json`.

## Jurnal de audit

**Administrare › Jurnal de audit** înregistrează conectările și eșecurile, blocările, invitațiile și
fiecare modificare a utilizatorilor, chiriașilor și setărilor, cu valorile dinainte și de după.

## Profilul dvs.

În **Profil** (în partea de jos a barei laterale) vă schimbați numele și parola, mutați
autentificarea în doi pași pe un telefon nou (cel vechi funcționează până confirmați noul telefon),
primiți coduri de recuperare noi și vă vedeți sesiunile pentru a le deconecta pe celelalte.
Schimbarea parolei sau a telefonului vă deconectează celelalte sesiuni.

File: **Datele dvs.**, **Parolă**, **Autentificare în doi pași**, **Sesiuni** și **Gardă** (gărzile, metodele de contact și pașii de notificare). Adresa păstrează fila deschisă, de exemplu `/profile#sessions`.

**Metodele de contact** sunt felul în care Fudo vă contactează personal, de exemplu când sunteți de
gardă: e-mail, un workflow Microsoft Teams care scrie în chatul dvs. sau Telegram (după ce un
administrator conectează un bot Telegram în *Setări*). Fiecare metodă este confirmată întâi cu un cod
de 6 cifre. **Pașii dvs. de notificare** arată ce metode se folosesc și când, de exemplu e-mail imediat
și Telegram după 5 minute, până când incidentul este confirmat.

## Echipe și responsabilitate

**Echipe** grupează responsabilii pentru aplicații și infrastructură, de exemplu o *Echipă de baze
de date* la un chiriaș sau o *Echipă de stocare* în domeniul Infrastructură globală. Fiecare este
**membru** sau **coordonator**; pot fi adăugate doar persoane cu acces la domeniul echipei.

Alegeți **echipa proprietară** pe pagina unei aplicații sau a unei resurse. Fiecare incident arată
atunci proprietarul și coordonatorii, inclusiv incidentele monitoarelor (prin resursa sau aplicația
lor), la fel și rapoartele post-incident. Elementele unui chiriaș aparțin echipelor chiriașului,
infrastructura partajată echipelor globale. Gărzile se stabilesc pe echipă.
