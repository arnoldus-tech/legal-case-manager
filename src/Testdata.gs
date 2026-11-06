/**
 * TESTDATA – opretter 20 testsager med tilfældigt område, status, datoer og simuleret aktivitet.
 * Alle testsager har "TEST – " i feltet Klient/afdeling og kan fjernes igen med sletTestsager().
 */

const TEST_TITLER = {
  KON: ['Leverandøraftale – IT-drift', 'Rammeaftale om rengøring', 'Forhandling af SaaS-licens', 'Samarbejdsaftale med distributør', 'Opsigelse af lejeaftale for printere'],
  ANS: ['Afskedigelse – funktionær', 'Konkurrenceklausul ved fratræden', 'Opdatering af personalehåndbog', 'Sygefravær og § 56-aftale', 'Ansættelseskontrakt – direktør'],
  SEL: ['Generalforsamling 2026', 'Kapitalforhøjelse i datterselskab', 'Ejeraftale – revision', 'Fusion af to datterselskaber', 'Registrering af ny direktion'],
  GDPR: ['Databehandleraftale med lønsystem', 'Indsigtsanmodning fra medarbejder', 'Brud på persondatasikkerheden', 'Risikovurdering – ny CRM', 'Opdatering af privatlivspolitik'],
  TVI: ['Inkasso – ubetalt faktura', 'Mangelsindsigelse fra kunde', 'Voldgiftssag – leverandør', 'Retssag om erstatning', 'Forligsforhandling – byggesag'],
  EJD: ['Ny lejekontrakt – lager Aarhus', 'Tvist om istandsættelse ved fraflytning', 'Køb af erhvervsejendom', 'Servitutgennemgang', 'Fremleje af kontorlokaler'],
  IP: ['Varemærkeregistrering EU', 'Licensaftale – software', 'Krænkelse af ophavsret på website', 'Domænenavnstvist', 'Fortrolighedsaftale (NDA) – partner'],
  COM: ['Whistleblowerordning – årsgennemgang', 'Hvidvaskpolitik', 'ESG-rapportering', 'Sanktionsscreening af kunder', 'Antikorruptionspolitik'],
  OVR: ['Generel juridisk rådgivning – marketing', 'Konkurrencebetingelser', 'Fuldmagter til ledelsen', 'Forsikringsgennemgang', 'Intern skabelonopdatering']
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
    const r = Math.random();
    const status = r < 0.10 ? 'Ny' : r < 0.60 ? 'Åben' : r < 0.75 ? 'Afventer' : 'Lukket';
    const alder = 5 + Math.floor(Math.random() * 350);                      // oprettet 5–355 dage siden
    const oprettet = dagSiden(alder);
    const lukket = status === 'Lukket' ? dagSiden(Math.floor(Math.random() * alder)) : '';
    const frist = status === 'Lukket' ? '' : fmt_(dagSiden(-Math.floor(Math.random() * 60) + 10));   // nogle overskredne

    const res = opretSag({
      titel: pick(TEST_TITLER[o.kode] || TEST_TITLER.OVR), omraade: o.navn, status: status,
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
        aktRows.push([tid(), res.nr, o.navn, type, titel, 'test', res.mappeUrl, min, 'TEST:' + res.nr + ':' + type + ':' + k]);
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
