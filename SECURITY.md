# Beveiliging van Rhythm

Deze repository bevat een prototype. Er wordt geen garantie gegeven dat de applicatie vrij is van alle kwetsbaarheden. Een geslaagde dependency-scan is geen volledige pentest of goedkeuring voor productiegebruik.

## Huidige beveiligingsbasis

- Lokaal versleutelde kluis met AES-GCM. Envelopversie 2 gebruikt PBKDF2-HMAC-SHA256 met 600.000 iteraties, een willekeurige salt en IV en geauthenticeerde versiecontext. Versie 1 blijft leesbaar en wordt na succesvol ontgrendelen opgewaardeerd. Nieuwe kluiswachtwoorden vragen minimaal 12 tekens; kies een lange, unieke wachtwoordzin.
- Supabase Auth staat los van de kluissleutel. De app gebruikt PKCE voor e-mailcallbacks. Accountherstel herstelt geen vergeten kluiswachtwoord. Open een herstellink in dezelfde browsercontext waarin die is aangevraagd; controleer dit afzonderlijk voor de iPhone-PWA.
- Inhoud wordt vóór upload versleuteld; audio blijft lokaal. RLS beperkt toegang tot de eigenaar met een nog actieve Auth-sessie. Intrekken van de sessie blokkeert ook een nog niet verlopen toegangstoken op de kluistabel.
- Revisie én wijzigings-id beschermen tegen oude apparaatversies. Upload stopt bij conflicten en bij intrekken van synchronisatie. Een onderbroken herstelactie kan geen oude lokale kopie stilzwijgend over de cloudkopie zetten.
- De kluis vergrendelt na 5 minuten zonder bediening of 1 minuut op de achtergrond. Niet opgeslagen concepten worden dan gesloten; sla notities tussendoor op. Accountwissels wissen wachtwoordvelden en vergrendelen inhoud.
- Productieheaders beperken scripts, verbindingen, frames en browserrechten. Inline JavaScript en algemene `unsafe-eval` zijn verboden. WebAssembly blijft toegestaan voor lokale AI. Inline CSS is nodig voor de bestaande React-grafieken; dit is geen volledig scriptloos of netwerkloos ontwerp.
- Een productiebuild weigert een secret-/service-role-/legacy-JWT-sleutel in de publieke clientconfiguratie. Een afwijkende Supabase-origin moet expliciet in de CSP-allowlist staan.

## Verifiëren

```powershell
npm.cmd run security:deps
npm.cmd test
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:cloud
npm.cmd run test:pwa
```

Vercel draait de dependency-gate vóór de build en stopt bij bekende advisories vanaf niveau low. Dit gebruikt de op dat moment beschikbare npm-advisorydatabase; onbekende of nog niet gemelde problemen worden daarmee niet uitgesloten.

`tests/rls-vault.sql` controleert echte database-isolatie, ingetrokken/verlopen sessies, revisies en envelopvalidatie met fixtures die volledig worden teruggedraaid. De cloudbrowsertest gebruikt de echte SDK met HTTP-fixtures en verstuurt geen echte e-mails. De beveiligingsbrowsertest controleert onder meer afgedwongen CSP, ontsnappen van HTML-inhoud, offline opslag en vergrendeling.

## Voor persoonlijk gebruik op een gehost adres

De optionele pushbackend van 0.6.0 is geactiveerd en staat beschreven in [REMINDERS.md](REMINDERS.md). Hosted RLS/sessies, negatieve HTTP-toegang en eenmalige scheduler-tickets zijn getest; fysieke bezorging blijft te controleren. Door de platformrechten van pg_net worden geen blijvende secrets in die wachtrij gezet. De laatste hercontrole van het bestaande Supabase-project meldde dat leaked-password protection uit staat; beoordeel die instelling vóór persoonlijk cloudgebruik. De provider biedt deze functie op Pro en hoger; er wordt geen betaald plan automatisch aangezet.

Verifieer eerst de daadwerkelijk geleverde HTTPS-/securityheaders, exacte Auth-redirects, echte e-mailbevestiging en wachtwoordherstel, server-side wachtwoord-/misbruikinstellingen en de iPhone-beginschermcontext. Een lokale headlesstest bewijst dat niet. Zie [DEPLOYMENT.md](DEPLOYMENT.md). Test een eerste preview met synthetische gegevens.

De volledige lokale `docs/`-vault, sleutels, certificaten, `.env`-bestanden en testprofielen worden niet gepubliceerd. Verstuur bij een bugmelding geen wachtwoorden, tokens, opnamen of gezondheidslogs. Meld gevoelige problemen via een privé-kanaal van de repositorybeheerder, niet in een openbare issue.
