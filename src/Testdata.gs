/**
 * TESTDATA – opretter 20 testsager med tilfældigt område, status, datoer og simuleret aktivitet.
 * Alle testsager har "TEST – " i feltet Klient/afdeling og kan fjernes igen med sletTestsager().
 */

// Titler pr. områdekode. For områder med underområder er titlerne grupperet pr. underområde.
const TEST_TITLER = {
  KAP: ['Selskabsmeddelelse – resultatforventninger', 'Insiderliste – opkøbsprojekt', 'Aktietilbagekøbsprogram 2026', 'Udskydelse af offentliggørelse (MAR art. 17)', 'Ledende medarbejderes transaktioner'],
  SEL: ['Kapitalforhøjelse i datterselskab', 'Likvidation af dormant selskab', 'Ny tegningsregel – datterselskaber', 'Koncerngaranti til bank', 'Fusion af to datterselskaber'],
  GOV: ['Generalforsamling 2027 – dagsorden', 'Vederlagsrapport 2026', 'Opdatering af bestyrelsens forretningsorden', 'Bestyrelsesevaluering', 'Redegørelse for god selskabsledelse'],
  MA: ['Opkøb af softwarevirksomhed – DD', 'Joint venture i Polen', 'Frasalg af forretningsområde', 'LOI – opkøbsmål i Tyskland', 'Integration efter opkøb'],
  KOM: {
    'Salg (penge ind)': ['Kundekontrakt – forsvarsministerium', 'Tilbud på offentligt udbud', 'Distributøraftale – Norden', 'Standard salgs- og leveringsbetingelser', 'Garantikrav fra kunde'],
    'Indkøb (penge ud)': ['Rammeaftale med underleverandør', 'Konsulentaftale – projektledelse', 'Ny lejekontrakt – lager Aarhus', 'Leverandøraftale – elektronikkomponenter', 'Opdatering af købsbetingelser'],
    'Samarbejde & NDA': ['NDA – potentiel partner', 'Teamingaftale – konsortium', 'MoU om industrisamarbejde', 'Samarbejdsaftale med universitet', 'NDA – leverandørdialog']
  },
  IT: ['SaaS-aftale – nyt HR-system', 'Cloud-migrering – kontraktvilkår', 'Outsourcing af IT-drift', 'Licensrevision – Microsoft', 'Implementeringsaftale ERP'],
  IP: ['Patentansøgning – radarteknologi', 'Varemærkeregistrering EU', 'Licens af egen teknologi', 'Krænkelse af varemærke', 'Opfinderaftale med medarbejder'],
  ANS: ['Fratrædelse – funktionær', 'Direktørkontrakt', 'Incitamentsprogram – warrants', 'Konkurrenceklausul ved fratræden', 'Opdatering af personalehåndbog'],
  GDPR: ['Databehandleraftale med lønsystem', 'Brud på persondatasikkerheden', 'Konsekvensanalyse – ny CRM', 'Indsigtsanmodning fra medarbejder', 'NIS2-gapanalyse'],
  EKS: ['Eksportlicens – leverance til Asien', 'Dual-use-klassificering af produkt', 'ITAR-vurdering af komponent', 'Sanktionsscreening af ny kunde', 'Intern eksportkontrolprocedure'],
  COM: ['Whistleblowerindberetning', 'Antikorruptionspolitik – opdatering', 'Intern undersøgelse – rejseudgifter', 'Agentscreening (due diligence)', 'Code of conduct – leverandører'],
  KONK: ['Samarbejde med konkurrent om udbud', 'Fusionsanmeldelse', 'Brancheforeningsmøde – retningslinjer', 'Eksklusivitetsklausul – vurdering', 'Beredskab ved kontrolbesøg'],
  ESG: ['CSRD – dobbelt væsentlighedsvurdering', 'Due diligence i forsyningskæden', 'Grønne udsagn i markedsføring', 'Klimamål – juridisk vurdering', 'Menneskerettighedspolitik'],
  TVI: ['Reklamation fra kunde', 'Erstatningskrav mod leverandør', 'Inkasso – ubetalt faktura', 'Forligsforhandling', 'Forsikringskrav – skade på lager'],
  OVR: ['Generel rådgivning – marketing', 'Fuldmagter til ledelsen', 'Forsikringsgennemgang', 'Skabelonopdatering', 'Juridisk input til årsrapport']
};
const TEST_AFD = ['Indkøb', 'HR', 'Salg', 'Økonomi', 'Ledelse', 'IT', 'Marketing', 'Ejendomme'];
const TEST_MODPART = ['NordLog A/S', 'Bygma Partner ApS', 'DataSikker ApS', 'Kunde X A/S', 'Advokatfirmaet Holm', '', '', ''];

