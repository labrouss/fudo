<!-- translation-of: incidents.md#4e781264 -->
# Incydenty

Fudo samo otwiera incydenty, gdy coś przestaje działać, i rozwiązuje je po przywróceniu.

## Kiedy otwiera się incydent

| Element | Otwiera incydent, gdy | Ważność |
|---|---|---|
| **Aplikacja** | jest Niedostępna albo Dotknięta niezaplanowaną przyczyną | według krytyczności: krytyczna → Krytyczny, wysoka → Poważny, pozostałe → Drobny |
| **Zasób** | jest Niedostępny (jest główną przyczyną) | Poważny |
| **Monitor** | jest Niedostępny i nie należy do zasobu ani aplikacji | Drobny |

Incydent **Dotknięty** jest powiązany z incydentem swojej głównej przyczyny (*Spowodowany przez
INC-…*): awaria przełącznika daje jeden incydent główny z wyraźnie powiązanymi incydentami
dotkniętymi, a nie lawinę powiadomień.

## Cykl życia incydentu

1. **Otwiera się** automatycznie i wysyłane są powiadomienia (zobacz [Powiadomienia](notifications.md)).
2. **Potwierdź** pokazuje, że ktoś się tym zajmuje; przypomnienia i eskalacje ustają.
3. **Wycisz** wstrzymuje powiadomienia na pewien czas (od 30 minut do 1 dnia) bez potwierdzania.
4. Zostaje **rozwiązany** automatycznie, gdy element wróci do działania. Jeśli w ciągu 5 minut
   znów przestanie działać, ten sam incydent zostaje **ponownie otwarty**, zamiast tworzyć nowy.
   Możesz go też rozwiązać ręcznie.

**Oś czasu** zapisuje każdy krok: zmiany stanu, powiadomienia, potwierdzenia i notatki.

## Notatki: dziel się wiedzą

Dodawaj notatki do osi czasu jako **Komentarz**, **Wykonane działanie** lub **Rozwiązanie**, z tagami
(np. `supervisor`, `firmware`).

Rozwiązania są wykorzystywane ponownie: gdy później wystąpi podobny incydent (ten sam element, ta
sama główna przyczyna, wspólne tagi lub podobny opis), **Podobne wcześniejsze incydenty** pokazują,
co pomogło, a jego powiadomienia to cytują: *„Ostatnio (INC-0041, 12 sie 2026) rozwiązano to tak:
…”*.

## Wyszukiwanie incydentów

**Incydenty** pokazuje **otwarte** incydenty zakresu wybranego na pasku bocznym; przełącz na
*Rozwiązany*, aby zobaczyć historię, i szukaj po tytule, numerze INC lub tagu. Incydenty innego
dzierżawcy pojawiają się po przełączeniu na tego dzierżawcę (zobacz
[Rozwiązywanie problemów](troubleshooting.md)).

## Raporty poincydentowe

**Raport poincydentowy** przy incydencie pobiera raport jako **PDF** lub **Markdown** (do wiki lub zgłoszenia): podsumowanie z czasami i informacją, kto potwierdził i rozwiązał incydent, incydenty dotknięte, rozwiązanie i wykonane działania, oś czasu, wysłane powiadomienia i podobne wcześniejsze incydenty. Używa Twojego języka i strefy czasowej; można go utworzyć także, gdy incydent jest jeszcze otwarty.
