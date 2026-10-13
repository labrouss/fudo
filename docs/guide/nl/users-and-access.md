<!-- translation-of: users-and-access.md#c2bf850f -->
# Gebruikers en toegang

## Rollen

| Rol | Waar | Mag |
|---|---|---|
| **Superadmin** | overal | alles, inclusief gebruikers, tenants en instellingen |
| **Infrastructuurbeheerder** | bereik Globale infrastructuur (en elke tenant) | gedeelde infrastructuur beheren, en de gegevens van alle tenants |
| **Tenantbeheerder** | één tenant | de tenant beheren: monitors, assets, applicaties, kanalen, rapporten, API-tokens |
| **Operator** | één tenant | alles zien; monitors pauzeren, hervatten en testen, incidenten bevestigen, dempen en oplossen, notities toevoegen |
| **Lezer** | één tenant | alles zien, niets wijzigen |

Een gebruiker kan in elke tenant een andere rol hebben. Superadmins beheren gebruikers en tenants
onder **Beheer**.

## Uitnodigingen en aanmelden

**Beheer › Gebruikers › Gebruiker uitnodigen**: naam, e-mail, de **taal** van de gebruiker (voor de
uitnodigingsmail en de eerste aanmelding) en de rollen. Hij krijgt een eenmalige link (72 uur geldig)
om een wachtwoord te kiezen en **tweestapsverificatie** in te stellen, die verplicht is. Is er geen
e-mail ingesteld, kopieer dan de link uit het venster en stuur hem zelf.

Telefoon kwijt? Meld u aan met een van de **herstelcodes**. Een beheerder kan in het venster van de
gebruiker ook **2FA opnieuw instellen** (het wachtwoord blijft) of **Wachtwoord en 2FA opnieuw
instellen**; de gebruiker krijgt een nieuwe link.

Accounts worden 15 minuten geblokkeerd na 5 mislukte pogingen met wachtwoord of code.

## Gebruikers deactiveren en verwijderen

**Deactiveren** blokkeert het aanmelden direct en bewaart het account. **Gebruiker verwijderen**
verwijdert het account met zijn sessies, rollen en 2FA; incidenten, notities en het auditlogboek
behouden hun geschiedenis (getoond als *name@example (verwijderd)*). U kunt uzelf en de laatste
actieve superadmin niet verwijderen.

## API-tokens

**API-toegang** (tenantbeheerders per tenant, infrastructuurbeheerders in het bereik Globale
infrastructuur) maakt tokens met één machtiging:

| Machtiging | Staat toe |
|---|---|
| **Lezen** | monitors, incidenten en rapporten bekijken |
| **Bedienen** | ook pauzeren/hervatten, bevestigen, notities, tests |
| **Beheren** | ook maken, wijzigen en verwijderen |

Een token werkt alleen in zijn bereik, kan verlopen, kan worden ingetrokken en kan nooit gebruikers,
tenants, instellingen of andere tokens beheren. Het wordt één keer getoond; alleen een hash wordt
opgeslagen.

```bash
curl -H "Authorization: Bearer fudo_…" -H "X-Fudo-Tenant: <tenant id>" https://fudo.corp.local/api/incidents
```

De API-documentatie is ingebouwd op **/api/docs** (werkt ook offline); de machineleesbare
specificatie staat op `/api/openapi.json`.

## Auditlogboek

**Beheer › Auditlogboek** legt aanmeldingen en mislukte pogingen vast, blokkeringen, uitnodigingen
en elke wijziging aan gebruikers, tenants en instellingen, met de waarden ervoor en erna.

## Uw profiel

Onder **Profiel** (onderaan de zijbalk) wijzigt u uw naam en wachtwoord, zet u de
tweestapsverificatie over op een nieuwe telefoon (de oude werkt tot u de nieuwe bevestigt), krijgt u
nieuwe herstelcodes, en ziet u uw sessies om de andere af te melden. Een nieuw wachtwoord of een
nieuwe telefoon meldt uw andere sessies af.

De tabbladen: **Uw gegevens**, **Wachtwoord**, **Tweestapsverificatie**, **Sessies** en **Dienst** (uw diensten, contactmethoden en meldingsstappen). Het adres onthoudt het geopende tabblad, bijvoorbeeld `/profile#sessions`.

**Contactmethoden** zijn hoe Fudo u persoonlijk bereikt, bijvoorbeeld als u dienst hebt: e-mail, een
Microsoft Teams-workflow die in uw chat post, of Telegram (zodra een beheerder onder *Instellingen*
een Telegram-bot koppelt). Elke methode wordt eerst met een code van 6 cijfers bevestigd. **Uw
meldingsstappen** bepalen welke methoden wanneer worden gebruikt, bijvoorbeeld direct e-mail en na 5
minuten Telegram, tot het incident is bevestigd.

## Teams en eigenaarschap

**Teams** brengt de verantwoordelijken voor applicaties en infrastructuur samen, bijvoorbeeld een
*Databaseteam* in een tenant of een *Opslagteam* in het bereik Globale infrastructuur. Iedereen is
**lid** of **teamleider**; alleen mensen met toegang tot het bereik van het team kunnen worden
toegevoegd.

Kies het **eigenaarsteam** op de pagina van een applicatie of asset. Elk incident toont dan de
eigenaar en teamleiders, ook incidenten van monitors (via hun asset of applicatie), en zo ook de
rapporten na incidenten. Onderdelen van een tenant horen bij teams van die tenant, gedeelde
infrastructuur bij globale teams. Diensten worden per team ingesteld.
