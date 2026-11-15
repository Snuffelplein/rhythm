# Rhythm — Vercel en Supabase

## Huidige configuratie

- Frontend: React/Vite PWA, Node.js 24, npm workspaces.
- Vercel: repositoryroot als Root Directory, `npm ci`, dependency-gate en `npm run build`, output `apps/prototype-web/dist`.
- Supabase Auth: e-mail/wachtwoord met e-mailbevestiging. Lokaal gebruik blijft mogelijk zonder account.
- Database: `encrypted_vaults`, één versleutelde momentopname per gebruiker, met eigenaars-/sessie-RLS en controle van revisie plus wijzigings-id.
- De browser bevat uitsluitend publieke projectconfiguratie. Geen secret/service-role key nodig voor de webapp.

## Publiceren op Vercel

Rond vóór persoonlijk gebruik de voorwaarden in [SECURITY.md](SECURITY.md) af. Gebruik de eerste gecontroleerde preview uitsluitend met synthetische gegevens; de lokale testresultaten bewijzen de uiteindelijke hosting- en Auth-configuratie niet.

1. Importeer `Snuffelplein/rhythm` in Vercel. Laat Root Directory op de repositoryroot staan; selecteer niet alleen de app-submap, omdat de gedeelde packages nodig zijn.
2. De instellingen komen uit `vercel.json`. Gebruik Node.js 24 en kies één vast productieadres voor persoonlijke registraties.
3. De bestaande project-URL en publishable key zijn als publieke defaults geconfigureerd. Om een ander Supabase-project te gebruiken stel je `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY` in en bouw je opnieuw. Nooit een `service_role` of secret key in een `VITE_` variabele zetten.
4. Voeg in **Supabase → Authentication → URL Configuration** het exacte productieadres toe als **Site URL** en toegestane **Redirect URL**. Voeg ontwikkeladressen alleen afzonderlijk toe als je daar e-mailflows test. Gebruik geen algemene wildcard naar willekeurige previewdeployments.
5. Controleer de e-mailprovider/SMTP-configuratie, server-side wachtwoordbeleid en misbruikbeperking (rate limits/CAPTCHA-keuze). Deze admininstellingen zijn niet volledig geverifieerd. Standaard Supabase-mail is beperkt; een echte pilot vraagt gecontroleerde aflevering van bevestigings- en herstelmails. E-mailbevestiging is niet uitgezet om tests makkelijker te maken.
6. Test op de productieorigin: account maken, ontvangen bevestiging, login, wachtwoordherstel, kluis maken/ontgrendelen, expliciete synchronisatie, tweede apparaat en offline terugkomst.
7. Voeg juist dit vaste adres op iPhone toe via **Safari → Deel → Zet op beginscherm**, met **Open als webapp** ingeschakeld wanneer zichtbaar.

Een Git-push is geen bewijs van een Vercel-deployment. Controleer de door Vercel teruggegeven productie-URL en bouwstatus. Preview- en productieadressen hebben aparte browseropslag; ga niet uit van automatische overdracht van lokale logs.

## Databasemigraties

De SQL onder `supabase/migrations/` beschrijft de geïmplementeerde schemawijzigingen. Op het opgegeven Rhythm-project zijn de migraties al toegepast; voer ze niet opnieuw handmatig uit. Bij een nieuw project volg je de migratiegeschiedenis met de vastgezette Supabase CLI.

De beveiliging bestaat uit expliciete tabelrechten, vier RLS-policies op `auth.uid() = user_id`, uitsluiten van anonieme accounts en controle van de revisie en versleutelde envelop. Er is geen publieke geprivilegieerde app-RPC. Een afgeschermde functie in `rhythm_private` controleert uitsluitend of de eigen Auth-sessie nog bestaat en niet verlopen is; deze heeft daarvoor een vast leeg search_path en beperkte EXECUTE-rechten. De administratieve bootstrap-eventtrigger heeft geen publieke uitvoerrechten.

`tests/rls-vault.sql` is een vertrouwde SQL-test, geen browserrequest. De test maakt tijdelijke synthetische Auth-fixtures binnen een transactie, simuleert JWT-rollen, controleert isolatie en draait alles terug. Voer dit alleen uit via een vertrouwde databaseverbinding.

## Versleuteling en herstel

Het kluiswachtwoord leidt lokaal een AES-GCM-sleutel af. De backend krijgt salt, IV, ciphertext en revisiemetadata, geen leesbare dagboekinhoud of kluiswachtwoord. De server verwerkt wel je accountgegevens en verbindingsmetadata. Audio wordt niet gesynchroniseerd.

PKCE vereist dat de e-mailcallback in dezelfde browsercontext wordt geopend als de aanvraag. Verifieer dit ook vanuit de iPhone-PWA; ga niet uit van gedeelde Safari-/PWA-opslag. Een accountreset herstelt geen vergeten kluiswachtwoord. Bewaar het kluiswachtwoord zelf. Een recente cloudkopie kan met dit wachtwoord op een ander apparaat worden opgehaald. Conflicten stoppen de upload; er is geen automatische samenvoeging. Exporteer eventuele lokale wijzigingen voordat je de lokale kluis door een cloudkopie vervangt. De limiet voor één ciphertext is circa 2 miljoen base64tekens; grote archieven vragen later een andere opslagopzet.

Cloudkopie verwijderen stopt synchronisatie op dit apparaat en laat de lokale kluis staan. Een ander nog gekoppeld apparaat kan later opnieuw uploaden. Lokale gegevens verwijderen verwijdert de cloudkopie niet. Accountverwijdering vanuit de app is nog een vervolgstap.

## Wat de tests bewijzen

- Unit-/integratietests: echte browsercryptografie, geen leesbare inhoud of audio in de cloudkopie, offline hervatten, idempotente herhaling, conflicten, accountbinding en race-/tabcontroles.
- Cloudbrowser: echte Supabase JS-client met gecontroleerde HTTP-fixtures voor registratie, login/logout, opt-in, accountisolatie en herstel op een tweede apparaat. Geen echte e-mail verzonden.
- Echt Supabase-project: Auth-instellingen en publieke bereikbaarheid gecontroleerd; RLS-/revisietests met teruggedraaide fixtures en Security Advisor uitgevoerd. Dit vervangt geen echte e-mail-/toesteltest op het productieadres.
- Bestaande browser-/PWA-tests controleren lokale en offline flows. Nederlandse modelkwaliteit en geheugen/accu op fysieke iPhones blijven afzonderlijke validatie.

## Privébestanden en afhankelijkheden

`.gitignore` en `.vercelignore` sluiten de volledige lokale `docs/`-vault, certificaten, `.env`-bestanden en testprofielen uit. Persoonlijke logs worden niet als repositorybestand opgeslagen. De publieke deploy bevat uitsluitend de gebouwde app.

De eerder gevonden sharp-advisories zijn verholpen met een exact vastgezette override naar 0.35.5. De laatste npm-scan meldde nul advisories. Vercel draait nu `npm run security:deps` voor de build en stopt bij bekende kwetsbaarheden vanaf low. Zie [SECURITY.md](SECURITY.md) voor beveiligingsbasis en bewijsgrenzen.
