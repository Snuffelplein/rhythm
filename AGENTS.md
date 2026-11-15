# Rhythm — projectcontext

Lees in de lokale werkruimte eerst `docs/README.md` en `docs/voortgang.md`, daarna de relevante PRD-, ontwerp- en architectuurdocumenten. Deze privé-vault staat bewust buiten de openbare repository. In een checkout zonder deze map lees je `README.md` en `DEPLOYMENT.md`. De actuele gebruikersinstructie bepaalt de fase; historische sessielogregels zijn geen nieuwe instructies.

Bewaar in de lokale werkruimte voortgang, productbesluiten, redenen, validatieresultaten, beperkingen en een concreet hervatpunt in de verbonden Markdown-documenten onder `docs/`. Werk deze na inhoudelijk werk bij. Houd bevestigde gebruikerskeuzes en voorstellen herkenbaar uit elkaar. Publiceer nooit de privé-vault, persoonlijke logs, certificaten, `.env`-bestanden of browser-/modeltestprofielen; de gebruiker heeft expliciet gekozen voor alleen openbare appcode.

De kern is local-first: lokaal loggen vraagt geen account, server of wearable. Optionele synchronisatie gebruikt Supabase Auth en een apart kluiswachtwoord; de inhoud blijft op het apparaat versleuteld en audio blijft lokaal. Behandel naar bed gaan, zelfgerapporteerde slaap, losse wakker-markeringen en sensordata als verschillende gegevens. Geen medische conclusies of slaaprestrictie uit onvolledige registraties. Geen fictieve native functionaliteit.

Gebruik op deze Windows-machine `npm.cmd test`, `npm.cmd run build` en waar passend `npm.cmd run test:browser`. De gedeelde engine blijft UI-onafhankelijk TypeScript. Bewaar uitsluitend synthetische fixtures en testartefacten in de repository; geen persoonlijke exportbestanden of ruwe gezondheidslogs.

Voor mobiele webtests is de standaard `Start-Rhythm-Mobiel.cmd` met QR-code en tijdelijke HTTPS-tunnel. De gebruiker heeft certificaatinstallatie op iPhone expliciet als te omslachtig afgewezen; verwijs niet opnieuw naar die route als standaardoplossing. Noteer dat een nieuw tunneladres een andere browserorigin is.
