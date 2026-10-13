<!-- translation-of: maintenance.md#f097f823 -->
# Ferestre de mentenanță

Planificați intervențiile astfel încât să nu alerteze pe nimeni și să nu conteze la disponibilitate.

**Mentenanță › Programează mentenanță**: dați un titlu, începutul și sfârșitul, note (cerere de
schimbare, persoană de contact, plan de revenire) și ce **acoperă**: resurse (cu verificările lor) și
monitoare.

Pe durata ferestrei:

- verificările continuă, ca să vedeți ce se întâmplă,
- rezultatele lor sunt **excluse din disponibilitate** și din SLA,
- **notificările sunt suprimate**,
- elementele care depind de ceva aflat în mentenanță arată asta drept cauză (*Afectat de
  mentenanță*), ca nimeni să nu caute cauza unei întreruperi programate.

**Încheie acum** închide o fereastră mai devreme. Ferestrele apar ca *Programată*, *În desfășurare*
sau *Finalizată*.

Sfat: folosiți întâi **Ce se întâmplă dacă aceasta cade?** pe resursă, ca să vedeți ce aplicații va
atinge intervenția.

## Mentenanță recurentă

Alegeți **Repetare** la programare: zilnic, săptămânal în zilele alese sau lunar, într-o zi a lunii
(ziua 31 cade în ultima zi a lunilor mai scurte) ori într-o zi a unei săptămâni (*marțea din a doua
săptămână* este Patch Tuesday de la Microsoft). Orele sunt în fusul orar ales, deci 02:00 rămâne 02:00
și după schimbarea orei; o oră de sfârșit anterioară începutului înseamnă ziua următoare.

Fudo creează ferestrele următoarelor 60 de zile, marcate cu **Se repetă**. **Omite** elimină o
apariție, iar editarea unei ferestre schimbă doar acea apariție. Editarea seriei îi schimbă
ferestrele viitoare; ștergerea le elimină, iar cele trecute și cele în desfășurare rămân.
