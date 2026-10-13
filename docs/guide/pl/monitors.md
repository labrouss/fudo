<!-- translation-of: monitors.md#eb8b19a2 -->
# Monitory

## Lista

Lista monitorów pokazuje **zasób** każdego monitora i **aplikacje**, do których należy (członkostwo opcjonalne ma przerywaną ramkę); oba są linkami. Kliknij nagłówek kolumny, aby sortować (ponownie, aby odwrócić, trzeci raz dla domyślnej kolejności); Fudo zapamiętuje sortowanie w tej przeglądarce. Filtr przeszukuje nazwy, cele, tagi, zasoby i aplikacje; ignoruje wielkość liter i znaki diakrytyczne, a każde słowo musi pasować. Pozostałe długie listy (zasoby, incydenty, użytkownicy, konserwacje, kanały i inne) sortuje się i filtruje tak samo.

## Typy monitorów

| Kategoria | Typ | Sprawdza |
|---|---|---|
| WWW | **HTTP(S)** | zakresy kodów stanu, słowo kluczowe obecne/nieobecne, wartość JSON (`$.status`), nagłówki, treść, czas odpowiedzi |
| | **Certyfikat TLS** | zaufanie, nazwę hosta, dni do wygaśnięcia (Zdegradowany na N dni przed, Niedostępny po wygaśnięciu) |
| Sieć | **Ping** | osiągalność, opóźnienie, utratę pakietów |
| | **Port TCP** | port przyjmuje połączenia |
| | **DNS** | A/AAAA/CNAME/MX/TXT/NS, opcjonalnie oczekiwana odpowiedź, wybrany resolver |
| | **SNMP** | odczytuje OID (v1, v2c, v3) i porównuje wartość lub, dla liczników, jej zmianę na sekundę |
| | **Interfejs sieciowy (SNMP)** | port przełącznika, routera lub zapory: stan łącza, ruch przychodzący i wychodzący (bit/s i % prędkości łącza), błędy; na wykresie w czasie |
| | **NTP** | osiągalność, stratum, przesunięcie zegara |
| | **SMTP** | powitanie 220, EHLO, opcjonalnie STARTTLS |
| | **LDAP / Active Directory** | katalog odpowiada (Active Directory: zdegradowany, dopóki kontroler domeny nie jest zsynchronizowany) albo konto loguje się, a wyszukiwanie znajduje wpisy; wskazuje konta zablokowane, wygasłe i wyłączone |
| | **Wygaśnięcie domeny** | wygaśnięcie rejestracji przez RDAP (zapasowo WHOIS) |
| Bazy danych | **PostgreSQL, MySQL/MariaDB, Microsoft SQL Server, MongoDB, Redis** | łączy się, opcjonalne zapytanie z oczekiwanym wynikiem |
| Systemy | **Polecenie SSH** | kod wyjścia lub wynik (zawiera, dokładny, regex), opcjonalne przypięcie klucza hosta |
| | **Kontener Docker** | działa, i jest sprawny, jeśli ma kontrolę stanu |
| Infrastruktura | **Maszyna wirtualna vCenter** | stan zasilania, VMware Tools (vCenter 6.7, 7, 8) |
| | **Stan HPE iLO / Redfish** | stan sprzętu serwera z BMC (iLO 4/5/6, iDRAC, inne BMC z Redfish) |
| | **Temperatura wlotowa (iLO / Redfish)** | temperatura powietrza wpływającego do serwera, czyli przed szafą: zdegradowany od 27 °C, niedostępny od 32 °C (ASHRAE), z wykresem |
| | **Temperatura pomieszczenia** | wszystkie czujniki wlotowe z tagiem `room:<name>` razem: niedostępny, gdy kilka jest gorących (problem z chłodzeniem), zdegradowany, gdy jeden jest gorący lub kilka szybko rośnie |
| Pasywne | **Heartbeat push** | zadanie wywołuje URL; Niedostępny, gdy przestanie wywoływać |
| | **Pułapki SNMP** | pułapki wysyłane przez urządzenie (v1, v2c): niedostępny lub zdegradowany, dopóki pułapka problemu jest otwarta; kończy się sama, pułapką kończącą lub ręcznie |

