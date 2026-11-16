# Rhythm

Een slaap- en ritmedagboek met handmatige registratie, energiecheck-ins, een gesproken dagboek en professionele exports. React/Vite-webapp met een gedeelde TypeScript-kern voor latere native integraties.

Vanaf 0.8.0: **Vandaag → Help me met vandaag** biedt gesprek, eigen bevestigd geheugen en versieerbare persoonlijke plannen. GPT-6 Luna werkt na expliciete toestemming via de server; Whisper en Gemma 4 E2B verwerken lokaal. Een voorstel vraagt jouw bevestiging. Offline schrijven en automatische accountsync blijven beschikbaar. Gebruik, kostenbegrenzing, broncontrole en retentie staan in [COACH.md](COACH.md).

## Starten

Node.js 24 is vereist. Installeer de pakketten en start de ontwikkelserver:

```powershell
npm.cmd ci
npm.cmd run dev
```

Op Windows bouwt **Start-Rhythm.cmd** de productieversie en opent deze op `http://127.0.0.1:5173`. **Start-Rhythm-Mobiel.cmd** biedt een tijdelijke HTTPS-preview met QR-code. Houd het startvenster open. Voor een langdurige pilot gebruik je één vast productieadres; de QR-link verandert bij een nieuwe tunnel.

## Eén account, ook offline

Rhythm 0.7.0 opent met één inlogscherm voor Supabase Auth. Na e-mailbevestiging en inloggen doorloop je een korte welkomstwizard: roepnaam, optionele geboortedatum, herkenbare slaapproblemen, doelen en eigen dagankers. Je begroeting en suggesties gebruiken dat profiel. Je kunt het later bij **Meer → Mijn account** aanpassen.

Er is één accountwachtwoord, geen apart kluiswachtwoord. Slaapblokken, energie, dagboek, profiel, begeleiding en instellingen synchroniseren automatisch naar Supabase. Opnamen die je expliciet bewaart gaan naar privéopslag. Auth, eigenaarspolicies en actieve-sessiecontrole beschermen de toegang; inhoud is voor de backend leesbaar en is **niet end-to-end versleuteld**. Een accountreset geeft toegang tot je opgeslagen accountgegevens.

Een bevestigde invoer wordt eerst duurzaam op het apparaat bewaard. Blijf ingelogd voor offline gebruik. Bij terugkeer van internet synchroniseert de geopende app automatisch; iOS garandeert geen synchronisatie terwijl een PWA gesloten is. De zichtbare status onderscheidt een lokale opslagactie van een bevestigde online opslagactie. Browseropslag wissen kan nog niet gesynchroniseerde invoer verwijderen.

Een revisiecontrole en samenvoeging per registratie bewaren onafhankelijke wijzigingen op meerdere apparaten. Tegenstrijdige wijzigingen stoppen met een melding; er wordt niets stilzwijgend overschreven. De laatste tien online versies en tien bewaarpunten bij herstel/conflict zijn toegankelijk onder **Herstel & oude registraties**. Opnamen van andere apparaten worden op aanvraag gedownload en blijven daarna offline beschikbaar.

Bij updates blijven bestaande kluizen intact. Via **Meer → Mijn account → Herstel & oude registraties** kun je oude lokale of online registraties eenmalig importeren met het oude kluiswachtwoord. De originele kluis wordt niet aangepast. Gebruik dezelfde origin en browseromgeving waar je eerder registreerde. Terughalen is alleen mogelijk als die oude kopie nog bestaat.

De project-URL en publishable key in de browserconfiguratie zijn openbaar bedoeld. Autorisatie wordt afgedwongen door Supabase Auth en database-RLS. Een ander project kan via `.env.local` worden ingesteld; zie `.env.example`. Gebruik nooit een secret- of service-role-sleutel in de webapp.

## Als PWA gebruiken

Open het vaste Rhythm-adres in Safari en kies **Deel → Zet op beginscherm**. Laat **Open als webapp** aan staan als die keuze verschijnt. Open daarna het appicoon voor een eigen venster zonder Safari-adresbalk. De eerste succesvolle laadbeurt is nodig voor offline gebruik. Werkelijke iPhone-installatie en opslagoverdracht vanuit Safari moeten op het toestel worden gecontroleerd.

## Wat werkt

