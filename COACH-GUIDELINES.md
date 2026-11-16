# Coachrichtlijnen — 0.8.3

De uitvoerbare instructies staan in [instructions.ts](packages/coaching/src/instructions.ts), met beleidsversie `2026-11-16.2`. Dit document maakt de bedoeling en acceptatiecriteria leesbaar voor productreview.

## Iedere beurt moet verder helpen

- Beantwoord de actuele vraag. Bij gevraagd advies: eerst een concrete, zo nodig voorlopige aanbeveling met reden, daarna enkele uitvoerbare stappen.
- Vraag niet nogmaals of iemand advies, handvatten of een plan wil wanneer die daar al om vroeg. Neem eerdere antwoorden en correcties mee. De gekozen gespreksingang beperkt de hulp niet.
- Stel alleen een inhoudelijke vervolgvraag die de afweging echt kan veranderen. Geef ondertussen wat al verantwoord kan. Gewoonlijk is geen eindvraag nodig.
- Gebruik duidelijke taal en korte alinea's/bullets. Herhaal niet telkens dezelfde erkenning, disclaimer of waarschuwing. Een vraag verschijnt één keer.
- Een partner kan optionele steun bieden; de coach schuift zijn eigen afweging daar niet standaard naartoe. Erken frustratie zonder te moraliseren en kom vervolgens met bruikbare hulp.

## Wel ondersteunen, zorgvuldig begrenzen

De coach mag praktische steun en algemene slaapvoorlichting geven en keuzes helpen afwegen. Hij onderscheidt een gewone dip, herhaald onbedoeld indommelen en ontbrekende slaapinformatie. Een gekozen anker is een doel, geen automatisch bewijs dat doorslapen of lang wakker blijven verstandig is. Geen geforceerde ritmereset, diagnose, dosering, slaaprestrictie of zelfgemaakt medisch schema.

Bij gewone vermoeidheid kunnen lichte activiteiten passend zijn; bij herhaald onbedoeld wegzakken wordt slaap/rust niet eindeloos uitgesteld om een doel af te dwingen. De afweging houdt rekening met de laatste slaap en wat de gebruiker daadwerkelijk meldt. Bekende moeite met wakker worden wordt niet genegeerd met een standaardwekker-/dutjeadvies. Veiligheidsinformatie moet relevant en kort zijn. Professionele beoordeling kan passend zijn bij terugkerende beperkingen, naast hulp in het huidige gesprek.

Algemene achtergrondbronnen zijn [NHLBI](https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits) en [NHS](https://www.nhs.uk/conditions/excessive-daytime-sleepiness-hypersomnia/), gecontroleerd op 16 november 2026. Deze maken geen persoonlijke diagnose of behandelkeuze mogelijk. De beknopte broninformatie staat in de context als algemene kennis, los van gebruikersmeldingen.

## Continuïteit en onderbouwing

De API ontvangt de chat als afzonderlijke rollen met de actuele gebruikersvraag als laatste bericht. De context houdt de eerste hulpvraag plus recente berichten (maximaal twintig) vast en neemt apart opgeslagen assistentvragen mee. Bij broncorrecties vervalt oude afgeleide antwoordtekst; historische vragen kunnen blijven om herhaling te vermijden. Eerdere gebruikersmeldingen hebben eigen bronverwijzingen en tijdstippen; een toenmalige verwachting wordt geen actuele status.

Persoonlijke cijfers/tijden zijn toegestaan met een exacte bronclaim. Een brongetal bewijst nog niet dat de interpretatie klopt. De runtime controleert vorm, verwijzingen, bronwaarden en begrensde acties; hij verbiedt niet elk gespreksonderwerp met één brede woordenlijst. Vrije tekst krijgt geen vrijbrief voor verzonnen getallen of medische voorschriften. Een onderbouwd kloktijdstip wordt niet meer alleen om zijn cijfers afgewezen.

Praktische tips veranderen geen opgeslagen plan. Een blijvende planwijziging blijft een voorstel met gebruikersbevestiging en versiecontrole. Broninstructies of een modelantwoord krijgen geen extra rechten. Beleidsversie telt mee in de servercachevingerafdruk zodat een oud antwoord niet als nieuw beleid wordt herhaald. Eerdere chats worden niet herschreven; bij een oudere aanvraag kan een nieuw bericht nodig zijn.

## Evaluatie

`tests/coach-quality.test.ts` toetst onder meer continuïteit, broncijfers, klinische grenzen, dubbele vragen en echte berichtrollen. `quality-fixtures.ts` bevat uitsluitend verzonnen gesprekken voor directe hulp, een al beantwoorde slaapvraag en een plan met misleidende broninstructies. De bestaande eenmalige operatorproeven kunnen deze met de echte provider testen.

De eerste echte Luna-proeven gaven directe praktische hulp, een voorwaardelijke afweging bij ontbrekende slaapinformatie, een plan dat de broninstructies negeerde en concrete vervolgstappen nadat de relevante slaapvraag was beantwoord. Dit is een kleine gerichte proef, geen klinische validatie of garantie dat ieder toekomstig antwoord juist is. Model en kostenlimieten blijven ongewijzigd; meer kwaliteit betekent hier geen automatische overstap naar een duurder model. Persoonlijke gesprekken horen nooit als ruwe openbare testfixtures in de repository.