**Testuj teraz** wykonuje sprawdzenie raz z serwera Fudo, bez zapisywania, aby można je było
dostroić, zanim zacznie wysyłać powiadomienia.

## Unikanie fałszywych alarmów

- **Niedostępny po N błędach**: monitor staje się Niedostępny dopiero po N kolejnych nieudanych
  sprawdzeniach, a w międzyczasie sprawdza w krótszym *interwale ponawiania*.
- **Działa po M sukcesach**: wraca do stanu Działa dopiero po M kolejnych udanych sprawdzeniach.
- **Zdegradowany powyżej**: wolne odpowiedzi liczą się jako Zdegradowany, a nie Niedostępny.

## Dane logowania

Hasła, community SNMP, klucze SSH i podobne są przechowywane **w postaci zaszyfrowanej** i nigdy nie
są ponownie wyświetlane, eksportowane ani zwracane przez API; odszyfrowuje je tylko worker, aby
wykonać sprawdzenie. Używaj kont tylko do odczytu: roli vCenter *Read-only*, użytkownika iLO z
uprawnieniem *Login*, użytkownika bazy danych tylko z `CONNECT`/`SELECT`.

### Wspólne dane logowania

Gdy wiele monitorów loguje się tym samym kontem (jeden użytkownik iLO tylko do odczytu dla
wszystkich serwerów, jedna społeczność SNMP dla przełączników), zapisz je raz w sekcji **Dane
logowania** i pozwól monitorom z nich korzystać. Gdy hasło się zmieni, edytuj dane logowania raz:
każdy monitor, który ich używa, od razu sprawdza ponownie z nową wartością.

- Dane logowania mają rodzaj: *Konto i hasło*, *Klucz SSH*, *Społeczność SNMP (v1, v2c)* lub
  *Użytkownik SNMPv3*. W formularzu monitora typy, które się logują, oferują **Wpisz tutaj** lub
  **Użyj wspólnych danych logowania**; przy wspólnych danych pola konta znikają z formularza.
- Dane logowania należą do jednego zakresu: monitory dzierżawcy mogą używać tylko danych tego
  dzierżawcy, a monitory zakresu globalnej infrastruktury tylko globalnych.
- Sekrety można tylko zapisywać, tak jak sekrety monitora: są przechowywane w postaci
  zaszyfrowanej i nigdy nie są wyświetlane, eksportowane ani zwracane. Lista pokazuje konto i
  monitory, które go używają.
- **To samo konto w kilku monitorach**: strona pokazuje monitory, które już przechowują to samo
  konto i hasło. Nadaj grupie nazwę i wybierz **Utwórz wspólne dane logowania**: hasło jest
  kopiowane na serwerze, nikt nie musi go znać.
- **Użyj dla…** przypisuje kolejne monitory do danych logowania; ich własne konto i hasło są
  usuwane. Używanych danych logowania nie można usunąć ani zmienić ich rodzaju.
- Monitor, który przestaje używać wspólnych danych logowania, znów potrzebuje własnego hasła.
- W [konfiguracji jako kodzie](configuration-as-code.md) monitor wskazuje swoje dane logowania
  (`credential: iLO read-only`); same dane tworzy się w interfejsie. Może ich używać także masowe
  dodawanie sprawdzeń temperatury.
- Każda zmiana trafia do dziennika audytu, z nazwami zmienionych sekretów, nigdy z ich wartościami.

## Monitory push

Monitor push czeka, aż Twoje zadanie go wywoła. Po zapisaniu jego strona pokazuje URL:

```bash
curl -fsS "https://fudo.corp.local/api/push/<token>?msg=backup%20ok&ping=5400"   # success
curl -fsS "https://fudo.corp.local/api/push/<token>?status=down&msg=disk%20full" # report a failure
```

