<!-- translation-of: concepts.md#61c26734 -->
# Pojęcia

## Zakresy: dzierżawcy i infrastruktura globalna

| Zakres | Zawiera | Zarządza |
|---|---|---|
| **Dzierżawca** (jeden na jednostkę biznesową) | swoje aplikacje, monitory, zasoby, kanały i raporty | administratorzy dzierżawcy |
| **Infrastruktura globalna** | wspólne zasoby (przełączniki, macierze dyskowe, sieci FC, klastry) i ich monitory | administratorzy infrastruktury i superadministratorzy |

Wybierz zakres z listy u góry paska bocznego. Dzierżawcy widzą wspólną infrastrukturę tylko do
odczytu i łączą z nią własne monitory i aplikacje, dzięki czemu awaria macierzy pojawia się jako
przyczyna w każdej aplikacji, która z niej korzysta.

## Elementy

| Element | Czym jest | Przykład |
|---|---|---|
| **Monitor** | jedno sprawdzenie, wykonywane cyklicznie | HTTPS na `erp.corp.local/health` |
| **Zasób** | element infrastruktury, sprawdzany przez swoje monitory | `Core-SW-01`, `SAN-A` |
| **Aplikacja** | usługa biznesowa: monitory (członkowie) oraz infrastruktura, której potrzebuje | *ERP Production* |
| **Zależność** | „to potrzebuje tamtego”: zasób → zasób, aplikacja → zasób | klaster ESXi → SAN-A |

```
application ──members──▶ monitors ──check──▶ asset ──depends on──▶ asset …
     └──────────────────depends on──────────────────▶ asset
```

Przy zasobie **Dodaj istniejące** przypina monitory, które już masz (monitor przypięty do innego zasobu zostaje przeniesiony), a **Nowy monitor** otwiera formularz monitora dla tego zasobu. Dzierżawca może też przypiąć własne monitory do wspólnego zasobu globalnego; **Usuń** odpina monitor od zasobu i go zachowuje.

## Stany

| Stan | Znaczenie |
|---|---|
| **Działa** | działa |
| **Zdegradowany** | działa, ale wolno lub częściowo (np. opcjonalny członek jest niedostępny) |
| **Niedostępny** | nie działa, a nic, od czego zależy, tego nie wyjaśnia: to **główna przyczyna** |
| **Dotknięty** | nie działa, **ponieważ** coś, od czego zależy, jest niedostępne; powiadomienia wskazują główną przyczynę |
| **Zagrożony** | działa, ale coś, od czego zależy, ma problem |
| **Konserwacja** | w zaplanowanym oknie konserwacji: nie obniża dostępności |
| **Oczekujący** | brak jeszcze wyniku |

## Jak Fudo znajduje główną przyczynę

| Sytuacja | Wynik |
|---|---|
| Sprawdzenia zasobu kończą się błędem i nic, od czego zależy, nie jest niedostępne | **Niedostępny**: główna przyczyna, z własnym incydentem |
| Jego sprawdzenia kończą się błędem **i** coś, od czego zależy, jest niedostępne | **Dotknięty przez** tę główną przyczynę: bez lawiny powiadomień |
| Jego sprawdzenia przechodzą, ale coś, od czego zależy, jest niedostępne | zachowuje swój stan, z oznaczeniem **Zagrożony** |
| Coś, od czego zależy, jest w zaplanowanej konserwacji | **Dotknięty przez konserwację** (zaplanowaną, poza dostępnością) |

Aplikacja jest sprawna, gdy sprawni są jej członkowie, zgodnie z jej regułą: **wszyscy wymagani
członkowie działają**, **co najmniej jeden** albo **co najmniej N z M** (dla usług redundantnych).
Wymagani członkowie decydują o stanie; opcjonalni mogą ją najwyżej uczynić *Zdegradowaną*.

**Co jeśli to ulegnie awarii?** przy zasobie przewiduje, które aplikacje przestałyby działać, a które
przetrwałyby dzięki redundancji, zanim wyłączysz go na czas prac.

Strona **Topologia** pokazuje całość ze stanem na żywo: najedź na element, aby prześledzić jego
zależności; *Tylko problemy* pokazuje, co nie działa i co od tego zależy.
