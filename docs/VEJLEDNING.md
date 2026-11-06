# Sagsstyring – vejledning

Et simpelt system til at tage imod og styre sager i en juridisk afdeling. Det kører i Google Workspace: Drive, Sheets, Gmail, Docs og Slides, styret af et Apps Script.

## Sådan hænger det sammen

| Del | Hvor | Hvad |
|---|---|---|
| Sagsregister | `Sagsstyring/00 System/Sagsregister` (Google Sheet) | Én række pr. sag, plus fanerne Områder, Aktivitet, Indstillinger og Rapportdata |
| Sagsmapper | `Sagsstyring/01 Sager/<Område>/<Sagsnr> – <Titel>/` | `01 Korrespondance` (mails som PDF + vedhæftninger), `02 Dokumenter`, `03 Delt med eksterne` + et sagsnotat |
| Mails | Gmail | Alle mails med `[SAGSNR]` i emnefeltet får labelen `Sager/<SAGSNR>`, gemmes som PDF på sagen og registreres i Aktivitet |
| Dashboard | Web-app (eller menuen i arket) | Antal sager, åbne/lukkede, fordeling på område, tidsforbrug, frister, arbejdsbyrde |
| Rapporter | `Sagsstyring/02 Rapporter` | Google Slides med nøgletal, diagrammer (linket til arket) og sagslister |

**Sagsnumre:** `OMRÅDEKODE-ÅR-LØBENR`, fx `KON-2026-0007`. Løbenummeret tæller op på tværs af områder, så nummeret er unikt, også hvis en sag senere flyttes til et andet område.

**Mail-tag:** `[KON-2026-0007]`, skrevet et vilkårligt sted i emnefeltet, fx `[KON-2026-0007] Udkast til leverandøraftale`. Svar og videresendelser beholder tagget automatisk.

## Opsætning (ca. 10 minutter)

1. Åbn **Sagsregister** i `Sagsstyring/00 System`.
2. Vælg **Udvidelser → Apps Script**.
3. Erstat indholdet af `Code.gs` med indholdet af filen **Code.gs**.
4. Klik **+ → HTML**, kald filen `App` (uden .html), og indsæt indholdet af **App.html**.
5. *(Valgfrit, anbefales)* Under **Projektindstillinger** slår du "Vis manifestfilen appsscript.json" til og indsætter indholdet af **appsscript.json** (tidszone og web-app-indstillinger).
6. Gem. Vælg funktionen `opsaetning` i værktøjslinjen, og klik **Kør**. Godkend adgangen til Drive, Gmail, Sheets, Docs og Slides. Ved "Google har ikke bekræftet denne app" vælger du Avanceret → Gå til projekt. Det er dit eget script.
7. Genindlæs regnearket. Menuen **⚖️ Sagsstyring** kommer frem.
8. **Dashboard som selvstændig side:** I Apps Script vælger du **Implementér → Ny implementering → Webapp** med *Udfør som: Bruger, der tilgår webappen* og *Adgang: Alle med en Google-konto*. Gem URL'en som bogmærke.
   Kun personer, der har adgang til Sagsstyring-mappen, kan se data. Alle andre får en fejl.

## Teamet

- **Del mappen `Sagsstyring`** (som redaktør) med alle i den juridiske afdeling. Så har de adgang til registret, alle sager og web-appen.
- **Hvert teammedlem** åbner Sagsregister én gang og vælger **⚖️ Sagsstyring → Aktivér automatisk mail-synk for mig**. Så bliver også deres mails med sagstag arkiveret. Samme mail i flere indbakker registreres kun én gang, fordi systemet bruger mailens Message-ID.
- Skriv teamets mailadresser eller jeres domæne i **Indstillinger → Interne mailadresser/domæner**, så systemet kan skelne mellem *udgående* og *indgående* mails. Brug ikke `gmail.com` som domæne; skriv i stedet de enkelte adresser.

## Eksternt samarbejde

