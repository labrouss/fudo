<!-- translation-of: getting-started.md#ea57bfb7 -->
# Pierwsze kroki

Fudo pokazuje, czy Twoje aplikacje biznesowe działają, **dlaczego** są niedostępne i co pomogło przy
podobnych problemach wcześniej. Ta strona prowadzi od nowej instalacji do pierwszego powiadomienia.

## 1. Pierwsze logowanie

Po instalacji (zobacz [Instalacja](../../admin/installation.md)) otwórz Fudo w przeglądarce.
**Kreator konfiguracji** poprosi o:

1. nazwę organizacji,
2. pierwszego administratora (imię i nazwisko, e-mail, hasło o długości co najmniej 12 znaków),
3. uwierzytelnianie dwuskładnikowe: zeskanuj kod QR aplikacją uwierzytelniającą (Microsoft
   Authenticator, Google Authenticator, 1Password, …) i **zachowaj kody odzyskiwania**,
4. opcjonalnie serwer poczty (SMTP), używany do zaproszeń, powiadomień i raportów. Możesz go też
   skonfigurować później w **Ustawieniach**.

Uwierzytelnianie dwuskładnikowe jest obowiązkowe dla każdego konta.

## 2. Utwórz dzierżawcę

**Dzierżawca** to jednostka biznesowa, na przykład *Finanse* lub *Kadry*. Jego aplikacje, monitory
i kanały powiadomień są oddzielone od innych dzierżawców. Przejdź do **Administracja › Dzierżawcy ›
Nowy dzierżawca**, a następnie wybierz go z listy u góry paska bocznego.

Wspólna infrastruktura (przełączniki rdzeniowe, macierze dyskowe, klastry) należy natomiast do
zakresu **Infrastruktura globalna**; zobacz [Pojęcia](concepts.md).

## 3. Dodaj monitor

**Monitory › Dodaj monitor**, wybierz typ (na przykład *HTTP(S)* lub *Ping*), podaj cel i kliknij
**Testuj teraz**, aby wykonać sprawdzenie raz, bez zapisywania. Zapisz go; wyniki pojawią się w
ciągu jednego interwału sprawdzania. Dla wielu hostów naraz użyj **Dodawanie masowe / szablony**;
zobacz [Monitory](monitors.md).

## 4. Zgrupuj monitory w aplikację

**Aplikacje › Nowa aplikacja**, a potem dodaj monitory, z których składa się usługa (frontend WWW,
API, baza danych). Stan aplikacji pokazuje, czy usługa działa, a jeśli nie, to dlaczego. Ustaw
**docelowe SLA**, aby śledzić je w raportach.

## 5. Otrzymuj powiadomienia

**Powiadomienia › Dodaj kanał**: e-mail, Microsoft Teams, Slack, webhook JSON lub jeden z ponad 100
innych (Telegram, PagerDuty, bramki SMS, …). **Wyślij test** sprawdza kanał. Zobacz
[Powiadomienia](notifications.md).

## 6. Zaproś współpracowników

**Administracja › Użytkownicy › Zaproś użytkownika**: wybierz ich język i rolę u każdego dzierżawcy.
Otrzymają jednorazowy link, aby ustawić hasło i skonfigurować uwierzytelnianie dwuskładnikowe.
Zobacz [Użytkownicy i dostęp](users-and-access.md).

## Co dalej

- [Pojęcia](concepts.md): zakresy, zasoby, zależności i jak Fudo znajduje główną przyczynę
- [Incydenty](incidents.md): co się dzieje, gdy coś przestaje działać
- [Rozwiązywanie problemów](troubleshooting.md): częste pytania
