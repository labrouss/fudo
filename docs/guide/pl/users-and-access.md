<!-- translation-of: users-and-access.md#c2bf850f -->
# Użytkownicy i dostęp

## Role

| Rola | Gdzie | Może |
|---|---|---|
| **Superadmin** | wszędzie | wszystko, łącznie z użytkownikami, dzierżawcami i ustawieniami |
| **Administrator infrastruktury** | zakres Infrastruktura globalna (i każdy dzierżawca) | zarządzać wspólną infrastrukturą i danymi wszystkich dzierżawców |
| **Administrator dzierżawcy** | jeden dzierżawca | zarządzać dzierżawcą: monitorami, zasobami, aplikacjami, kanałami, raportami, tokenami API |
| **Operator** | jeden dzierżawca | widzieć wszystko; wstrzymywać, wznawiać i testować monitory, potwierdzać, wyciszać i rozwiązywać incydenty, dodawać notatki |
| **Przeglądający** | jeden dzierżawca | widzieć wszystko, nic nie zmieniać |

Użytkownik może mieć inną rolę u każdego dzierżawcy. Użytkownikami i dzierżawcami zarządzają
superadministratorzy w **Administracji**.

## Zaproszenia i logowanie

**Administracja › Użytkownicy › Zaproś użytkownika**: imię i nazwisko, e-mail, **język** użytkownika
(dla e-maila z zaproszeniem i pierwszego logowania) oraz role. Otrzyma jednorazowy link (ważny 72
godziny), aby ustawić hasło i skonfigurować **uwierzytelnianie dwuskładnikowe**, które jest
obowiązkowe. Jeśli e-mail nie jest skonfigurowany, skopiuj link z okna i wyślij go samodzielnie.

Zgubiony telefon? Zaloguj się jednym z **kodów odzyskiwania**. Administrator może też w oknie
użytkownika wybrać **Resetuj 2FA** (hasło zostaje) lub **Resetuj hasło i 2FA**; użytkownik dostanie
nowy link.

Konta są blokowane na 15 minut po 5 nieudanych próbach hasła lub kodu.

## Dezaktywacja i usuwanie użytkowników

**Dezaktywuj** natychmiast blokuje logowanie i zachowuje konto. **Usuń użytkownika** usuwa konto
wraz z sesjami, rolami i 2FA; incydenty, notatki i dziennik audytu zachowują historię (widoczną jako
*name@example (usunięty)*). Nie możesz usunąć siebie ani ostatniego aktywnego superadministratora.

## Tokeny API

**Dostęp do API** (administratorzy dzierżawcy dla swojego dzierżawcy, administratorzy infrastruktury
w zakresie Infrastruktura globalna) tworzy tokeny z jednym uprawnieniem:

| Uprawnienie | Pozwala |
|---|---|
| **Odczyt** | przeglądać monitory, incydenty i raporty |
| **Obsługa** | także wstrzymywać/wznawiać, potwierdzać, dodawać notatki, testować |
| **Zarządzanie** | także tworzyć, zmieniać i usuwać |

Token działa tylko w swoim zakresie, może wygasnąć, może zostać unieważniony i nigdy nie może
zarządzać użytkownikami, dzierżawcami, ustawieniami ani innymi tokenami. Jest pokazywany tylko raz;
zapisywany jest wyłącznie jego skrót.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

Dokumentacja API jest wbudowana pod adresem **/api/docs** (działa offline); specyfikacja do odczytu
maszynowego jest pod `/api/openapi.json`.

## Dziennik audytu

**Administracja › Dziennik audytu** zapisuje logowania i nieudane próby, blokady, zaproszenia oraz
każdą zmianę użytkowników, dzierżawców i ustawień, z wartościami przed i po.

## Twój profil

W **Profilu** (na dole paska bocznego) zmieniasz imię i hasło, przenosisz uwierzytelnianie
dwuskładnikowe na nowy telefon (stary działa, dopóki nie potwierdzisz nowego), dostajesz nowe kody
odzyskiwania oraz widzisz swoje sesje i wylogowujesz pozostałe. Zmiana hasła lub telefonu wylogowuje
pozostałe sesje.

Karty: **Twoje dane**, **Hasło**, **Uwierzytelnianie dwuskładnikowe**, **Sesje** i **Dyżur** (Twoje dyżury, sposoby kontaktu i kroki powiadamiania). Adres zapamiętuje otwartą kartę, na przykład `/profile#sessions`.

**Sposoby kontaktu** to sposób, w jaki Fudo kontaktuje się z Tobą osobiście, np. podczas dyżuru:
e-mail, workflow Microsoft Teams publikujący na Twoim czacie albo Telegram (gdy administrator połączy
bota Telegram w *Ustawieniach*). Każdy sposób jest najpierw potwierdzany 6-cyfrowym kodem. **Twoje
kroki powiadamiania** określają, których sposobów i kiedy używać, np. e-mail od razu i Telegram po 5
minutach, dopóki incydent nie zostanie potwierdzony.

## Zespoły i odpowiedzialność

**Zespoły** grupują osoby odpowiedzialne za aplikacje i infrastrukturę, np. *Zespół baz danych* u
dzierżawcy albo *Zespół pamięci masowej* w zakresie Infrastruktura globalna. Każdy jest **członkiem**
lub **liderem**; dodać można tylko osoby z dostępem do zakresu zespołu.

Wybierz **zespół właściciela** na stronie aplikacji lub zasobu. Każdy incydent pokazuje wtedy
właściciela i liderów, także incydenty monitorów (przez ich zasób lub aplikację), podobnie jak raporty
poincydentowe. Elementy dzierżawcy należą do zespołów tego dzierżawcy, a wspólna infrastruktura do
zespołów globalnych. Dyżury ustala się dla zespołu.