- Naar bed gaan markeren, geschatte slaap bevestigen en meerdere slaapblokken per etmaal bijhouden.
- Wakkerperioden, inslaapcontext, correcties, splitsen en samenvoegen.
- Begeleide slaapregistratie → energie/slaperigheid → optioneel dagboek.
- 7/14/30/90-daags actogram, 24-uurtotaal, dagankers en inzicht in registratiedekking.
- Tekst/audio, optionele lokale Whisper-transcriptie en Gemma-samenvatting. Voorstellen eerst controleren; modellen downloaden alleen na een eigen keuze bij Meer of bij de dagboekinvoer.
- Eén account, hervatbare welkomstwizard, persoonlijke begroeting, automatische synchronisatie en versleutelde offline apparaatkopie.
- CSV, JSON en afdrukbaar rapport/PDF. Vrije notities, profiel en persoonlijke context zijn standaard uitgesloten van JSON. Expliciet opnemen voegt deze en reeds gedownloade audio toe; uitsluitend online beschikbare opnamen staan als verwijzing in de export.
- Donker/licht thema, grotere mobiele tekst, rustige animaties en verminderde beweging.

Whisper gebruikt vanaf 0.7.1 het meertalige Base-model met vaste Nederlandse transcriptie, ruimere uitvoerlengte en overlappende audiostukken. Laad Whisper na herladen opnieuw om de nieuwe modelbestanden te downloaden. Transcripties blijven concepten die je controleert. De expliciete `npm.cmd run test:whisper:nl -- --label=current --long --check` downloadt enkele openbare Nederlandse FLEURS-testopnamen en verwerkt die lokaal; de kleine proef vervangt geen test op de eigen iPhone.

## Hosting

De repository bevat `vercel.json` voor Vercel. Importeer de repository met de repositoryroot als Root Directory; het buildcommando en de outputmap staan al ingesteld. Zie **[DEPLOYMENT.md](DEPLOYMENT.md)** voor Supabase, e-mailredirects en verificatie vóór de pilot.

## Verifiëren

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:cloud
npm.cmd run test:pwa
npm.cmd run test:mobile
```

De cloudbrowsertest gebruikt HTTP-fixtures met de echte Supabase JS-client en verstuurt geen e-mails. `npm.cmd run test:account` voegt lokale Postgres/RLS-validatie toe. `tests/rls-account.sql` toetst de echte database met synthetische fixtures in een volledige rollback. `node tests/account-data-browser.mjs` controleert oude kluizen, audio en herstelpunten. Browsercontroles vragen de lokale previewserver.

Voor de volledige browserregressie start je in een eerste terminal:

```powershell
npm.cmd run preview -- --port 4173 --strictPort
```

En in een tweede terminal:

```powershell
$env:RHYTHM_TEST_URL = 'http://127.0.0.1:4173'
npm.cmd run test:browser
npm.cmd run test:flow
npm.cmd run test:visual
```

Browsercontroles gebruiken Microsoft Edge via Playwright. Voor de echte modelketen is afzonderlijk `npm.cmd run test:ai` beschikbaar; dit downloadt grote modelgewichten na de testkeuze. Resultaten en testprofielen staan alleen in de genegeerde map `test-results/`.

## Beveiliging

De webapp staat op [rhythm-rho-bice.vercel.app](https://rhythm-rho-bice.vercel.app/). Controleer de geleverde versie na iedere deployment. Routineherinneringen zijn afzonderlijke opt-in; de Supabase-backend is geactiveerd en technisch gecontroleerd. Echte Auth-mail en bezorging op iPhone blijven te valideren. Zie [REMINDERS.md](REMINDERS.md) voor werking, privacy en verificatie.

Lees [SECURITY.md](SECURITY.md) voor auditcommando's, sessiecontrole, offline apparaatopslag, PKCE en de controles voor het echte productieadres. Een geslaagde scan geeft geen garantie van 100% veiligheid.

## Grenzen en documentatie

Native iPhone-alarmen, HealthKit/Watch, automatisch samenvoegen van conflicten, algemene bestandsimport en accountverwijdering vanuit de app zijn nog niet beschikbaar. De bestaande handvatten zijn beschrijvend en geen behandeling of diagnose. De backend regelt geen continue monitoring door een professional.

`docs/` is de privékennisbank van de lokale werkruimte en wordt bewust niet naar deze openbare repository of Vercel gestuurd. Bewaar deze map afzonderlijk bij een verhuizing van de ontwikkelomgeving. Alleen appcode, technische instructies en synthetische tests worden gepubliceerd.
