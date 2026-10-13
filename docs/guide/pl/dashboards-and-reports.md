<!-- translation-of: dashboards-and-reports.md#254ddd09 -->
# Pulpity i raporty

## Przegląd

Otwarte incydenty, średni czas przywrócenia (MTTR, 30 dni), działające i niedziałające monitory,
aplikacje w docelowym SLA oraz karta każdej aplikacji z jej paskiem dostępności z 30 dni. Strony
odświeżają się na żywo (około sekundy po zmianie); pasek boczny pokazuje **Na żywo**, dopóki
połączenie trwa.

**Dostępność** wynika z historii stanów: czas niedostępności i dotknięcia obniża ją; zaplanowana
konserwacja i czas przed pierwszym sprawdzeniem nie.

## Wykresy

Każdy monitor pokazuje czas odpowiedzi z 1 h, 6 h, 24 h, 7, 30 i 90 dni (średnia, p95, błędy,
konserwacja), ostatnie sprawdzenia jako pasek tętna, zmiany stanu i najnowsze wyniki.

## Raporty

**Raporty** pokazują dla każdej aplikacji (lub wspólnego zasobu w zakresie Infrastruktura globalna):
dostępność 24/7 i w **godzinach pracy**, czas niedostępności, zaplanowaną konserwację, incydenty,
spełnienie SLA, MTTA (czas do potwierdzenia) i MTTR (czas do rozwiązania). Wybierz poprzedni
tydzień, poprzedni miesiąc, ostatnie 30 dni lub własne daty i pobierz raport jako:

- **PDF**: w Twoim języku; raporty po arabsku są składane od prawej do lewej,
- **CSV**: dostępność i incydenty, UTF-8 dla Excela, z angielskimi nazwami kolumn, aby arkusze i
  skrypty nadal działały.

## Raporty zaplanowane

**Raporty › Nowy harmonogram** wysyła e-mailem PDF i/lub CSV w każdy poniedziałek (poprzedni
tydzień) lub 1. dnia miesiąca (poprzedni miesiąc) o wybranej godzinie i w wybranej strefie
czasowej, w języku harmonogramu, przez serwer SMTP z Ustawień. **Wyślij teraz** wysyła od razu
ostatni okres.

## Strony statusu

**Strony statusu › Nowa strona statusu** pokazuje wybrane aplikacje, zasoby i monitory na osobnej
stronie pod adresem `/status/<adres>`, ze stanem ogólnym, dostępnością z 90 dni, bieżącymi
incydentami i konserwacjami. Każdy element ma **nazwę wyświetlaną**, pokazywaną zamiast nazwy
wewnętrznej; elementy z tej samej grupy są pokazywane razem. Strony dzierżawcy mogą obejmować też
wspólną infrastrukturę.

- **Publiczna**: każdy z linkiem, bez logowania. Strona pokazuje tylko nazwy wyświetlane i proste
  stany (*Działa, Zdegradowany, Awaria, Konserwacja*), nigdy nazw wewnętrznych, przyczyn, tytułów
  incydentów ani nazw konserwacji.
- **Wewnętrzna**: zalogowani użytkownicy z dostępem do dzierżawcy, którzy widzą też tytuły
  incydentów i nazwy konserwacji.

Strona odświeża się co minutę i używa języka oraz jasnego lub ciemnego trybu odwiedzającego.
