<!-- translation-of: configuration-as-code.md#63b52fa4 -->
# Konfiguracja jako kod

**Konfiguracja** eksportuje bieżący zakres (zasoby, monitory, aplikacje i ich zależności) jako YAML i
importuje go z powrotem. Przechowuj go w git, kopiuj konfigurację jednego dzierżawcy do innego lub
automatyzuj ją przez API.

```yaml
assets:
  - name: FIN-APPLIANCE-01
    kind: other
    dependsOn: [Core-SW-01]          # shared assets are referenced by name
monitors:
  - name: ERP web
    type: http
    config: { url: https://erp.corp.local/health, acceptedStatus: 200-299 }
    asset: FIN-APPLIANCE-01          # the asset this monitor checks
    tags: [prod]
applications:
  - name: ERP Production
    criticality: high
    slaTarget: 99.9
    members: [ERP web, { monitor: ERP SQL, required: false }]
    notify: [ERP team]               # notification channels, by name
```

## Jak działa import

- **Najpierw podgląd**: pokazuje pole po polu, co zostanie utworzone lub zmienione, i zgłasza błędy z
  numerem wiersza. **Zastosuj** działa w całości albo wcale.
- **Pliki częściowe są bezpieczne**: element w pliku określa ten element; elementy spoza pliku
  pozostają bez zmian.
- **Nie obejmuje**: kanałów powiadomień i danych logowania (zawierają sekrety) oraz okien
  konserwacji. Zaimportowane monitory push dostają nowe adresy URL. Aplikacje wskazują swoje kanały z
  nazwy w `notify`; bez `notify` aplikacja zachowuje obecne kanały.
- **Wspólne dane logowania**: monitor wskazuje używane dane z nazwy (`credential: iLO read-only`).
  Same dane logowania nie są eksportowane i muszą już istnieć w zakresie docelowym.

## Przez API

```bash
curl -fsS -X POST https://fudo.corp.local/api/config/import \
  -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" \
  -H "Content-Type: application/json" -d '{"yaml": "…", "dryRun": true}'
```

Wymaga tokenu API z uprawnieniem **Zarządzanie** (zobacz [Użytkownicy i dostęp](users-and-access.md)).

## Import z Uptime Kuma

**Konfiguracja › Import z Uptime Kuma** odczytuje kopię JSON z Uptime Kuma 1.x (*Ustawienia › Kopia zapasowa › Eksportuj*) lub plik bazy danych `kuma.db` z wersji 1.x i 2.x (w folderze danych Kumy). Najpierw widzisz podgląd; nic się nie zmienia przed importem.

Sprawdzenia HTTP, słowa kluczowego i prostego JSON, portu TCP, ping, DNS i push są importowane z interwałami, ponowieniami, tagami i stanem wstrzymania; wygasanie certyfikatów HTTPS staje się osobnym monitorem certyfikatu, a grupy stają się aplikacjami. Powiadomienia stają się kanałami z tymi samymi ustawieniami (e-mailowe używają serwera poczty z Ustawień) i startują wyłączone, chyba że wybierzesz inaczej. Elementy, których nazwa już istnieje, pozostają nietknięte, więc ponowny import jest bezpieczny. Wszystko, czego nie da się wiernie zaimportować (np. monitory Docker lub baz danych albo tryb odwrócony), jest wymienione z przyczyną.