Staje się Niedostępny, gdy w ciągu interwału i okresu karencji nie nadejdzie żadne wywołanie.
**Nowy URL** zastępuje token, jeśli wyciekł.

## Dodawanie masowe i szablony

**Monitory › Dodawanie masowe / szablony** tworzy sprawdzenia dla wielu hostów naraz:

1. wklej jeden host lub URL w wierszu (lub wczytaj CSV z kolumnami `name,host,port`),
2. wybierz **szablon**, na przykład *serwer Windows* (ping, RDP, WinRM), *serwer Linux*, *HPE iLO*,
   *urządzenie sieciowe*, *host ESXi*, *vCenter*, *SQL Server*, *macierz dyskowa* lub *aplikacja
   WWW*, albo pojedynczy typ sprawdzenia,
3. opcjonalnie utwórz zasób dla każdego wiersza, uzależnij je od istniejącego zasobu i dodaj do
   aplikacji.

Przed zastosowaniem pokazuje podgląd wszystkiego, co zostanie utworzone.

## Uwagi do poszczególnych typów

- **Maszyna wirtualna vCenter** sama wybiera właściwą wersję API i ponownie używa sesji (jedno
  logowanie do vCenter co 20 minut). Sprawdzanie VMware Tools wymaga vCenter 7.0 lub nowszego.
- **HPE iLO / Redfish** wskazuje w HPE iLO uszkodzony element (wentylatory, zasilacze, pamięć masową,
  redundancję). Warning → Zdegradowany, Critical lub wyłączony → Niedostępny.
- **Polecenie SSH**: ustaw *Odcisk klucza hosta* (`ssh-keyscan host | ssh-keygen -lf -`), aby zmieniony
  klucz serwera był zgłaszany, a nie akceptowany.
- **Kontener Docker** używa lokalnego gniazda Dockera (zamontuj je w kontenerze workera, zobacz
  `docker-compose.yml`) lub adresu zdalnego API Dockera.
- **Wygaśnięcie domeny**: niektóre krajowe rejestry nie publikują ani RDAP, ani WHOIS; Fudo zgłasza
  to jako Zdegradowany z wyjaśnieniem.
- **Ping** wymaga uprawnienia `NET_RAW` w kontenerze workera, a dla **Testuj teraz** także w
  kontenerze API (oba ustawione w `docker-compose.yml`).

## Pułapki SNMP

Skieruj pułapki SNMP (v1 lub v2c) swoich urządzeń na serwer Fudo, port UDP 162. Strona
**Pułapki** pokazuje, czy pułapki są odbierane, oraz każdą pułapkę z jej polami.

- Monitor **Pułapki SNMP** przyjmuje pułapki urządzeń z pola **Od**: adresy, nazwy hostów lub
  zakresy IPv4 (`10.0.12.0/24`). Z ustawioną **Społecznością** (lub wspólnymi danymi logowania
  typu społeczność SNMP) przyjmuje tylko pułapki, które ją niosą; społeczność nigdy nie jest
  zapisywana.
- **Pułapki problemów**: standardowe (link down, zimny i ciepły start, błąd uwierzytelniania),
  tylko wymienione pułapki (nazwy lub OID; OID obejmuje też wszystko pod nim, np. prefiks
  enterprise producenta) albo każda pułapka. *Tylko gdy pole zawiera* zawęża do pułapek z tekstem
  takim jak `Critical`.
- Dopóki problem jest otwarty, monitor jest **Niedostępny** (lub Zdegradowany, jeśli tak
  wybierzesz); incydent, powiadomienia i dyżury działają jak przy każdym sprawdzeniu, w ciągu
  sekundy od pułapki.
- Problemy są prowadzone osobno dla pułapki i interfejsu: link down na dwóch portach to dwa
  problemy, a **link up** jednego portu kończy tylko problem tego portu.
- **Problemy kończą się** automatycznie, gdy przez jakiś czas nie przychodzi nowa pułapka
  (domyślnie 30 minut), albo tylko ręcznie: strona monitora wyświetla otwarte pułapki z
  przyciskiem **Wyczyść** (do następnej pasującej pułapki). *Pułapki kończące* też kończą
  problemy, np. pułapka „stan usunięty” producenta.
