<!-- translation-of: settings.md#401e7e53 -->
# Ustawienia

**Ustawienia** (na dole paska bocznego) zawierają Twoje osobiste preferencje, dla wszystkich, oraz
ustawienia systemu, dla superadministratorów.

Każda sekcja to karta. Adres zapamiętuje otwartą kartę (na przykład `/settings#retention`), więc kartę można dodać do zakładek lub wysłać jako link.

## Twoje preferencje

- **Język interfejsu**: 13 języków, w tym arabski z układem od prawej do lewej. Zapisywany w Twoim
  profilu, więc towarzyszy Ci w każdej przeglądarce. Tłumaczone są też tytuły incydentów i wyniki
  sprawdzeń.
- **Motyw**: **System** (podąża za jasnym lub ciemnym trybem systemu operacyjnego), **Jasny**,
  **Ciemny**, **Monokai** oraz motywy dodane przez administratora.

## Ustawienia systemu (superadministratorzy)

### Język powiadomień

**Język domyślny** powiadomień i zaplanowanych raportów. Każdy kanał i harmonogram może mieć własny;
e-maile do konkretnej osoby (zaproszenia, resety) są w jej języku. Nie zmienia interfejsu: ten każdy
wybiera sam w *Preferencjach*.

### E-mail (SMTP)

Używany do zaproszeń, powiadomień e-mail i zaplanowanych raportów.

| Pole | Uwagi |
|---|---|
| Host SMTP, port | 587 (STARTTLS) lub 465 (*Używaj TLS od początku*); 25 dla wewnętrznego przekaźnika |
| Nazwa użytkownika, hasło | opcjonalne; hasło jest przechowywane w postaci zaszyfrowanej i nigdy więcej nie jest pokazywane |
| Adres nadawcy | np. `fudo@corp.local` |
| **Akceptuj certyfikaty z podpisem własnym** | dla lokalnego przekaźnika z certyfikatem z podpisem własnym lub wewnętrznym: połączenie pozostaje szyfrowane, pomijana jest tylko weryfikacja certyfikatu |

**Wyślij e-mail testowy** podaje dokładną przyczynę problemu: niezaufany certyfikat, błędne hasło,
nieosiągalny serwer lub tryb TLS niepasujący do portu.

## Dla administratorów

Nowe języki i motywy dodaje się, umieszczając pliki w folderach, bez ponownego budowania; zobacz
`locales/README.md` i `themes/README.md` w repozytorium.

## Przechowywanie danych

**Ustawienia › Przechowywanie danych** (superadministratorzy) określa, jak długo przechowywany jest każdy rodzaj danych, i pokazuje zajmowane miejsce: surowe wyniki sprawdzeń, podsumowania godzinowe i dzienne, historię stanów, rozwiązane incydenty, dziennik powiadomień, dziennik audytu i zakończone okna konserwacji. Stare dane są usuwane co godzinę, po trochu. Minimalne wartości chronią to, co pokazuje Fudo (wykresy z 90 dni, raporty dostępności, strony statusu), a ostatnia zmiana stanu przed granicą jest zawsze zachowywana, więc dostępność pozostaje dokładna. Otwarte incydenty i powiadomienia czekające na wysłanie nigdy nie są usuwane.