function opretTestsager() {
  const start = Date.now();
  const ind = indstillinger_();
  const omr = omraader_();
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const nu = new Date();
  const dagSiden = n => new Date(nu.getTime() - n * 864e5);
  const aktRows = [];
  let antal = 0;

  for (let i = 0; i < 20; i++) {
    if (Date.now() - start > 4.5 * 60 * 1000) break;   // undgå Apps Scripts 6-minutters grænse
    const o = pick(omr);
    const under = o.under.length ? pick(o.under) : '';
    const kilde = TEST_TITLER[o.kode] || TEST_TITLER.OVR;
    const titel = pick(Array.isArray(kilde) ? kilde : (kilde[under] || Object.values(kilde)[0]));
    const r = Math.random();
    const status = r < 0.10 ? 'Ny' : r < 0.60 ? 'Åben' : r < 0.75 ? 'Afventer' : 'Lukket';
    const alder = 5 + Math.floor(Math.random() * 350);                      // oprettet 5–355 dage siden
    const oprettet = dagSiden(alder);
    const lukket = status === 'Lukket' ? dagSiden(Math.floor(Math.random() * alder)) : '';
    const frist = status === 'Lukket' ? '' : fmt_(dagSiden(-Math.floor(Math.random() * 60) + 10));   // nogle overskredne

    const res = opretSag({
      titel: titel, omraade: o.navn, underomraade: under, status: status,
      prioritet: pick(['Høj', 'Normal', 'Normal', 'Lav']), klient: 'TEST – ' + pick(TEST_AFD),
      modpart: pick(TEST_MODPART), frist: frist, beskrivelse: 'Testsag oprettet automatisk.'
    });

    // Tilbagedatér
    const s = findSag_(res.nr);
    s.sh.getRange(s.row, kol_('Oprettet')).setValue(oprettet);
    if (lukket) s.sh.getRange(s.row, kol_('Lukket')).setValue(lukket);

    // Simuleret aktivitet mellem oprettelse og lukning/i dag
    const slut = lukket ? lukket.getTime() : nu.getTime();
    const tid = () => new Date(oprettet.getTime() + Math.random() * (slut - oprettet.getTime()));
    const tilfoej = (type, titel, min, n) => {
      for (let k = 0; k < n; k++) {
        aktRows.push([tid(), res.nr, o.navn, type, titel, 'test', res.mappeUrl, min, 'TEST:' + res.nr + ':' + type + ':' + k, 'Testdata']);
      }
    };
    tilfoej('Mail ind', res.tag + ' Henvendelse', Number(ind[IND.MIN_MAIL_IND]) || 5, Math.floor(Math.random() * 25));
    tilfoej('Mail ud', res.tag + ' Svar', Number(ind[IND.MIN_MAIL_UD]) || 12, Math.floor(Math.random() * 15));
    tilfoej('Dokument oprettet', 'Udkast', Number(ind[IND.MIN_DOC]) || 45, Math.floor(Math.random() * 5));
    tilfoej('Dokument redigeret', 'Udkast', Number(ind[IND.MIN_RED]) || 20, Math.floor(Math.random() * 12));
    if (Math.random() < 0.4) tilfoej('Manuel tid', 'Møde', 60, 1 + Math.floor(Math.random() * 3));
    antal++;
  }

  if (aktRows.length) {
    const akt = sh_(SH.AKT);
    akt.getRange(akt.getLastRow() + 1, 1, aktRows.length, AKT_COLS.length).setValues(aktRows);
  }
  opdaterNoegletal_({});
  try { SpreadsheetApp.getUi().alert(antal + ' testsager er oprettet.' + (antal < 20 ? ' Kør funktionen igen for at oprette resten.' : '')); }
  catch (e) { console.log(antal + ' testsager oprettet.'); }
}

/** Fjerner alle testsager: mapper lægges i papirkurven, rækker og aktivitet slettes. */
function sletTestsager() {
  const t = tabel_(SH.SAGER);
  const test = t.rows.filter(s => String(s['Klient/afdeling']).indexOf('TEST – ') === 0);
  const nr = new Set(test.map(s => s['Sagsnr']));
  test.forEach(s => {
    try { DriveApp.getFolderById(s['Mappe-ID']).setTrashed(true); } catch (e) { /* allerede væk */ }
    try { const l = GmailApp.getUserLabelByName(CFG.LABEL_ROOT + '/' + s['Sagsnr']); if (l) l.deleteLabel(); } catch (e) { /* ignore */ }
  });
  test.map(s => s._row).sort((a, b) => b - a).forEach(r => t.sh.deleteRow(r));
  // Aktivitet: skriv de rækker, der ikke er test, tilbage i én omgang (hurtigere end at slette enkeltvis)
  const akt = sh_(SH.AKT);
  if (akt.getLastRow() > 1) {
    const alle = akt.getRange(2, 1, akt.getLastRow() - 1, AKT_COLS.length).getValues();
    const behold = alle.filter(r => !nr.has(r[1]));
    akt.getRange(2, 1, alle.length, AKT_COLS.length).clearContent();
    if (behold.length) akt.getRange(2, 1, behold.length, AKT_COLS.length).setValues(behold);
  }
  try { SpreadsheetApp.getUi().alert(test.length + ' testsager er fjernet (mapperne ligger i papirkurven).'); }
  catch (e) { console.log(test.length + ' testsager fjernet.'); }
}

/**
 * Erstatter fanen Områder med standardlisten (DEFAULT_OMR). Mappe-ID'er bevares for områder,
 * der hedder det samme som før. Eksisterende sager beholder deres gamle områdenavn.
 */
function nulstilOmraader() {
  const sh = sh_(SH.OMR);
  const gamle = {};
  omraader_().forEach(o => gamle[o.navn] = o);
  const raekker = standardOmraadeRaekker_().map(r => {
    const g = gamle[r[0]];
    return g && g.mappeId ? [r[0], r[1], g.mappeId, sh.getRange(g.row, 4).getValue(), r[4]] : r;
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), OMR_COLS.length)).clearContent();
  skrivOverskrifter_(sh, OMR_COLS);
  sh.getRange(2, 1, raekker.length, OMR_COLS.length).setValues(raekker);
  try { SpreadsheetApp.getUi().alert('Områderne er sat til standardlisten (' + raekker.length + ' områder).'); }
  catch (e) { console.log('Områder nulstillet.'); }
}