- Pułapka, której **nie przyjmuje żaden monitor**, i tak jest zachowywana: u dzierżawcy zasobu z
  tym adresem, a w przeciwnym razie w zakresie globalnej infrastruktury. **Utwórz monitor** na
  stronie Pułapki wypełnia monitor dla jej urządzenia.
- Urządzenie zalewające pułapkami jest ograniczane (50 na sekundę, szczyty do 500); odrzucone
  pułapki są liczone na stronie Pułapki zakresu globalnego. Pułapki są przechowywane 30 dni
  (Ustawienia › Przechowywanie danych).

## Interfejsy sieciowe

Monitor **Interfejs sieciowy (SNMP)** obserwuje jeden port przełącznika, routera lub zapory.

- **Znajdź interfejsy…** (po podaniu hosta i dostępu SNMP lub wspólnych danych logowania)
  wyświetla interfejsy urządzenia z opisem, prędkością i stanem. Wybierz jeden albo, przy
  dodawaniu, zaznacz kilka: każdy staje się monitorem z ustawieniami formularza, nazwanym od
  interfejsu.
- Interfejs jest zapamiętywany po **nazwie** (lub opisie albo aliasie), a nie po numerze, bo
  niektóre urządzenia zmieniają numerację interfejsów po restarcie. Numer też działa.
- **Ruch** to różnica dwóch odczytów liczników 64-bitowych: pierwsze sprawdzenie czyta dwa razy w
  odstępie dwóch sekund; kolejne używają odczytu zachowanego z poprzedniego sprawdzenia. Po
  restarcie urządzenia para jest pomijana, więc nie ma fałszywego skoku. Urządzenia bez liczników
  64-bitowych (SNMP v1) używają 32-bitowych, które powyżej ok. 100 Mbit/s przy interwale jednej
  minuty nie są wiarygodne.
- **Stan**: łącze nieaktywne → Niedostępny; testing lub dormant → Zdegradowany; port wyłączony
  celowo jest Działa (lub Niedostępny, jeśli tak wybierzesz). Bardziej obciążony kierunek powyżej
  *Zdegradowany od wykorzystania* (domyślnie 80 %) → Zdegradowany, powyżej *Niedostępny od
  wykorzystania* (domyślnie wyłączone) → Niedostępny; błędy na minutę powyżej limitu →
  Zdegradowany. Jeśli urządzenie podaje złą prędkość (tunel, łącze z limitem przepustowości),
  ustaw *Prędkość łącza*.
- Strona monitora pokazuje ruch przychodzący i wychodzący z linią poziomu Zdegradowany.
- *Porównuj: jej zmianę na sekundę* w monitorze **SNMP** robi to samo dla dowolnego licznika
  (ramki na porcie SAN, sesje zapory, zdarzenia UPS).

## Temperatura centrum danych

**Temperatura** pokazuje każdy czujnik temperatury wlotowej, pogrupowany według tagu `room:<name>` i posortowany od najcieplejszego, z szafą (`rack:<name>`), bieżącą wartością, ostatnimi 6 godzinami, zmianą w ciągu 15 minut i zakresem z 24 godzin. **Dodaj czujniki** tworzy je dla listy adresów iLO (lub innych BMC Redfish) ze wspólnym kontem tylko do odczytu.

Czujnik staje się też zdegradowany, gdy jego temperatura **szybko rośnie** (domyślnie o 3 °C w ciągu 15 minut), nawet poniżej progów: to najwcześniejszy znak awarii chłodzenia. **Utwórz alarm pomieszczenia** dodaje monitor *Temperatura pomieszczenia*: niedostępny, gdy 3 czujniki są gorące, zdegradowany, gdy jeden jest gorący lub 2 szybko rosną. Otwiera incydenty jak każdy monitor, więc właściciele, dyżury i strony statusu działają także dla niego.
