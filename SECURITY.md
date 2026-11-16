# Beveiliging van Rhythm

Dit is een prototype. Een geslaagde scan of test geeft geen garantie van 100% veiligheid.

## Actuele basis — 0.7.0

- Eén Supabase Auth-login met PKCE, e-mailbevestiging en accountwachtwoordherstel. De UI vraagt bij registratie minimaal twaalf tekens; serverbeleid en e-mailaflevering moeten apart worden gecontroleerd.
- Accountgegevens staan leesbaar in Supabase onder eigenaar-RLS en controle op een nog actieve Auth-sessie. Het model is bewust geen end-to-endversleuteling. Een accountreset kan accountgegevens weer toegankelijk maken. Het oude extra kluiswachtwoord geldt alleen bij import uit een bestaande versleutelde kluis.
- Tabelgrants, FORCE RLS, revisie/change-id en actieve-sessiecontrole beschermen `account_data`, revisies en herstelkopieën. De private audio-bucket heeft eigenaarspolicies, pad-/MIME-/groottelimieten en clientcontrole van hash/lengte. Er zijn geen publieke audiolinks.
- De offline IndexedDB-kopie gebruikt AES-GCM met willekeurige IV, eigenaar als AAD en een niet-exporteerbare CryptoKey in dezelfde origin. Die sleutel is lokaal beschikbaar voor de app. Dit beschermt niet tegen XSS, toegang tot het aangemelde apparaat of gecompromitteerde frontendcode.
- Een lokale save wordt pas bevestigd na de IDB-transactie. Compare-and-swap, duurzame pending writes, drie-weg-samenvoeging en herstelpunten beperken gegevensverlies. Een mislukte online read wordt nooit als een lege accountinhoud aangenomen. Offline/wachtende invoer blijft bij uitloggen behouden voor hetzelfde account.
- Uitloggen sluit de zichtbare app en verwijdert de lokale Auth-sessie ook zonder netwerk. Serverintrekking kan bij netwerkuitval nog onbevestigd zijn. Gebruik een eigen apparaat; zonder uitloggen blijft de accountkopie offline toegankelijk. De oude automatische kluisvergrendeling is vervallen om meerdere unlockroutes te voorkomen.
- Whisper en Gemma verwerken lokaal na expliciete modeldownload. Registraties en expliciet bewaarde opnamen synchroniseren wel naar Supabase; beweer daarom niet dat alle audio uitsluitend lokaal blijft.
- Productieheaders beperken scripts, verbindingen, frames en browserrechten. Inline JavaScript en algemene `unsafe-eval` zijn verboden. WebAssembly is toegestaan voor lokale AI. Inline CSS is nodig voor React-grafieken.
- Builds weigeren geprivilegieerde clientkeys. De webapp bevat alleen publieke projectconfiguratie; afwijkende Supabase-origins vragen een expliciete CSP-allowlist.

## Verifiëren

```powershell
npm.cmd run security:deps
npm.cmd test
npm.cmd run build
npm.cmd run test:security
npm.cmd run test:account
node tests/account-data-browser.mjs
npm.cmd run test:pwa
```

De browserchecks vragen een draaiende productiepreview op poort 4178. Ze gebruiken uitsluitend synthetische fixtures. Getest worden onder meer afgedwongen CSP, veilige tekstweergave, versleutelde apparaatopslag, offline logout, offline replay, meerdere accounts/apparaten, oude v1-import, audio, revisies en herstel vóór vervangen. Kerntests bewaren ook regressiedekking voor de oude cryptografie.

`tests/rls-account.sql` controleert echte database-isolatie met tijdelijke Auth-fixtures in een volledige rollback. `tests/rls-vault.sql` blijft de legacy-interface toetsen. `tests/rls-push.sql` heeft een lege-projectguard: voer die niet uit met echte pushapparaten; gebruik dan een geïsoleerd testproject.

Vercel voert voor iedere build een npm-advisoryscan uit en stopt bij bekende advisories vanaf low. Dit dekt geen onbekende problemen of volledige pentest. Supabase Security Advisor heeft nog de bestaande waarschuwing voor uitgeschakelde [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); die providerfunctie vraagt Pro of hoger. Geen betaalde upgrade is geactiveerd.

## Grenzen en resterende controles

Controleer exacte Auth Site/Redirect URLs, SMTP, echte bevestigings-/herstelmails, server-side wachtwoordbeleid, misbruikbeperking en de fysieke iPhone-PWA. PKCE verlangt dezelfde browsercontext voor aanvraag en callback. Standaard Supabase-mail kan begrensd zijn. De beschikbare tools hebben deze adminconfiguratie niet volledig geverifieerd.

Voor push gelden de aanvullende grenzen in [REMINDERS.md](REMINDERS.md). pg_net is platformleesbaar; de scheduler gebruikt uitsluitend 90 seconden geldige eenmalige tickets en lege bodies, geen blijvende credentials of dagboekinhoud. Technische verzending bewijst geen fysieke bezorging of betrouwbare wekker.

De laatste tien versies en herstelkopieën plus ongebruikte audio blijven bewaard. Volledige accountverwijdering/retentiebeheer vanuit de app zijn nog niet gebouwd. Browseropslag wissen kan niet-geüploade invoer verwijderen. Zie [DEPLOYMENT.md](DEPLOYMENT.md) voor herstel, limieten en migraties.

Privé-docs, opnamen, exports, secrets, certificaten en testprofielen mogen niet worden gepubliceerd. Vermeld bij bugmeldingen geen tokens, wachtwoorden of gezondheidsgegevens. Meld gevoelige bevindingen privé aan de repositorybeheerder.