- Eksterne (modpartsadvokater, rådgivere, klienter) får kun adgang til mappen **`03 Delt med eksterne`** på den enkelte sag. Interne notater og korrespondance forbliver interne.
- Del via formularen **Ny sag**, knappen **Del** i sagslisten eller menuen **Del markeret sag med ekstern…**
- Eksterne skal have en Google-konto. Har de ikke det, kan du dele en enkelt fil som link fra Drive.
- Bed eksterne om at beholde tagget i emnefeltet, når de svarer.

## Daglig brug

| Opgave | Sådan |
|---|---|
| Ny sag / intake | Web-appen → **Ny sag** (eller menuen). Status **Ny** = indkommet anmodning, der ikke er fordelt endnu |
| Skriv en mail på sagen | **Ny mail** i sagslisten åbner Gmail med tagget i emnefeltet. Eller kopiér tagget med **Tag** |
| Dokumenter | Opret Google Docs/Sheets eller læg filer direkte i sagens mappe |
| Skift status | Dropdown i sagslisten eller direkte i arket (Ny, Åben, Afventer, Lukket). Lukkedato sættes automatisk |
| Rapport | **Lav Slides-rapport** i web-appen eller menuen. Diagrammerne er linket til arket og kan opdateres i Slides |

Synkroniseringen kører hvert 15. minut. Lukkede sager synkroniseres i 30 dage efter lukning og derefter ikke mere.

## Hvordan beregnes tidsforbruget?

Systemet kender ikke den faktiske tid, så det **estimerer** den ud fra aktiviteterne på sagen. Satserne kan rettes i fanen **Indstillinger**:

| Aktivitet | Standard |
|---|---|
| Indgående mail | 5 min |
| Udgående mail | 12 min |
| Nyt Google Doc / Sheet / Slides | 45 / 30 / 45 min |
| Anden fil (PDF, Word m.m.) | 15 min |
| Hver dag et Google-dokument redigeres | 20 min |

Dashboardet viser tiden pr. område (fordelt på mails og dokumentarbejde), pr. aktivitetstype og pr. sag. Vil I registrere faktisk tid (fx møder og telefonsamtaler), tilføjer I en række i fanen **Aktivitet** med dato, sagsnr, område, Type = `Manuel tid` og antal minutter. Den tæller automatisk med i dashboard og rapport.

## Tilpasning

- **Områder:** Ret eller tilføj rækker i fanen **Områder** (navn + kode på 2–4 bogstaver). Mappen oprettes automatisk ved næste sag.
- **Sagsnotat-skabelon:** Lav et Google Doc i `03 Skabeloner` med pladsholdere som `{{SAGSNR}}`, `{{TAG}}`, `{{TITEL}}`, `{{OMRAADE}}`, `{{ANSVARLIG}}`, `{{KLIENT}}`, `{{MODPART}}`, `{{FRIST}}`, `{{BESKRIVELSE}}` og `{{OPRETTET}}`. Indsæt dokumentets ID i Indstillinger.
- **Mails som PDF:** Kan slås fra i Indstillinger. Mails registreres stadig og får label, men gemmes ikke i Drive.

## Begrænsninger og alternativer

- **Gmail-synk sker pr. bruger.** Hvert teammedlem skal aktivere den. Alternativt kan I sætte en fælles postkasse (fx `jura@firma.dk`) i cc på alle sagsmails og kun aktivere synk dér.
- **Private gmail.com-konti** fungerer, men med Google Workspace (firmadomæne) får I delte drev, bedre adgangsstyring og mulighed for at begrænse deling til eget domæne. Det anbefales til fortrolige juridiske data.
- **Fortrolighed/GDPR:** Mails og dokumenter ligger i Google. Vurdér, om det er i orden for jeres sagstyper (databehandleraftale med Google, dataplacering i EU).
- **Større behov:** Vokser afdelingen ud af løsningen, kan dedikerede systemer som Clio, Legisway, Onit, Bryter (intake) eller Microsoft-baserede løsninger (SharePoint + Power Apps) overvejes.
