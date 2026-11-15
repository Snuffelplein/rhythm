# Rhythm — Vercel en Supabase

## Huidige configuratie

- Frontend: React/Vite PWA, Node.js 24, npm workspaces.
- Vercel: repositoryroot als Root Directory, `npm ci`, `npm run build`, output `apps/prototype-web/dist`.
- Supabase Auth: e-mail/wachtwoord met e-mailbevestiging. Lokaal gebruik blijft mogelijk zonder account.
- Database: `encrypted_vaults`, één versleutelde momentopname per gebruiker, met eigenaars-RLS en revisiecontrole.
- De browser bevat uitsluitend publieke projectconfiguratie. Geen secret/service-role key nodig voor de webapp.

## Publiceren op Vercel

1. Importeer `Snuffelplein/rhythm` in Vercel. Laat Root Directory op de repositoryroot staan; selecteer niet alleen de app-submap, omdat de gedeelde packages nodig zijn.
2. De instellingen komen uit `vercel.json`. Gebruik Node.js 24 en kies één vast productieadres voor persoonlijke registraties.
3. De bestaande project-URL en publishable key zijn als publieke defaults geconfigureerd. Om een ander Supabase-project te gebruiken stel je `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY` in en bouw je opnieuw. Nooit een `service_role` of secret key in een `VITE_` variabele zetten.
4. Voeg in **Supabase → Authentication → URL Configuration** het exacte productieadres toe als **Site URL** en toegestane **Redirect URL**. Voeg ontwikkeladressen alleen afzonderlijk toe als je daar e-mailflows test. Gebruik geen algemene wildcard naar willekeurige previewdeployments.
5. Controleer de e-mailprovider/SMTP-configuratie. Standaard Supabase-mail is beperkt; een echte pilot vraagt gecontroleerde aflevering van bevestigings- en herstelmails. E-mailbevestiging is niet uitgezet om tests makkelijker te maken.
6. Test op de productieorigin: account maken, ontvangen bevestiging, login, wachtwoordherstel, kluis maken/ontgrendelen, expliciete synchronisatie, tweede apparaat en offline terugkomst.
7. Voeg juist dit vaste adres op iPhone toe via **Safari → Deel → Zet op beginscherm**, met **Open als webapp** ingeschakeld wanneer zichtbaar.

Een Git-push is geen bewijs van een Vercel-deployment. Controleer de door Vercel teruggegeven productie-URL en bouwstatus. Preview- en productieadressen hebben aparte browseropslag; ga niet uit van automatische overdracht van lokale logs.

## Databasemigraties

De SQL onder `supabase/migrations/` beschrijft de geïmplementeerde schemawijzigingen. Op het opgegeven Rhythm-project zijn de migraties al toegepast; voer ze niet opnieuw handmatig uit. Bij een nieuw project volg je de migratiegeschiedenis met de vastgezette Supabase CLI.

De beveiliging bestaat uit expliciete tabelrechten, vier RLS-policies op `auth.uid() = user_id`, uitsluiten van anonieme accounts en controle van de revisie en versleutelde envelop. Er wordt geen `SECURITY DEFINER` app-RPC gebruikt. De administratieve bootstrap-eventtrigger heeft geen publieke uitvoerrechten.

`tests/rls-vault.sql` is een vertrouwde SQL-test, geen browserrequest. De test maakt tijdelijke synthetische Auth-fixtures binnen een transactie, simuleert JWT-rollen, controleert isolatie en draait alles terug. Voer dit alleen uit via een vertrouwde databaseverbinding.

## Versleuteling en herstel

Het kluiswachtwoord leidt lokaal een AES-GCM-sleutel af. De backend krijgt salt, IV, ciphertext en revisiemetadata, geen leesbare dagboekinhoud of kluiswachtwoord. De server verwerkt wel je accountgegevens en verbindingsmetadata. Audio wordt niet gesynchroniseerd.

Een accountreset herstelt geen vergeten kluiswachtwoord. Bewaar het kluiswachtwoord zelf. Een recente cloudkopie kan met dit wachtwoord op een ander apparaat worden opgehaald. Conflicten stoppen de upload; er is geen automatische samenvoeging. Exporteer eventuele lokale wijzigingen voordat je de lokale kluis door een cloudkopie vervangt. De limiet voor één ciphertext is circa 2 miljoen base64tekens; grote archieven vragen later een andere opslagopzet.

Cloudkopie verwijderen stopt synchronisatie op dit apparaat en laat de lokale kluis staan. Een ander nog gekoppeld apparaat kan later opnieuw uploaden. Lokale gegevens verwijderen verwijdert de cloudkopie niet. Accountverwijdering vanuit de app is nog een vervolgstap.

## Wat de tests bewijzen

- Unit-/integratietests: echte browsercryptografie, geen leesbare inhoud of audio in de cloudkopie, offline hervatten, idempotente herhaling, conflicten, accountbinding en race-/tabcontroles.
- Cloudbrowser: echte Supabase JS-client met gecontroleerde HTTP-fixtures voor registratie, login/logout, opt-in, accountisolatie en herstel op een tweede apparaat. Geen echte e-mail verzonden.
- Echt Supabase-project: Auth-instellingen en publieke bereikbaarheid gecontroleerd; RLS-/revisietests met teruggedraaide fixtures en Security Advisor uitgevoerd. Dit vervangt geen echte e-mail-/toesteltest op het productieadres.
- Bestaande browser-/PWA-tests controleren lokale en offline flows. Nederlandse modelkwaliteit en geheugen/accu op fysieke iPhones blijven afzonderlijke validatie.

## Privébestanden en afhankelijkheden

`.gitignore` en `.vercelignore` sluiten de volledige lokale `docs/`-vault, certificaten, `.env`-bestanden en testprofielen uit. Persoonlijke logs worden niet als repositorybestand opgeslagen. De publieke deploy bevat uitsluitend de gebouwde app.

Bij dependencycontrole zijn bestaande Node-only `sharp`-advisories via Transformers.js gevonden. De statische frontend gebruikt geen server-side beeldverwerking en bundelt deze Node-adapter niet. Een major-upgrade van Transformers.js valt buiten deze Auth-integratie en moet samen met de echte Whisper-keten worden gevalideerd. Zie de [sharp-advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). Er is geen `npm audit fix --force` uitgevoerd.
