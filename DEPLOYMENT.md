# Rhythm — Vercel en Supabase

## Configuratie 0.7.0

- React/Vite PWA, Node.js 24, npm workspaces. Vercel bouwt vanaf de repositoryroot met `npm ci`, de dependency-gate en `npm run build`; output `apps/prototype-web/dist`.
- Vast adres: [Rhythm](https://rhythm-rho-bice.vercel.app/). De GitHub-integratie publiceert `main`; controleer de broncommit en geleverde versie na iedere push.
- Supabase Auth met e-mail/wachtwoord, e-mailbevestiging en PKCE. Eén centrale login; geen apart kluiswachtwoord voor nieuw gebruik.
- `account_data`: één leesbare JSON-momentopname per account, beschermd door eigenaar-/actieve-sessie-RLS, revisie en change-id. `account_revisions` bewaart tien vorige versies. `account_recovery` bewaart tien kopieën bij conflict/herstel.
- De private Storage-bucket `rhythm-audio` bevat expliciet bewaarde opnamen, maximaal 10 MB per bestand. Paden zijn account/notehash/contenthash; downloads controleren SHA-256 en lengte. Geen publieke of blijvende ondertekende links.
- De browser bevat alleen publieke projectconfiguratie. Secret/service-role keys horen nooit in een `VITE_` variabele of frontendbestand.

## Auth instellen en testen

In **Supabase → Authentication → URL Configuration** moeten Site URL en Redirect URL de exacte origin `https://rhythm-rho-bice.vercel.app` toestaan. De client gebruikt `location.origin` voor bevestiging en herstel. De beschikbare tools kunnen deze adminconfiguratie en SMTP-instellingen niet volledig uitlezen; presenteer ze niet als geverifieerd. Gebruik geen brede wildcard voor willekeurige previews.

Controleer de e-mailprovider/SMTP, server-side wachtwoordbeleid, rate limits en CAPTCHA-keuze. De registratie-UI vraagt minstens twaalf tekens, maar die clientcontrole vervangt geen serverbeleid. De bestaande waarschuwing over uitgeschakelde leaked-password protection blijft open; de provider biedt die functie op Pro en hoger. Er is geen betaald plan aangezet.

Test echte registratie, bevestiging, login, wachtwoordreset en terugkomst met behoud van accountgegevens. Open de PKCE-mailcallback in dezelfde browsercontext als de aanvraag. Safari en een iPhone-beginscherm-PWA delen hun opslag niet gegarandeerd; dit vraagt een fysieke toesteltest. Een reset herstelt accounttoegang tot nieuwe accountopslag; een vergeten oude kluissleutel blijft niet herstelbaar.

## Offline en synchronisatie

Na de eerste login/opening wordt een offline kopie in IndexedDB bewaard. De kopie gebruikt AES-GCM met een niet-exporteerbare apparaatsleutel in dezelfde browserorigin; dit is geen bescherming tegen kwaadaardige scripts binnen die origin, noch een extra accountwachtwoord. De gebruiker blijft op dit apparaat aangemeld totdat die uitlogt. Er is geen automatische dagboekvergrendeling meer die naar een schijnbaar leeg startscherm leidt.

Bevestigd opslaan betekent dat IndexedDB de transactie heeft voltooid. De duurzame wachtrij bevat pending change-id en remote basis. De geopende app synchroniseert na invoer, reconnect, terugkeer en periodiek. Gesloten iOS-PWA's garanderen geen background sync. Browseropslag wissen of verlies van het apparaat kan nog niet geüploade invoer verwijderen.

Een fout bij de eerste online leesactie is geen leeg account. De app opent dan een foutscherm met opnieuw proberen. Losse nieuwe registraties en niet-botsende wijzigingen worden samengevoegd. Twee verschillende aanpassingen van dezelfde registratie of hetzelfde profiel stoppen; de lokale invoer blijft bewaard en er wordt een herstelkopie aangeboden. Verloren antwoorden en wijzigingen tijdens uploads zijn apart getest.

Uitloggen verwijdert de sessie en zichtbare gegevens, maar behoudt wachtende invoer in de offline cache voor hetzelfde account. Andere accounts krijgen die kopie niet te zien. Opnamen van een ander apparaat worden op aanvraag gecachet. Bij een restore wordt eerst de huidige inhoud naar `account_recovery` gestuurd; nieuwe invoer die tijdens ophalen ontstaat blokkeert vervanging.

Online revisies/herstelpunten zijn aanvullende appkopieën, geen onafhankelijke databaseback-up. De huidige snapshotlimiet is 8 MB JSON; grotere archieven vragen een volgende opslagopzet. Niet-meer-verwezen audiobestanden worden nog niet automatisch gewist, zodat eerdere herstelpunten hun opnamen behouden. Een volledige account-/retentieverwijderingsflow is nog niet gebouwd; beloof die niet.

## Bestaande kluizen

Migratie `20261116015744_account_storage` is toegepast op het geconfigureerde project. Bestaande `encrypted_vaults`, `rhythm.vault.v1` en `rhythm.sync.v1` zijn niet verwijderd of aangepast. De oude encryptie-/pushmigraties blijven onderdeel van de geschiedenis; voer ze niet opnieuw handmatig uit.

Onder **Meer → Mijn account → Herstel & oude registraties** kan een gebruiker oude lokale of online inhoud eenmalig lezen met het oude kluiswachtwoord. De decryptie en eventuele v1-upgrade gebeuren op een geheugenkopie. Een oude accountbinding moet overeenkomen. Registraties worden per ID samengevoegd; afwijkende duplicaten stoppen. Nieuwe profielkeuzes blijven behouden; bestaande eigen dagankers krijgen voorrang en oude feedback/vaste momenten worden meegenomen. Het oorspronkelijke versleutelde bestand blijft onaangeroerd. Dit bewijst niet dat ontbrekende gebruikersgegevens zijn teruggevonden: daarvoor moet de oude kopie nog bestaan in de juiste Safari-/PWA-context.

## Hosting controleren

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview -- --port 4178 --strictPort
```

In een tweede terminal:

```powershell
npm.cmd run test:browser
npm.cmd run test:account
node tests/account-data-browser.mjs
npm.cmd run test:flow
npm.cmd run test:security
npm.cmd run test:pwa
npm.cmd run test:visual
npm.cmd run test:push:browser
npm.cmd run test:hosted -- https://rhythm-rho-bice.vercel.app
```

Accountbrowsers gebruiken de echte Supabase SDK met synthetische HTTP-fixtures; geen echte accounts, mails of meldingen. `tests/account-database.mjs` draait echte lokale Postgres/RLS met platformstubs. `tests/rls-account.sql` kan via een vertrouwde databaseverbinding tegen het echte project worden uitgevoerd; alle synthetische fixtures worden teruggedraaid. Het wijzigt geen echte gebruikersrecords.

De hosted controle gebruikt een verse browser zonder account of uploads. Die toetst echte headers/CSP, HTTPS, de releaseversie, private bronpaden, manifest/iconen en de offline login-shell. Dit bewijst geen mailaflevering of fysieke iPhone-installatie. Test de accountflow desgewenst aanvullend met alleen onderschepte SDK-fixtures op dezelfde hosting.

De optionele pushbackend en eenmalige croncapabilities staan in [REMINDERS.md](REMINDERS.md). Privacy-/beveiligingsgrenzen staan in [SECURITY.md](SECURITY.md). De volledige privé-vault `docs/`, `.env`, certificaten en testprofielen blijven buiten Git en Vercel.
