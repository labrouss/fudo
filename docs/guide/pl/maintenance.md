<!-- translation-of: maintenance.md#f097f823 -->
# Okna konserwacji

Planuj prace tak, aby nikogo nie alarmowały i nie obniżały dostępności.

**Konserwacja › Zaplanuj konserwację**: podaj tytuł, początek i koniec, notatki (wniosek o zmianę,
osobę kontaktową, plan wycofania) oraz to, co **obejmuje**: zasoby (wraz z ich sprawdzeniami) i
monitory.

W trakcie okna:

- sprawdzenia nadal działają, więc widzisz, co się dzieje,
- ich wyniki są **wyłączone z dostępności** i SLA,
- **powiadomienia są wstrzymane**,
- elementy zależne od czegoś w konserwacji pokazują to jako przyczynę (*Dotknięty przez
  konserwację*), aby nikt nie szukał przyczyny zaplanowanej przerwy.

**Zakończ teraz** zamyka okno wcześniej. Okna mają stan *Zaplanowana*, *W toku* lub *Zakończona*.

Wskazówka: najpierw użyj **Co jeśli to ulegnie awarii?** przy zasobie, aby zobaczyć, których
aplikacji dotkną prace.

## Cykliczna konserwacja

Przy planowaniu wybierz **Powtarzanie**: codziennie, co tydzień w wybrane dni albo co miesiąc,
w określony dzień miesiąca (dzień 31 wypada w ostatni dzień krótszych miesięcy) lub w dzień tygodnia
danego tygodnia (*wtorek w drugim tygodniu* to Patch Tuesday Microsoftu). Godziny dotyczą wybranej
strefy czasowej, więc 02:00 pozostaje 02:00 także po zmianie czasu; godzina zakończenia wcześniejsza
niż rozpoczęcia oznacza następny dzień.

Fudo tworzy okna na najbliższe 60 dni, oznaczone jako **Powtarza się**. **Pomiń** usuwa jedno
wystąpienie, a edycja okna zmienia tylko to wystąpienie. Edycja serii zmienia jej przyszłe okna;
usunięcie ich pozbywa się, a przeszłe i trwające okna zostają.
