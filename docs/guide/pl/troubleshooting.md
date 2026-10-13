<!-- translation-of: troubleshooting.md#0d0eae59 -->
# Rozwiązywanie problemów

### Dostałem powiadomienie, ale lista incydentów jest pusta

- **Inny dzierżawca**: lista pokazuje zakres wybrany na pasku bocznym. Kanał z opcją *wszyscy
  dzierżawcy* otrzymuje incydenty każdego dzierżawcy; przełącz dzierżawcę, aby je zobaczyć.
- **Już rozwiązany**: krótkie przerwy otwierają i zamykają incydent w ciągu kilku minut; zajrzyj do
  *Rozwiązany*.
- **Nie z Fudo**: wiadomości czatu z Fudo zaczynają się od **[Fudo]** i nigdy nie zawierają surowych
  kodów błędów, takich jak `EHOSTUNREACH`. Jeśli inne narzędzie monitorujące (na przykład Uptime
  Kuma) nadal pisze na tym samym czacie, powiadomienie pochodzi od niego. **Dziennik** kanału
  pokazuje wszystko, co wysłało Fudo.

### Monitor zgłasza „Host nieosiągalny” lub „Przekroczono limit czasu”

Sprawdzenie jest wykonywane z kontenera **workera** Fudo, a nie z Twojego komputera. Upewnij się,
że host workera ma dostęp do celu (routing, zapory). Dla pingu kontenery potrzebują uprawnienia
`NET_RAW` (ustawionego w `docker-compose.yml`).

### „Certyfikat serwera SMTP nie jest zaufany”

Twój przekaźnik poczty używa certyfikatu z podpisem własnym lub wewnętrznego. Włącz **Akceptuj
certyfikaty z podpisem własnym** w Ustawienia › E-mail (SMTP).

### Wszystko za jednym przełącznikiem naraz zrobiło się czerwone

To oczekiwane i Fudo sobie z tym radzi: przełącznik jest **Niedostępny** (główna przyczyna), a to,
co za nim, jest **Dotknięte**. Dostajesz jeden incydent główny z pozostałymi powiązanymi. Upewnij
się, że zależności są opisane (zasób *zależy od* przełącznika), aby Fudo o tym wiedziało.

### Zaplanowana zmiana zaalarmowała dyżurnych

Najpierw utwórz [okno konserwacji](maintenance.md) dla zasobów, których dotyczy: sprawdzenia nadal
działają, ale powiadomienia są wstrzymane, a czas nie obniża dostępności.

### Incydenty aplikacji do nikogo nie docierają

Otwórz aplikację: jej karta **Powiadomienia** ostrzega, gdy żaden kanał nie otrzymuje jej
incydentów (na przykład gdy wszystkie kanały mają opcję *Tylko incydenty wybranych aplikacji* bez
niej).

### Strona pokazuje „Ponowne łączenie z aktualizacjami na żywo”

Przeglądarka straciła połączenie z API; strony same zaczną się odświeżać, gdy wróci. Jeśli to trwa,
sprawdź, czy proxy przed Fudo pozwala na długotrwałe połączenia (Server-Sent Events) do `/api/live`.

### Zgubiłem telefon

Zaloguj się kodem odzyskiwania albo poproś administratora o **zresetowanie 2FA** na Twoim koncie.
