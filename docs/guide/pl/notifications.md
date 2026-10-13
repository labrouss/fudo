<!-- translation-of: notifications.md#5487cd95 -->
# Powiadomienia

## Kanały

**Powiadomienia › Dodaj kanał**. Wbudowane: **E-mail** (wymaga serwera SMTP z Ustawień), **Microsoft
Teams** (webhook Workflows), **Slack** (incoming webhook) i **Webhook (JSON)**. Ponad 100 innych
(Telegram, Discord, PagerDuty, Opsgenie, ntfy, Pushover, Signal, Twilio i inne bramki SMS,
Mattermost, Matrix, Google Chat, …) pochodzi od dostawców powiadomień Uptime Kuma. **Wyślij test**
sprawdza kanał; **Dziennik** pokazuje każde wysłanie i powód pominięcia kanału.

Wiadomości czatu zaczynają się od **[Fudo]**, dzięki czemu łatwo je odróżnić od innych narzędzi
piszących na tym samym czacie.

## Które incydenty otrzymuje kanał

| Ustawienie | Działanie |
|---|---|
| **Wysyłaj** | *Wszystkie incydenty tego dzierżawcy* (domyślnie) lub *Tylko incydenty wybranych aplikacji* |
| **Minimalna ważność** | Drobny i wyżej (wszystkie), Poważny i Krytyczny albo tylko Krytyczny |
| **Zdarzenia** | otwarcie, potwierdzenie, rozwiązanie |
| **Pomijaj incydenty spowodowane przez inny incydent** | tylko główne przyczyny, bez powiązanych z nimi incydentów dotkniętych |
| **Przypominaj, dopóki niepotwierdzony** | powtarzaj co N minut, dopóki nikt nie potwierdzi |
| **Język wiadomości** | język kanału; domyślnie język organizacji (Ustawienia) |

Kanały dzierżawcy otrzymują jego incydenty, także te spowodowane przez wspólną infrastrukturę (z
główną przyczyną w wiadomości). Kanały globalne otrzymują incydenty infrastruktury; z opcją
**wszyscy dzierżawcy** (kanał NOC) otrzymują też incydenty każdego dzierżawcy, z wyjątkiem tych
spowodowanych incydentem infrastruktury, który już otrzymały.

**Dla aplikacji:** kanał z opcją *Tylko incydenty wybranych aplikacji* dowiaduje się tylko o nich.
Wybierz je w formularzu kanału albo na stronie aplikacji, w karcie **Powiadomienia**, która ostrzega
też, gdy incydenty aplikacji nie trafiają do żadnego kanału.

## Eskalacja

Nadaj kanałowi opóźnienie (**Eskaluj: brak potwierdzenia po 15 min**), a stanie się krokiem
eskalacji: dostanie powiadomienie tylko wtedy, gdy po tym czasie incydent jest nadal otwarty,
niepotwierdzony i niewyciszony, a potem otrzyma jego potwierdzenie i rozwiązanie. Połącz kilka:
Teams od razu → SMS dla dyżurnego po 15 minutach → przełożony po 60 minutach.

## Dostarczanie

Wiadomości przechodzą przez kolejkę wychodzącą z ponowieniami (po 1, 5 i 15 minutach) i limitem
dla każdego kanału, aby lawina incydentów nie doprowadziła do zablokowania bota czy przekaźnika
poczty.

## Treść webhooka

```json
{ "event": "opened",
  "incident": { "key": "INC-0042", "title": "ERP Production is down", "severity": "major",
                "status": "open", "entityType": "application", "entityName": "ERP Production",
                "entityStatus": "DOWN", "tenantName": "Finance", "cause": null, "parentNumber": null },
  "organization": "Acme" }
```

Ustaw **sekret podpisu**, aby otrzymywać `X-Fudo-Signature: sha256=<HMAC treści>`. Treść pozostaje
po angielsku (to stały format dla integracji); `incident.titleParts` zawiera tytuł jako kody
komunikatów, jeśli chcesz go przetłumaczyć samodzielnie.

## Dyżury

Zespoły powiadamiają osoby o incydentach swoich elementów. W **Zespoły › Dyżur** ustaw członków w
kolejności grafiku, wybierz długość dyżuru (jeden dzień, jeden tydzień, dwa tygodnie lub dowolną liczbę
dni), godzinę przekazania i strefę czasową oraz incydenty, o których trzeba powiadamiać. Kroki
**eskalacji** określają, kto i kiedy jest powiadamiany, licząc od otwarcia incydentu: np. osoba na
dyżurze od razu, następna po 15 minutach, a liderzy po 30. **Zastępstwa** pozwalają komuś innemu przejąć
okres, np. przy zamianie lub urlopie.

Każda osoba jest powiadamiana przez własne kroki powiadamiania (zob. *Twój profil*) albo e-mailem na
adres logowania, jeśli ich nie ma. Powiadomienia ustają, gdy tylko ktoś potwierdzi incydent, i są
wstrzymane, gdy jest wyciszony. Strona incydentu pokazuje, kogo powiadomiono i co wysłano; Twój profil
pokazuje Twoje najbliższe dyżury.

Wiadomości dyżurne zawierają linki **Potwierdź** i **Otwórz w Fudo** (ustaw `PUBLIC_URL`). Potwierdź otwiera stronę, na której jedno dotknięcie potwierdza incydent w Twoim imieniu, bez logowania; samo otwarcie linku niczego nie zmienia, więc podglądy linków i skanery poczty nie potwierdzą przez przypadek. Każdy link działa raz, przez 24 godziny, dopóki incydent jest otwarty, i tylko jeśli Twoja rola pozwala potwierdzać incydenty.
