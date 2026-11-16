# Persoonlijke begeleiding (0.8.0)

Open **Vandaag → Help me met vandaag**. Gesprek, Mijn plan en Geheugen gebruiken hetzelfde account als de rest van de app. Zonder online toestemming kun je lokaal schrijven en eigen doelen/voorkeuren bewaren. De vaste lokale gespreksstarter is herkenbaar gelabeld en is geen taalmodelantwoord. Whisper Base transcribeert Nederlands lokaal; Gemma 4 E2B maakt lokaal een te controleren samenvattingsconcept. Zij activeren geen plannen.

## GPT en kosten

GPT-6 Luna is de standaard voor online steun, terugblik en planvoorstellen. Er is geen automatische fallback naar een duurder model. Alleen een operator kan het servermodel wijzigen via `RHYTHM_COACH_MODEL`; de browser kan dit niet.

Volgens de [OpenAI-prijslijst](https://developers.openai.com/api/docs/pricing) op 16 november 2026 kost Luna $0,10 per miljoen invoertokens en $0,50 per miljoen uitvoertokens. Met 10.000 invoer- en 1.000 uitvoertokens kost een antwoord bijvoorbeeld $0,0015, exclusief belasting/omrekening. Werkelijk gebruik en prijzen kunnen afwijken; redeneertokens tellen als uitvoer. Er is geen betaalde appbundel ingevoerd.

De pilot reserveert atomair maximaal 20 aanvragen per account en 200 voor alle accounts samen per UTC-dag. Ook mislukte aanvragen tellen mee. Context is begrensd op 48 KB, uitvoer op 2.200 tokens inclusief redeneren. Een verloren antwoord kan met dezelfde aanvraag-id en bronvingerafdruk uit de tijdelijke cache worden herhaald zonder een tweede betaalde call. Deze gebruikslimieten zijn geen eurobudget op het OpenAI-account.

## Opslag en bronbeheer

`RhythmData.coaching` voegt getypeerde JSON toe aan de bestaande account-snapshot. Lokale CAS-opslag, synchronisatie, account-RLS en herstelpunten blijven de enige opslagroute. Er is geen tweede Markdown-database voor gebruikersgegevens. De relaties vormen een kleine graph: bronbericht → bevestigde voorkeur; aanvraag → context/bronnen → antwoord; voorstel → bevestigde planversie → terugkoppeling.

De UI-onafhankelijke `packages/coaching` selecteert profiel, eigen ankers, maximaal 40 actuele geheugenitems, geregistreerde dekking over 28 dagen, maandtotalen over maximaal 24 maanden, recente bronregistraties, relevante gesprekstekst en planfeedback. Bronregistraties blijven bewaard; samenvattingen vervangen geen feiten. Ontbreken betekent onbekend. Naar bed gaan, slaapblokken en losse wakker-markeringen blijven onderscheiden. Duur/dekking komen uit de gedeelde engine. Geboortedatum, e-mailadres, audio en audioverwijzingen gaan niet naar GPT. Dagboektekst vraagt een aparte keuze.

De server leest de gesynchroniseerde account-snapshot met de gebruikers-JWT en RLS. De browser stuurt alleen aanvraag-id en verwachte bronvingerafdruk; extra context wordt geweigerd. De functie controleert een actieve Auth-sessie en leest na generatie opnieuw om wijzigingen in toestemming, bronnen of gesprekken te herkennen. GPT heeft geen tools of schrijfrechten.

Structured Outputs en runtimevalidatie controleren vorm, bronverwijzingen, exacte claimwaarden, toegelaten stappen en gebruikersgekozen tijden. Vrije antwoordtekst mag geen cijfers bevatten; controleerbare getallen staan in de bronweergave. De inhoudscontrole weigert onder meer behandel-/doserings-/slaaprestrictievoorstellen. Dit bewijst geen semantische waarheid of medische veiligheid: verkeerde interpretaties en foutpositieve afwijzingen blijven mogelijk. De coach bepaalt geen diagnose of optimale slaap-/wektijden.

## Plan en regie

Een voorstel verandert niets. Bevestigen controleert bronnen, actieve planversie en ouderdom (maximaal vier uur en dezelfde lokale dag). Dit maakt een nieuwe onveranderlijke planversie met verwijzing naar de vorige. Tegenstrijdige activaties op verschillende apparaten worden een syncconflict zonder stilzwijgende winnaar. Offline bevestiging is voorlopig lokaal tot synchronisatie is bevestigd.

`today` geldt op de lokale dag van bevestigen; daarna geldt het eerdere dagelijkse plan, als dat bestaat. `daily` blijft gelden tot aanpassen of pauzeren. Per stap kun je Gelukt, Te veel of Vandaag overslaan aangeven. Die terugkoppeling wordt context voor een volgend gesprek. Aanpassen gebeurt via een nieuw gesprek en een nieuw bevestigd voorstel.

Planactivering en pauzeren wijzigen geen slaapankers of pushschema's. **Herinneringen beheren** opent de bestaande Wekker-flow; push houdt afzonderlijke toestemming en bevestiging. Deze release laat GPT geen slaapbehandeling of automatische agenda ontwerpen.

## Toestemming en verwijderen

Online begeleiding staat standaard uit. Expliciete toestemming bepaalt of profiel/logs/bevestigd geheugen en relevante gesprekstekst naar OpenAI gaan; dagboektekst is apart optioneel. Audio gaat niet naar OpenAI. Opnamen die je in het dagboek bewaart kunnen zoals voorheen naar de eigen privé-Supabase-bucket synchroniseren.

De Responses API gebruikt `store:false`. Dit is **geen Zero Data Retention**: volgens de [OpenAI-datacontroles](https://developers.openai.com/api/docs/guides/your-data) kan standaard misbruikmonitoring inhoud bewaren, doorgaans tot 30 dagen met genoemde uitzonderingen. De feitelijke organisatie-/regio-/retentieconfiguratie is niet door deze app ingesteld of geverifieerd.

Vergeten voorkeuren en verwijderde gesprekken krijgen inhoudsloze verwijdermarkeringen die herleving uit oude apparaatkopieën en herstelpunten voorkomen. Vergeten wint over een gelijktijdige bewerking. Een gekoppeld vergeten bronbericht verdwijnt uit toekomstige GPT-geschiedenis. Een verwijderd gesprek verwijdert ook hieruit bewaarde voorkeuren; bevestigde plannen blijven apart bestaan. Een herstelpunt zet toestemming niet opnieuw aan wanneer een huidige apparaat- of serverkopie die heeft ingetrokken.

De private serverantwoordcache vervalt na 24 uur; een interne uurtaak wist verlopen rijen (normaal binnen circa 25 uur). Gesprek verwijderen of online begeleiding uitzetten wist tevens eigen cache-antwoorden na succesvolle sync. Dit hervat bij opnieuw openen met internet. Een verzonden provider-aanvraag kan niet worden teruggenomen. Account-snapshots, de laatste tien revisies, herstelkopieën en providerretentie blijven afzonderlijk: vergeten is geen volledige verwijdering uit alle backups. Volledige accountverwijdering blijft een vervolgtaak.

## Server en verificatie

Pas na de reguliere accountmigraties `20261116065910_personal_coach.sql` toe. Deze voegt private job-/quotatabellen, een service-only dispatcher, eigen-cacheverwijdering en een interne opruimcron toe. Registraties en de pushcron worden niet herschreven.

Zet `OPENAI_API_KEY` uitsluitend in Supabase Edge Function Secrets, nooit in een `VITE_`-variabele. `npm.cmd run build:coach` bundelt dezelfde gedeelde context/validatie/engine naar `test-results/coach-edge/index.mjs`. Deploy deze entrypoint met de bijgehouden `deno.json` (SDK 2.119.0). Gateway-JWT-validatie staat uit omdat de functie zelf `auth.getUser` én actieve sessie/RLS controleert; anonieme gewone aanvragen worden geweigerd. Extra previeworigins vragen `RHYTHM_COACH_ALLOWED_ORIGINS`. Browser-CSP geeft geen OpenAI-verbinding.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview -- --port 4178 --strictPort
# Tweede terminal:
npm.cmd run test:coach
npm.cmd run test:gemma4
```

Coachbrowserchecks gebruiken synthetische HTTP-fixtures. `tests/coach-database.mjs` toetst echte lokale Postgresrollen/SQL; `tests/rls-coach.sql` kan dezelfde grenzen op Supabase toetsen in een volledige rollback. Operators kunnen éénmalige 90-secondentickets aanmaken in de private `coach_probe_tickets` voor drie vaste synthetische modelproeven. De service-only dispatcher consumeert een ticket vóór één GPT-call. Die route accepteert geen prompt, model of accountinhoud en is niet beschikbaar via de gewone client.

Gemma 4 E2B is op desktop Edge echt geladen en met een Nederlandse notitie getest zonder AI-uploads of overschrijven van het origineel. Volgens de runtimecatalogus vraagt f16 circa 3,4 GB GPU-geheugen en f32 circa 3,9 GB. WebGPU/buffercontrole voorspelt geen vrij GPU-geheugen. Download/inferentie en geheugen op een fysieke iPhone moeten nog worden getoetst. Typen blijft beschikbaar als laden mislukt.
