<!-- translation-of: getting-started.md#ea57bfb7 -->
# Aan de slag

Fudo laat zien of uw bedrijfsapplicaties werken, **waarom** ze zijn uitgevallen en wat vergelijkbare
problemen eerder heeft opgelost. Deze pagina brengt u van een nieuwe installatie tot uw eerste
melding.

## 1. Eerste aanmelding

Open Fudo na de installatie (zie [Installatie](../../admin/installation.md)) in de browser. De
**installatiewizard** vraagt om:

1. de naam van uw organisatie,
2. de eerste beheerder (naam, e-mail, wachtwoord van minstens 12 tekens),
3. tweestapsverificatie: scan de QR-code met een authenticator-app (Microsoft Authenticator,
   Google Authenticator, 1Password, …) en **bewaar de herstelcodes**,
4. eventueel de e-mailserver (SMTP), voor uitnodigingen, meldingen en rapporten. U kunt die ook
   later instellen onder **Instellingen**.

Tweestapsverificatie is verplicht voor elk account.

## 2. Een tenant aanmaken

Een **tenant** is een bedrijfsonderdeel, bijvoorbeeld *Financiën* of *HR*. De applicaties, monitors
en meldingskanalen ervan staan los van die van andere tenants. Ga naar **Beheer › Tenants › Nieuwe
tenant** en kies hem daarna in de keuzelijst bovenaan de zijbalk.

Gedeelde infrastructuur (core-switches, opslagsystemen, clusters) hoort in plaats daarvan bij het
bereik **Globale infrastructuur**; zie [Concepten](concepts.md).

## 3. Een monitor toevoegen

**Monitors › Monitor toevoegen**, kies een type (bijvoorbeeld *HTTP(S)* of *Ping*), vul het doel in
en klik op **Nu testen** om de controle één keer uit te voeren zonder op te slaan. Sla hem op;
resultaten verschijnen binnen één controle-interval. Voor veel hosts tegelijk gebruikt u **Bulk
toevoegen / sjablonen**; zie [Monitors](monitors.md).

## 4. Monitors groeperen in een applicatie

**Applicaties › Nieuwe applicatie** en voeg de monitors toe waaruit de dienst bestaat (webfrontend,
API, database). De status van de applicatie laat zien of de dienst werkt, en zo niet, waarom. Stel
een **SLA-doel** in om haar in rapporten te volgen.

## 5. Meldingen ontvangen

**Meldingen › Kanaal toevoegen**: e-mail, Microsoft Teams, Slack, een JSON-webhook of een van meer
dan 100 andere (Telegram, PagerDuty, sms-gateways, …). **Test versturen** controleert het kanaal.
Zie [Meldingen](notifications.md).

## 6. Collega's uitnodigen

**Beheer › Gebruikers › Gebruiker uitnodigen**: kies hun taal en hun rol per tenant. Ze krijgen een
eenmalige link om een wachtwoord te kiezen en tweestapsverificatie in te stellen. Zie
[Gebruikers en toegang](users-and-access.md).

## Verder

- [Concepten](concepts.md): bereiken, assets, afhankelijkheden en hoe Fudo de hoofdoorzaak vindt
- [Incidenten](incidents.md): wat er gebeurt als er iets uitvalt
- [Problemen oplossen](troubleshooting.md): veelgestelde vragen
