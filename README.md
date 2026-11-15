# Rhythm

Een slaap- en ritmedagboek met handmatige registratie, energiecheck-ins, een gesproken dagboek en professionele exports. React/Vite-webapp met een gedeelde TypeScript-kern voor latere native integraties.

## Starten

Node.js 24 is vereist. Installeer de pakketten en start de ontwikkelserver:

```powershell
npm.cmd ci
npm.cmd run dev
```

Op Windows bouwt **Start-Rhythm.cmd** de productieversie en opent deze op `http://127.0.0.1:5173`. **Start-Rhythm-Mobiel.cmd** biedt een tijdelijke HTTPS-preview met QR-code. Houd het startvenster open. Voor een langdurige pilot gebruik je één vast productieadres; de QR-link verandert bij een nieuwe tunnel.

## Accounts en versleutelde synchronisatie

Open **Meer → Account & synchronisatie**. Supabase Auth verzorgt registreren, e-mailbevestiging, inloggen, accountherstel en uitloggen. Je kunt ook zonder account lokaal loggen.

Je **kluiswachtwoord** is apart van je **accountwachtwoord**. Kies verschillende wachtwoorden en bewaar het kluiswachtwoord goed: een accountreset kan je versleutelde inhoud niet ontsleutelen.

1. Maak of ontgrendel een lokaal dagboek.
2. Maak een account, bevestig je e-mail en log in.
3. Ontgrendel je lokale dagboek en kies expliciet voor synchronisatie.
4. Op een ander apparaat: log in en kies **Cloudkopie ophalen op dit apparaat**, met hetzelfde kluiswachtwoord.

Slaapblokken, wakkerregistraties, energie/slaperigheid, tekstnotities en dagankers worden op het apparaat versleuteld vóór upload. Audio blijft lokaal. Na lokale wijzigingen, terugkomst in de app of opnieuw verbinden probeert de geopende app te synchroniseren. Vergrendeld of uitgelogd wordt geen nieuwe inhoud versleuteld voor upload.

Deze eerste integratie synchroniseert één versleutelde momentopname per account. Een revisiecontrole voorkomt dat gelijktijdige wijzigingen stilzwijgend over elkaar heen worden geschreven. Bij een conflict blijven beide kopieën behouden; exporteer je lokale wijzigingen voordat je een cloudkopie ophaalt. Automatisch samenvoegen is nog niet beschikbaar. Synchronisatie vervangt geen afzonderlijke back-up.

De project-URL en publishable key in de browserconfiguratie zijn openbaar bedoeld. Autorisatie wordt afgedwongen door Supabase Auth en database-RLS. Een ander project kan via `.env.local` worden ingesteld; zie `.env.example`. Gebruik nooit een secret- of service-role-sleutel in de webapp.

## Als PWA gebruiken

Open het vaste Rhythm-adres in Safari en kies **Deel → Zet op beginscherm**. Laat **Open als webapp** aan staan als die keuze verschijnt. Open daarna het appicoon voor een eigen venster zonder Safari-adresbalk. De eerste succesvolle laadbeurt is nodig voor offline gebruik. Werkelijke iPhone-installatie en opslagoverdracht vanuit Safari moeten op het toestel worden gecontroleerd.

## Wat werkt

- Naar bed gaan markeren, geschatte slaap bevestigen en meerdere slaapblokken per etmaal bijhouden.
- Wakkerperioden, inslaapcontext, correcties, splitsen en samenvoegen.
- Begeleide slaapregistratie → energie/slaperigheid → optioneel dagboek.
- 7/14/30/90-daags actogram, 24-uurtotaal, dagankers en inzicht in registratiedekking.
- Tekst/audio, optionele lokale Whisper-transcriptie en Gemma-samenvatting. Voorstellen eerst controleren; modellen downloaden alleen na een eigen keuze bij Meer of bij de dagboekinvoer.
- AES-GCM-browserkluis, optionele versleutelde cloudsynchronisatie en apart demogeheugen.
- CSV, JSON en afdrukbaar rapport/PDF. Vrije notities zijn standaard uitgesloten van exports. Voor een volledige eigen export kies je expliciet dagboeknotities mee te nemen; bewaarde audio gaat dan mee in JSON.
- Donker/licht thema, grotere mobiele tekst, rustige animaties en verminderde beweging.

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

De cloudbrowsertest gebruikt HTTP-fixtures met de echte Supabase JS-client en verstuurt geen e-mails. `tests/rls-vault.sql` controleert de echte database-isolatie met tijdelijke fixtures die volledig worden teruggedraaid.

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

## Grenzen en documentatie

Native iPhone-alarmen, HealthKit/Watch, automatisch samenvoegen van conflicten, algemene bestandsimport en accountverwijdering vanuit de app zijn nog niet beschikbaar. De bestaande handvatten zijn beschrijvend en geen behandeling of diagnose. De backend regelt geen continue monitoring door een professional.

`docs/` is de privékennisbank van de lokale werkruimte en wordt bewust niet naar deze openbare repository of Vercel gestuurd. Bewaar deze map afzonderlijk bij een verhuizing van de ontwikkelomgeving. Alleen appcode, technische instructies en synthetische tests worden gepubliceerd.
