/**
 * SAGSSTYRING – juridisk afdeling
 * Google Apps Script bundet til regnearket "Sagsregister".
 *
 * Indhold:
 *   1. Konfiguration
 *   2. Menu, opsætning og triggere
 *   3. Sager: oprettelse, status, deling
 *   4. Synkronisering af mails og dokumenter (tidsforbrug)
 *   5. Dashboard-data og web-app
 *   6. Rapport i Google Slides
 *   7. Hjælpefunktioner
 */

// ============================================================
// 1. KONFIGURATION
// ============================================================

// Ingen Drive-ID'er i koden: opsaetning() finder eller opretter mapperne og gemmer
// ID'erne i Script Properties (se prop_() og MAPPER).
const CFG = {
  TZ: 'Europe/Copenhagen',
  LABEL_ROOT: 'Sager',
  MAX_SYNK_MS: 4.5 * 60 * 1000   // Apps Script stopper efter 6 min.
};

/** Mapper, som opsætningen sikrer findes i rodmappen. Nøgle = Script Property. */
const MAPPER = { SAGER_FOLDER_ID: '01 Sager', RAPPORT_FOLDER_ID: '02 Rapporter', SKABELON_FOLDER_ID: '03 Skabeloner' };

const SH = { SAGER: 'Sager', OMR: 'Områder', AKT: 'Aktivitet', MAILS: 'Mails', IND: 'Indstillinger', RAP: 'Rapportdata' };

const COLS = ['Sagsnr', 'Titel', 'Område', 'Status', 'Prioritet', 'Ansvarlig', 'Team', 'Eksterne',
  'Klient/afdeling', 'Modpart', 'Oprettet', 'Frist', 'Lukket', 'Mappe', 'Mappe-ID', 'Beskrivelse',
  'Mails', 'Dokumenter', 'Est. timer', 'Sidst synk', 'Underområde'];
const AKT_COLS = ['Tidspunkt', 'Sagsnr', 'Område', 'Type', 'Titel', 'Person', 'Link', 'Minutter', 'Nøgle', 'Kilde'];
const OMR_COLS = ['Område', 'Kode', 'Mappe-ID', 'Mappe', 'Underområder'];
/** Én række pr. arkiveret mail – grundlaget for mailoversigten pr. sag. */
const MAIL_COLS = ['Sagsnr', 'Dato', 'Retning', 'Fra', 'Til', 'Cc', 'Emne', 'Vedhæftninger', 'Tråd',
  'Message-ID', 'PDF', 'EML', 'Kilde', 'Arkiveret af'];

const STATUSER = ['Ny', 'Åben', 'Afventer', 'Lukket'];
const PRIORITETER = ['Høj', 'Normal', 'Lav'];
const AKT_TYPER = ['Mail ind', 'Mail ud', 'Dokument oprettet', 'Dokument redigeret', 'Manuel tid'];

const UNDERMAPPER = { MAIL: '01 Korrespondance', DOK: '02 Dokumenter', EKST: '03 Delt med eksterne' };

/**
 * Standardområder for en juridisk afdeling i et børsnoteret selskab: [navn, kode, underområder].
 * Underområder vælges på sagen; for kommercielle aftaler skelnes mellem salg og indkøb.
 */
const DEFAULT_OMR = [
  ['Kapitalmarked & børsret', 'KAP', ''],
  ['Selskabsret', 'SEL', ''],
  ['Governance', 'GOV', ''],
  ['M&A & transaktioner', 'MA', ''],
  ['Kommercielle aftaler', 'KOM', 'Salg, Indkøb, Samarbejde'],
  ['IT & teknologi', 'IT', ''],
  ['Immaterielle rettigheder', 'IP', 'Patenter & design, Varemærker & domæner, Licenser & know-how, NDA'],
  ['Ansættelse & HR', 'ANS', ''],
  ['Persondata & informationssikkerhed', 'GDPR', ''],
  ['Eksportkontrol & sanktioner', 'EKS', ''],
  ['Compliance & etik', 'COM', ''],
  ['Konkurrenceret', 'KONK', ''],
  ['ESG & bæredygtighed', 'ESG', ''],
  ['Tvister & krav', 'TVI', ''],
  ['Generel rådgivning', 'OVR', '']
];
/** DEFAULT_OMR som rækker til fanen Områder (Mappe-ID og Mappe udfyldes ved første sag). */
function standardOmraadeRaekker_() { return DEFAULT_OMR.map(o => [o[0], o[1], '', '', o[2]]); }

const IND = {
  MIN_MAIL_IND: 'Minutter pr. indgående mail',
  MIN_MAIL_UD: 'Minutter pr. udgående mail',
  MIN_DOC: 'Minutter pr. nyt Google Doc',
  MIN_SHEET: 'Minutter pr. nyt Google Sheet',
  MIN_SLIDES: 'Minutter pr. nyt Google Slides',
  MIN_ANDET: 'Minutter pr. andet dokument (PDF, Word m.m.)',
  MIN_RED: 'Minutter pr. redigeringsdag på dokument',
  GEM_PDF: 'Gem mails som PDF på sagen (JA/NEJ)',
  GEM_VEDH: 'Gem vedhæftninger på sagen (JA/NEJ)',
  GEM_EML: 'Gem mails som .eml (original) på sagen (JA/NEJ)',
  INTERNE: 'Interne mailadresser/domæner (komma-separeret)',
  PRIVAT: 'Gmail-label for private mails (røres aldrig)',
  UDELUK: 'Udelukkede domæner/adresser (komma-separeret)',
  SKABELON: 'Sagsnotat-skabelon (Doc-ID, valgfri)'
};
const DEFAULT_IND = [
  [IND.MIN_MAIL_IND, 5], [IND.MIN_MAIL_UD, 12], [IND.MIN_DOC, 45], [IND.MIN_SHEET, 30],
  [IND.MIN_SLIDES, 45], [IND.MIN_ANDET, 15], [IND.MIN_RED, 20],
  [IND.GEM_PDF, 'JA'], [IND.GEM_EML, 'JA'], [IND.GEM_VEDH, 'JA'], [IND.INTERNE, ''],
  [IND.PRIVAT, 'Privat'], [IND.UDELUK, ''], [IND.SKABELON, '']
];

/** Sagsnummer et vilkårligt sted i en tekst, fx KON-2026-0007. */
const NR_RE = /[A-ZÆØÅ]{2,5}-\d{4}-\d{4}/g;
/** Første scanning af indbakken går så mange dage tilbage. */
const FOERSTE_SCAN_DAGE = 14;
/** Maks. antal forslag i "Uden sag" pr. bruger. */
const MAKS_KOE = 200;
/** Freemail-domæner tæller ikke som "samme domæne" ved forslag. */
const FRI_DOMAENER = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.dk', 'outlook.com', 'outlook.dk',
  'live.com', 'live.dk', 'msn.com', 'yahoo.com', 'yahoo.dk', 'icloud.com', 'me.com', 'mail.dk', 'jubii.dk'];

// ============================================================
// 2. MENU, OPSÆTNING OG TRIGGERE
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚖️ Sagsstyring')
    .addItem('Opret ny sag…', 'visNySag')
    .addItem('Åbn dashboard', 'visDashboard')
    .addSeparator()
    .addItem('Vis mail-tag for markeret sag', 'visTagValgt')
    .addItem('Luk markeret sag', 'lukValgt')
    .addItem('Genåbn markeret sag', 'genaabnValgt')
    .addItem('Del markeret sag med ekstern…', 'delValgt')
    .addSeparator()
    .addItem('Synkronisér mails og dokumenter nu', 'synkroniser')
    .addItem('Lav rapport i Google Slides', 'lavRapportMenu')
    .addSeparator()
    .addItem('Aktivér automatisk mail-synk for mig', 'aktiverSynk')
    .addItem('Opsætning (kør første gang)', 'opsaetning')
    .addSubMenu(ui.createMenu('Demo')
      .addItem('Opret 20 testsager', 'opretTestsager')
      .addItem('Slet testsager', 'sletTestsager')
      .addItem('Nulstil områder til standardlisten', 'nulstilOmraader'))
    .addToUi();
}

/** Opretter faneblade, standardområder, områdemapper, Gmail-label og trigger. Kan køres flere gange. */
function opsaetning() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SS_ID', ss.getId());

  // Rodmappe: hvis arket ligger i "00 System", er rodmappen mappen over; ellers arkets egen mappe
  const arkMappe = DriveApp.getFileById(ss.getId()).getParents().next();
  const rod = arkMappe.getName() === '00 System' && arkMappe.getParents().hasNext() ? arkMappe.getParents().next() : arkMappe;
  props.setProperty('ROOT_FOLDER_ID', rod.getId());
  Object.keys(MAPPER).forEach(k => props.setProperty(k, undermappe_(rod, MAPPER[k]).getId()));

  sikrFaner_(ss);
  const sager = ss.getSheetByName(SH.SAGER);
  skrivOverskrifter_(sager, COLS);

  const omr = hentEllerOpret_(SH.OMR);
  skrivOverskrifter_(omr, OMR_COLS);
  if (omr.getLastRow() < 2) omr.getRange(2, 1, DEFAULT_OMR.length, OMR_COLS.length).setValues(standardOmraadeRaekker_());
  omraader_().forEach(sikrOmraadeMappe_);

  const akt = hentEllerOpret_(SH.AKT);
  skrivOverskrifter_(hentEllerOpret_(SH.MAILS), MAIL_COLS);
  skrivOverskrifter_(akt, AKT_COLS);

  const ind = hentEllerOpret_(SH.IND);
  skrivOverskrifter_(ind, ['Indstilling', 'Værdi']);
  const eksisterende = ind.getLastRow() > 1 ? ind.getRange(2, 1, ind.getLastRow() - 1, 1).getValues().flat() : [];
  DEFAULT_IND.filter(r => eksisterende.indexOf(r[0]) < 0).forEach(r => {
    if (r[0] === IND.INTERNE) r = [r[0], Session.getEffectiveUser().getEmail()];
    ind.appendRow(r);
  });
  ind.autoResizeColumn(1);

  // Dropdowns i sagsregistret
  const n = sager.getMaxRows() - 1;
  const dv = (liste) => SpreadsheetApp.newDataValidation().requireValueInList(liste, true).build();
  sager.getRange(2, kol_('Status'), n).setDataValidation(dv(STATUSER));
  sager.getRange(2, kol_('Prioritet'), n).setDataValidation(dv(PRIORITETER));
  sager.getRange(2, kol_('Område'), n).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(omr.getRange('A2:A'), true).build());
  sager.getRange(2, kol_('Oprettet'), n, 1).setNumberFormat('yyyy-mm-dd');
  sager.getRange(2, kol_('Frist'), n, 2).setNumberFormat('yyyy-mm-dd');
  sager.getRange(2, kol_('Sidst synk'), n).setNumberFormat('yyyy-mm-dd hh:mm');
  akt.getRange(2, 1, akt.getMaxRows() - 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sager.setFrozenColumns(2);

  // Betinget formatering: lukkede sager grå, overskredne frister røde
  const alt = sager.getRange(2, 1, n, COLS.length);
  const stCol = kolBogstav_(kol_('Status')), fCol = kolBogstav_(kol_('Frist'));
  sager.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=$${stCol}2="Lukket"`)
      .setFontColor('#9aa0a6').setRanges([alt]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($${fCol}2<>"";$${fCol}2<TODAY();$${stCol}2<>"Lukket")`)
      .setBackground('#fce8e6').setRanges([sager.getRange(2, kol_('Frist'), n)]).build()
  ]);

  try { GmailApp.getUserLabelByName(CFG.LABEL_ROOT) || GmailApp.createLabel(CFG.LABEL_ROOT); } catch (e) { /* Gmail ikke tilgængelig */ }
  aktiverSynk(true);

  try {
    SpreadsheetApp.getUi().alert('Opsætning færdig',
      'Faneblade, områdemapper og automatisk synkronisering (hvert 15. minut) er klar.\n\n' +
      'Næste skridt: Udrul web-appen (Implementér → Ny implementering → Webapp) for at få dashboardet som selvstændig side.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { console.log('Opsætning færdig.'); }   // kørt fra editoren
}

/** Hvert teammedlem kører denne én gang, så deres egen Gmail også synkroniseres til sagerne. */
function aktiverSynk(stille) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'synkroniser')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('synkroniser').timeBased().everyMinutes(15).create();
  if (stille !== true) {
    SpreadsheetApp.getUi().alert('Automatisk synkronisering af din Gmail og sagsmapperne kører nu hvert 15. minut.');
  }
}

/** Simpel trigger: når status ændres direkte i arket, sættes/ryddes lukkedato og ændringen logges. */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== SH.SAGER || e.range.getColumn() !== kol_('Status') || e.range.getRow() < 2) return;
  const row = e.range.getRow();
  const status = e.range.getValue();
  sh.getRange(row, kol_('Lukket')).setValue(status === 'Lukket' ? new Date() : '');
  const nr = sh.getRange(row, kol_('Sagsnr')).getValue();
  const omr = sh.getRange(row, kol_('Område')).getValue();
  // Simple triggere må ikke bruge openById → brug e.source
  e.source.getSheetByName(SH.AKT).appendRow([new Date(), nr, omr, 'Status', 'Status → ' + status, '', '', 0, '']);
}

// ============================================================
// 3. SAGER
// ============================================================

/**
 * Opretter en ny sag: unikt sagsnummer, mappe med undermapper, sagsnotat, deling og Gmail-label.
 * @param {Object} d {titel, omraade, status, prioritet, ansvarlig, team, eksterne, klient, modpart, frist, beskrivelse}
 */
function opretSag(d) {
  d = d || {};
  if (!d.titel || !d.omraade) throw new Error('Titel og område skal udfyldes.');
  const omr = omraader_().find(o => o.navn === d.omraade);
  if (!omr) throw new Error('Ukendt område: ' + d.omraade);
  if (omr.under.length && omr.under.indexOf(d.underomraade) < 0) throw new Error('Vælg et underområde for ' + omr.navn + '.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const nr = naesteNr_(omr.kode);
    const tag = '[' + nr + ']';
    const nu = new Date();
    const ansvarlig = (d.ansvarlig || Session.getActiveUser().getEmail() || '').trim();

    // Mapper
    const omrMappe = DriveApp.getFolderById(sikrOmraadeMappe_(omr));
    const mappe = omrMappe.createFolder(nr + ' – ' + d.titel);
    mappe.setDescription('Sagsstyring: ' + nr + ' | ' + d.titel);
    Object.keys(UNDERMAPPER).forEach(k => mappe.createFolder(UNDERMAPPER[k]));
    const ekstMappe = undermappe_(mappe, UNDERMAPPER.EKST);

    // Deling: team på hele sagen, eksterne kun på "Delt med eksterne"
    const fejl = [];
    splitMails_([ansvarlig, d.team].join(',')).forEach(m => { try { mappe.addEditor(m); } catch (e) { fejl.push(m); } });
    splitMails_(d.eksterne).forEach(m => { try { ekstMappe.addEditor(m); } catch (e) { fejl.push(m); } });

    // Sagsnotat
    const notat = opretSagsnotat_(mappe, {
      SAGSNR: nr, TAG: tag, TITEL: d.titel, OMRAADE: omr.navn, ANSVARLIG: ansvarlig,
      KLIENT: d.klient || '', MODPART: d.modpart || '', FRIST: d.frist || '',
      BESKRIVELSE: d.beskrivelse || '', OPRETTET: fmt_(nu)
    });

    // Gmail-label
    try { GmailApp.createLabel(CFG.LABEL_ROOT + '/' + nr); } catch (e) { /* findes evt. allerede */ }

    // Række i registret
    const o = {
      'Sagsnr': nr, 'Titel': d.titel, 'Område': omr.navn, 'Status': d.status || 'Åben',
      'Prioritet': d.prioritet || 'Normal', 'Ansvarlig': ansvarlig, 'Team': d.team || '',
      'Eksterne': d.eksterne || '', 'Klient/afdeling': d.klient || '', 'Modpart': d.modpart || '',
      'Oprettet': nu, 'Frist': d.frist ? new Date(d.frist) : '', 'Lukket': '',
      'Mappe': mappe.getUrl(), 'Mappe-ID': mappe.getId(), 'Beskrivelse': d.beskrivelse || '',
      'Mails': 0, 'Dokumenter': 0, 'Est. timer': 0, 'Sidst synk': '', 'Underområde': omr.under.length ? d.underomraade : ''
    };
    sh_(SH.SAGER).appendRow(COLS.map(c => o[c]));
    sh_(SH.AKT).appendRow([nu, nr, omr.navn, 'Oprettet', 'Sag oprettet: ' + d.titel, ansvarlig, mappe.getUrl(), 0, '']);

    return { nr: nr, tag: tag, mappeUrl: mappe.getUrl(), notatUrl: notat, fejl: fejl };
  } finally {
    lock.releaseLock();
  }
}

function setStatus(nr, status) {
  if (STATUSER.indexOf(status) < 0) throw new Error('Ugyldig status: ' + status);
  const s = findSag_(nr);
  s.sh.getRange(s.row, kol_('Status')).setValue(status);
  s.sh.getRange(s.row, kol_('Lukket')).setValue(status === 'Lukket' ? new Date() : '');
  sh_(SH.AKT).appendRow([new Date(), nr, s.sag['Område'], 'Status', 'Status → ' + status,
    Session.getActiveUser().getEmail(), '', 0, '']);
  return true;
}

/** Deler sagens mappe "03 Delt med eksterne" (eller hele sagen, hvis intern=true). */
function delSag(nr, email, intern) {
  const s = findSag_(nr);
  const mappe = DriveApp.getFolderById(s.sag['Mappe-ID']);
  const maal = intern ? mappe : undermappe_(mappe, UNDERMAPPER.EKST);
  maal.addEditor(email.trim());
  const felt = intern ? 'Team' : 'Eksterne';
  const eks = String(s.sag[felt] || '');
  s.sh.getRange(s.row, kol_(felt)).setValue(eks ? eks + ', ' + email.trim() : email.trim());
  return maal.getUrl();
}

function visNySag() { visApp_('ny', 'Opret ny sag', 760, 820); }
function visDashboard() { visApp_('dashboard', 'Sagsstyring', 1300, 880); }

function visTagValgt() {
  const nr = valgtSag_(); if (!nr) return;
  SpreadsheetApp.getUi().alert('Mail-tag', 'Skriv dette i emnefeltet på alle mails om sagen:\n\n[' + nr + ']',
    SpreadsheetApp.getUi().ButtonSet.OK);
}
function lukValgt() { const nr = valgtSag_(); if (nr) { setStatus(nr, 'Lukket'); toast_(nr + ' er lukket.'); } }
function genaabnValgt() { const nr = valgtSag_(); if (nr) { setStatus(nr, 'Åben'); toast_(nr + ' er genåbnet.'); } }
function delValgt() {
  const nr = valgtSag_(); if (!nr) return;
  const ui = SpreadsheetApp.getUi();
  const svar = ui.prompt('Del ' + nr + ' med ekstern', 'E-mail (Google-konto). Der deles kun mappen "' +
    UNDERMAPPER.EKST + '".', ui.ButtonSet.OK_CANCEL);
  if (svar.getSelectedButton() !== ui.Button.OK || !svar.getResponseText()) return;
  delSag(nr, svar.getResponseText(), false);
  toast_('Delt med ' + svar.getResponseText());
}

// ============================================================
// 4. SYNKRONISERING (mails + dokumenter → aktivitet og tidsforbrug)
// ============================================================

/*
 * Mailgenkendelse – sådan finder systemet sagen uden at brugeren skal huske et tag:
 *   Stærke spor (arkiveres automatisk):
 *     1. Sagsnummer i emnefeltet (med eller uden [ ])
 *     2. Plusadresse i Til/Cc, fx sager+KON-2026-0007@firma.dk
 *     3. Tråden har allerede labelen Sager/<nr>
 *     4. Svar på en arkiveret mail (In-Reply-To / References peger på dens Message-ID)
 *   Sorteres fra: label "Privat", udelukkede domæner, nyhedsbreve og automatiske mails.
 *   Svage spor (forslag i brugerens egen "Uden sag"): sagens eksterne kontakter,
 *     samme firmadomæne som dem, eller emne der ligner sagstitlen.
 * Systemet læser kun headere for at klassificere. Indholdet hentes først, når mailen arkiveres.
 */

function synkroniser() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const start = Date.now();
    const ctx = synkKontekst_();
    try { scanNyeMails_(ctx, start); } catch (e) { console.error('Scanning af nye mails fejlede: ' + e); }

    const synket = {};
    const graense = Date.now() - 30 * 864e5;
    // Ældst synkroniserede først, så alle sager når at komme med over flere kørsler
    const sager = ctx.sager
      .filter(s => s['Status'] !== 'Lukket' || !s['Lukket'] || new Date(s['Lukket']).getTime() > graense)
      .sort((a, b) => (a['Sidst synk'] ? new Date(a['Sidst synk']).getTime() : 0) - (b['Sidst synk'] ? new Date(b['Sidst synk']).getTime() : 0));

    for (const s of sager) {
      if (Date.now() - start > CFG.MAX_SYNK_MS) break;
      try {
        synkSagsmails_(ctx, s);
        synkDokumenter_(s, ctx.ind, ctx.set, ctx.nye);
        synket[s['Sagsnr']] = true;
      } catch (e) {
        console.error('Synk fejlede for ' + s['Sagsnr'] + ': ' + e);
      }
    }

    skrivAktivitet_(ctx);
    opdaterNoegletal_(synket);
  } finally {
    lock.releaseLock();
  }
}

/** Fælles data for én synkronisering: sager, allerede arkiverede mails og indstillinger. */
function synkKontekst_() {
  const ind = indstillinger_();
  const akt = sh_(SH.AKT);
  if (akt.getRange(1, AKT_COLS.length).getValue() !== AKT_COLS[AKT_COLS.length - 1]) skrivOverskrifter_(akt, AKT_COLS);
  const iN = AKT_COLS.indexOf('Nøgle'), iS = AKT_COLS.indexOf('Sagsnr');
  const set = new Set(), midTilSag = {};
  if (akt.getLastRow() > 1) {
    akt.getRange(2, 1, akt.getLastRow() - 1, AKT_COLS.length).getValues().forEach(r => {
      const k = String(r[iN] || '');
      if (!k) return;
      set.add(k);
      if (k.indexOf('MAIL:') === 0) midTilSag[k.slice(5)] = r[iS];
    });
  }
  const sager = tabel_(SH.SAGER).rows.filter(s => s['Mappe-ID']);
  const sagPrNr = {};
  sager.forEach(s => sagPrNr[s['Sagsnr']] = s);
  return {
    ind: ind, set: set, midTilSag: midTilSag, sager: sager, sagPrNr: sagPrNr, nye: [], nyeMails: [], mapper: {}, labels: {},
    interne: splitMails_(ind[IND.INTERNE] || Session.getEffectiveUser().getEmail()),
    udeluk: splitMails_(ind[IND.UDELUK]),
    privat: String(ind[IND.PRIVAT] || 'Privat').trim()
  };
}

function skrivAktivitet_(ctx) {
  if (ctx.nye.length) {
    const akt = sh_(SH.AKT);
    akt.getRange(akt.getLastRow() + 1, 1, ctx.nye.length, AKT_COLS.length).setValues(ctx.nye);
    ctx.nye = [];
  }
  if (ctx.nyeMails.length) {
    const ml = sh_(SH.MAILS);
    ml.getRange(ml.getLastRow() + 1, 1, ctx.nyeMails.length, MAIL_COLS.length).setValues(ctx.nyeMails);
    ctx.nyeMails = [];
  }
}

/** Mails med sagsnummeret i emnet og alle mails i tråde med sagens label (også ældre end scanningen). */
function synkSagsmails_(ctx, sag) {
  const nr = sag['Sagsnr'];
  const label = sagLabel_(ctx, nr);
  GmailApp.search('subject:"' + nr + '"', 0, 100).forEach(t => {
    if (erPrivat_(ctx, t)) return;
    if (label) t.addLabel(label);
    t.getMessages().forEach(m => arkiverMail_(ctx, sag, m, 'Sagsnr i emne'));
  });
  if (label) label.getThreads(0, 100).forEach(t => {
    if (erPrivat_(ctx, t)) return;
    t.getMessages().forEach(m => arkiverMail_(ctx, sag, m, 'Tråd'));
  });
}

/** Gennemgår nye mails siden sidste kørsel (pr. bruger) og arkiverer eller foreslår. */
function scanNyeMails_(ctx, start) {
  const up = PropertiesService.getUserProperties();
  const nu = Date.now();
  const fra = Number(up.getProperty('SIDST_SCAN')) || (nu - FOERSTE_SCAN_DAGE * 864e5);
  const q = 'after:' + Math.floor((fra - 3600 * 1000) / 1000) + ' -in:spam -in:trash -in:chats';
  const alle = up.getProperties();
  const koe = laesKoe_(alle);
  const afvist = new Set();
  Object.keys(alle).forEach(k => {
    if (k.indexOf('I:') !== 0) return;
    if (nu - Number(alle[k]) > 90 * 864e5) up.deleteProperty(k); else afvist.add(k.slice(2));
  });

  let side = 0, faerdig = true;
  for (;;) {
    if (Date.now() - start > CFG.MAX_SYNK_MS / 2) { faerdig = false; break; }
    const traade = GmailApp.search(q, side * 50, 50);
    traade.forEach(t => {
      try { behandlTraad_(ctx, t, koe, afvist, up); } catch (e) { console.warn('Tråd sprunget over: ' + e); }
    });
    if (traade.length < 50) break;
    side++;
  }
  if (faerdig) up.setProperty('SIDST_SCAN', String(nu));
  begraensKoe_(up, koe);
}

function behandlTraad_(ctx, t, koe, afvist, up) {
  if (erPrivat_(ctx, t)) return;
  const pre = CFG.LABEL_ROOT + '/';
  const traadNr = t.getLabels().map(l => l.getName())
    .filter(n => n.indexOf(pre) === 0 && ctx.sagPrNr[n.slice(pre.length)])
    .map(n => n.slice(pre.length))[0] || '';

  t.getMessages().forEach(m => {
    const mid = messageId_(m);
    if (ctx.set.has('MAIL:' + mid) || afvist.has(mid) || koe[m.getId()] || erUdelukket_(ctx, m)) return;
    const k = klassificer_(ctx, m, traadNr);
    if (!k) return;
    if (k.nr) arkiverMail_(ctx, ctx.sagPrNr[k.nr], m, k.kilde);
    else gemIKoe_(up, koe, m, mid, k.forslag);
  });
}

/** Returnerer {nr, kilde} ved stærkt spor, {forslag:[…]} ved svage spor, ellers null. */
function klassificer_(ctx, m, traadNr) {
  const numre = (String(m.getSubject() || '').toUpperCase().match(NR_RE) || []).filter(n => ctx.sagPrNr[n]);
  if (numre.length) return { nr: numre[0], kilde: 'Sagsnr i emne' };

  const adr = [m.getTo(), m.getCc(), m.getHeader('Delivered-To')].join(',').toUpperCase();
  const plus = (adr.match(/\+([A-ZÆØÅ]{2,5}-\d{4}-\d{4})@/) || [])[1];
  if (plus && ctx.sagPrNr[plus]) return { nr: plus, kilde: 'Plusadresse' };

  if (traadNr) return { nr: traadNr, kilde: 'Tråd' };

  const ref = referencer_(m).find(r => ctx.midTilSag[r] && ctx.sagPrNr[ctx.midTilSag[r]]);
  if (ref) return { nr: ctx.midTilSag[ref], kilde: 'Svar i sagstråd' };

  if (erMassemail_(m)) return null;
  const forslag = forslag_(ctx, m);
  return forslag.length ? { forslag: forslag } : null;
}

/** Svage spor mod åbne sager oprettet før mailen. Højst 3 forslag, bedste først. */
function forslag_(ctx, m) {
  const dato = m.getDate().getTime();
  const egne = a => ctx.interne.some(x => a.indexOf(x) >= 0);
  const adresser = adresser_([m.getFrom(), m.getTo(), m.getCc()].join(',')).filter(a => !egne(a));
  const domaener = adresser.map(a => a.split('@')[1]).filter(d => FRI_DOMAENER.indexOf(d) < 0);
  const emneOrd = ord_(m.getSubject());

  const ud = [];
  ctx.sager.forEach(s => {
    if (s['Status'] === 'Lukket' || (s['Oprettet'] && new Date(s['Oprettet']).getTime() > dato)) return;
    const eks = adresser_(s['Eksterne']);
    let point = 0; const grunde = [];
    if (adresser.some(a => eks.indexOf(a) >= 0)) { point += 3; grunde.push('kontakt på sagen'); }
    else if (domaener.some(d => eks.some(e => e.split('@')[1] === d))) { point += 2; grunde.push('samme domæne som sagens kontakt'); }
    const faelles = ord_(s['Titel']).filter(o => emneOrd.indexOf(o) >= 0);
    if (faelles.length >= 2 || (faelles.length === 1 && point > 0)) { point += 2; grunde.push('emnet ligner sagstitlen'); }
    if (point >= 2) ud.push({ nr: s['Sagsnr'], titel: s['Titel'], grund: grunde.join(' + '), point: point });
  });
  return ud.sort((a, b) => b.point - a.point).slice(0, 3);
}

/**
 * Arkiverer én mail på sagen: PDF, .eml og vedhæftninger i "01 Korrespondance", label i Gmail
 * og en række i Aktivitet. Message-ID sikrer, at samme mail i flere indbakker kun tælles én gang.
 */
function arkiverMail_(ctx, sag, m, kilde) {
  const mid = messageId_(m);
  const noegle = 'MAIL:' + mid;
  if (!sag || ctx.set.has(noegle)) return false;
  ctx.set.add(noegle);
  const nr = sag['Sagsnr'];
  ctx.midTilSag[mid] = nr;

  const ind = ctx.ind;
  const ja = k => String(ind[k]).toUpperCase() === 'JA';
  const fra = m.getFrom();
  const ud = ctx.interne.some(x => fra.toLowerCase().indexOf(x) >= 0);
  let link = gmailLink_(mid), pdfUrl = '', emlUrl = '';
  const vedh = m.getAttachments({ includeInlineImages: false });

  if (ja(IND.GEM_PDF) || ja(IND.GEM_EML) || ja(IND.GEM_VEDH)) {
    const mappe = ctx.mapper[nr] = ctx.mapper[nr] || undermappe_(DriveApp.getFolderById(sag['Mappe-ID']), UNDERMAPPER.MAIL);
    const navn = (fmt_(m.getDate(), 'yyyy-MM-dd HHmm') + ' – ' + rens_(fra.replace(/<.*>/, '')) + ' – ' + rens_(m.getSubject())).substring(0, 150);
    if (ja(IND.GEM_PDF)) {
      try {
        const f = mappe.createFile(mailSomPdf_(m).setName(navn + '.pdf'));
        f.setDescription('Sagsstyring:mail ' + mid);
        link = pdfUrl = f.getUrl();
      } catch (e) { console.warn('PDF fejlede: ' + e); }
    }
    if (ja(IND.GEM_EML)) {
      try {
        const f = mappe.createFile(Utilities.newBlob(m.getRawContent(), 'message/rfc822', navn + '.eml'));
        f.setDescription('Sagsstyring:mail-eml ' + mid);
        emlUrl = f.getUrl();
      } catch (e) { console.warn('.eml fejlede: ' + e); }
    }
    if (ja(IND.GEM_VEDH)) {
      vedh.forEach(a => {
        try { mappe.createFile(a.copyBlob()).setDescription('Sagsstyring:vedhæftning ' + mid); } catch (e) { /* for stor */ }
      });
    }
  }
  const label = sagLabel_(ctx, nr);
  if (label) { try { m.getThread().addLabel(label); } catch (e) { /* ignore */ } }

  ctx.nye.push([m.getDate(), nr, sag['Område'], ud ? 'Mail ud' : 'Mail ind', m.getSubject(), fra, link,
    Number(ud ? ind[IND.MIN_MAIL_UD] : ind[IND.MIN_MAIL_IND]) || 0, noegle, kilde]);
  ctx.nyeMails.push([nr, m.getDate(), ud ? 'Ud' : 'Ind', fra, m.getTo(), m.getCc(), m.getSubject(),
    vedh.map(a => a.getName()).join(', '), traadRod_(m) || mid, mid, pdfUrl, emlUrl, kilde,
    Session.getEffectiveUser().getEmail()]);
  return true;
}

// ---------- "Uden sag": forslag gemmes pr. bruger i UserProperties (kun synlige for ejeren) ----------

function laesKoe_(alle) {
  const koe = {};
  Object.keys(alle).forEach(k => {
    if (k.indexOf('Q:') !== 0) return;
    try { koe[k.slice(2)] = JSON.parse(alle[k]); } catch (e) { /* ødelagt post */ }
  });
  return koe;
}

function gemIKoe_(up, koe, m, mid, forslag) {
  const e = { id: m.getId(), mid: mid, dato: m.getDate().toISOString(), fra: m.getFrom(),
    emne: String(m.getSubject() || '').substring(0, 300), forslag: forslag.map(f => ({ nr: f.nr, titel: f.titel, grund: f.grund })) };
  up.setProperty('Q:' + e.id, JSON.stringify(e));
  koe[e.id] = e;
}

function begraensKoe_(up, koe) {
  const ids = Object.keys(koe).sort((a, b) => koe[a].dato < koe[b].dato ? 1 : -1);
  ids.slice(MAKS_KOE).forEach(id => { up.deleteProperty('Q:' + id); delete koe[id]; });
}

/** Til web-appen: brugerens egne forslag + åbne sager at vælge imellem. */
function hentUdenSag() {
  const koe = laesKoe_(PropertiesService.getUserProperties().getProperties());
  const poster = Object.keys(koe).map(id => Object.assign({ link: gmailLink_(koe[id].mid) }, koe[id]))
    .sort((a, b) => a.dato < b.dato ? 1 : -1);
  const sager = tabel_(SH.SAGER).rows.filter(s => s['Status'] !== 'Lukket')
    .map(s => ({ nr: s['Sagsnr'], titel: s['Titel'] })).sort((a, b) => a.nr < b.nr ? 1 : -1);
  return { poster: poster, sager: sager };
}

/** Knytter mailen – og resten af dens tråd – til sagen. Labelen sørger for, at fremtidige svar følger med. */
function knytTilSag(id, nr) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ctx = synkKontekst_();
    const sag = ctx.sagPrNr[nr];
    if (!sag) throw new Error('Ukendt sag: ' + nr);
    const t = GmailApp.getMessageById(id).getThread();
    const kilde = 'Manuelt – ' + Session.getActiveUser().getEmail();
    let antal = 0;
    t.getMessages().forEach(m => { if (arkiverMail_(ctx, sag, m, kilde)) antal++; });
    const label = sagLabel_(ctx, nr);
    if (label) t.addLabel(label);
    skrivAktivitet_(ctx);
    opdaterNoegletal_({});
    const up = PropertiesService.getUserProperties();
    t.getMessages().forEach(m => up.deleteProperty('Q:' + m.getId()));
    return { nr: nr, antal: antal };
  } finally {
    lock.releaseLock();
  }
}

/** Fjerner forslaget og husker det, så mailen ikke foreslås igen. */
function afvisForslag(id) {
  const up = PropertiesService.getUserProperties();
  const raa = up.getProperty('Q:' + id);
  up.deleteProperty('Q:' + id);
  if (raa) { try { up.setProperty('I:' + JSON.parse(raa).mid, String(Date.now())); } catch (e) { /* ignore */ } }
  return true;
}

// ---------- Mailoversigt ----------

/** Arkiverede mails for én sag (nr) eller alle sager (nr tom), nyeste først. */
function hentMails(nr) {
  const t = tabel_(SH.MAILS);
  return t.rows.filter(r => !nr || r['Sagsnr'] === nr).map(r => ({
    nr: r['Sagsnr'], dato: r['Dato'] ? new Date(r['Dato']).toISOString() : '', retning: r['Retning'],
    fra: r['Fra'], til: r['Til'], cc: r['Cc'], emne: r['Emne'], vedh: r['Vedhæftninger'],
    traad: r['Tråd'], mid: r['Message-ID'], pdf: r['PDF'], eml: r['EML'], kilde: r['Kilde'],
    gmail: r['Message-ID'] ? gmailLink_(r['Message-ID']) : ''
  })).sort((a, b) => a.dato < b.dato ? 1 : -1).slice(0, 2000);
}

/**
 * Fritekstsøgning i indholdet af arkiverede mails og vedhæftninger via Drives egen søgning
 * (begrænset til sagernes korrespondancemapper). Returnerer de Message-ID'er, der matcher.
 */
function soegMailindhold(nr, q) {
  q = String(q || '').trim();
  if (q.length < 2) return [];
  const esc = q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const sager = tabel_(SH.SAGER).rows.filter(s => s['Mappe-ID'] && (!nr || s['Sagsnr'] === nr));
  const mids = new Set();
  sager.forEach(s => {
    try {
      const it = DriveApp.getFolderById(s['Mappe-ID']).getFoldersByName(UNDERMAPPER.MAIL);
      if (!it.hasNext()) return;
      const filer = DriveApp.searchFiles("fullText contains '" + esc + "' and '" + it.next().getId() + "' in parents and trashed = false");
      while (filer.hasNext()) {
        const m = String(filer.next().getDescription() || '').match(/^Sagsstyring:(?:mail|mail-eml|vedhæftning) (.+)$/);
        if (m) mids.add(m[1].trim());
      }
    } catch (e) { console.warn('Søgning fejlede for ' + s['Sagsnr'] + ': ' + e); }
  });
  return Array.from(mids);
}

// ---------- små mailhjælpere ----------

function messageId_(m) { return String(m.getHeader('Message-ID') || m.getId()).replace(/[<>]/g, '').trim(); }
function gmailLink_(mid) { return 'https://mail.google.com/mail/u/0/#search/rfc822msgid%3A' + encodeURIComponent(mid); }

function referencer_(m) {
  const fund = ((m.getHeader('In-Reply-To') || '') + ' ' + (m.getHeader('References') || '')).match(/<[^>]+>/g) || [];
  return fund.map(r => r.slice(1, -1).trim());
}

/** Trådens første mail (roden i References), så samme samtale samles på tværs af indbakker. */
function traadRod_(m) {
  const r = (m.getHeader('References') || '').match(/<[^>]+>/) || (m.getHeader('In-Reply-To') || '').match(/<[^>]+>/);
  return r ? r[0].slice(1, -1).trim() : '';
}

function adresser_(s) {
  return (String(s || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(a => a.toLowerCase());
}

function ord_(s) {
  return String(s || '').toLowerCase().replace(/^(\s*(re|sv|fw|fwd|vs)\s*:\s*)+/i, '')
    .split(/[^a-zæøå0-9]+/).filter(o => o.length >= 5);
}

function erPrivat_(ctx, t) { return t.getLabels().some(l => l.getName() === ctx.privat); }

function erUdelukket_(ctx, m) {
  if (!ctx.udeluk.length) return false;
  const a = adresser_(m.getFrom()).join(' ');
  return ctx.udeluk.some(u => a.indexOf(u) >= 0);
}

function erMassemail_(m) {
  return !!m.getHeader('List-Unsubscribe') || /bulk|list|junk/i.test(m.getHeader('Precedence') || '') ||
    /no-?reply|do-?not-?reply|mailer-daemon|notifications?@/i.test(m.getFrom());
}

function sagLabel_(ctx, nr) {
  if (ctx.labels[nr] !== undefined) return ctx.labels[nr];
  const navn = CFG.LABEL_ROOT + '/' + nr;
  try { ctx.labels[nr] = GmailApp.getUserLabelByName(navn) || GmailApp.createLabel(navn); } catch (e) { ctx.labels[nr] = null; }
  return ctx.labels[nr];
}

function mailSomPdf_(m) {
  const html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11px}' +
    'table.h td{padding:2px 8px 2px 0;vertical-align:top}</style></head><body>' +
    '<h2>' + esc_(m.getSubject()) + '</h2><table class="h">' +
    '<tr><td><b>Fra</b></td><td>' + esc_(m.getFrom()) + '</td></tr>' +
    '<tr><td><b>Til</b></td><td>' + esc_(m.getTo()) + '</td></tr>' +
    (m.getCc() ? '<tr><td><b>Cc</b></td><td>' + esc_(m.getCc()) + '</td></tr>' : '') +
    '<tr><td><b>Dato</b></td><td>' + fmt_(m.getDate(), 'yyyy-MM-dd HH:mm') + '</td></tr>' +
    '<tr><td><b>Vedhæftet</b></td><td>' + esc_(m.getAttachments().map(a => a.getName()).join(', ')) + '</td></tr>' +
    '</table><hr>' + (m.getBody() || esc_(m.getPlainBody())) + '</body></html>';
  try {
    return Utilities.newBlob(html, 'text/html', 'mail.html').getAs('application/pdf');
  } catch (e) {
    const enkel = html.replace(/<hr>[\s\S]*<\/body>/, '<hr><pre>' + esc_(m.getPlainBody()) + '</pre></body>');
    return Utilities.newBlob(enkel, 'text/html', 'mail.html').getAs('application/pdf');
  }
}

function synkDokumenter_(sag, ind, set, nye) {
  const nr = sag['Sagsnr'];
  const minPrType = {};
  minPrType[MimeType.GOOGLE_DOCS] = Number(ind[IND.MIN_DOC]) || 0;
  minPrType[MimeType.GOOGLE_SHEETS] = Number(ind[IND.MIN_SHEET]) || 0;
  minPrType[MimeType.GOOGLE_SLIDES] = Number(ind[IND.MIN_SLIDES]) || 0;
  const minAndet = Number(ind[IND.MIN_ANDET]) || 0;
  const minRed = Number(ind[IND.MIN_RED]) || 0;

  alleFiler_(DriveApp.getFolderById(sag['Mappe-ID'])).forEach(f => {
    const beskr = f.getDescription() || '';
    if (beskr.indexOf('Sagsstyring:mail') === 0 || beskr.indexOf('Sagsstyring:vedhæftning') === 0) return;
    const id = f.getId();
    const oprettet = f.getDateCreated();
    const opdateret = f.getLastUpdated();
    let ejer = '';
    try { ejer = f.getOwner() ? f.getOwner().getEmail() : ''; } catch (e) { /* delt drev */ }

    const kOpr = 'DOK:' + id;
    if (!set.has(kOpr)) {
      set.add(kOpr);
      const auto = beskr.indexOf('Sagsstyring:sagsnotat') === 0;   // genereret automatisk → 0 min
      const min = auto ? 0 : (minPrType[f.getMimeType()] !== undefined ? minPrType[f.getMimeType()] : minAndet);
      nye.push([oprettet, nr, sag['Område'], 'Dokument oprettet', f.getName(), ejer, f.getUrl(), min, kOpr]);
    }
    // Én registrering pr. dag et dokument er redigeret (kun Google-filer kan redigeres løbende)
    const erGoogle = String(f.getMimeType()).indexOf('application/vnd.google-apps') === 0;
    if (erGoogle && opdateret.getTime() - oprettet.getTime() > 10 * 60 * 1000) {
      const kRed = 'RED:' + id + ':' + fmt_(opdateret, 'yyyyMMdd');
      if (!set.has(kRed)) {
        set.add(kRed);
        nye.push([opdateret, nr, sag['Område'], 'Dokument redigeret', f.getName(), ejer, f.getUrl(), minRed, kRed]);
      }
    }
  });
}

/** Genberegner Mails / Dokumenter / Est. timer for alle sager ud fra aktivitetsloggen. */
function opdaterNoegletal_(synket) {
  const sh = sh_(SH.SAGER);
  if (sh.getLastRow() < 2) return;
  const sum = {};
  tabel_(SH.AKT).rows.forEach(a => {
    const s = sum[a['Sagsnr']] = sum[a['Sagsnr']] || { mails: 0, dok: 0, min: 0 };
    if (a['Type'] === 'Mail ind' || a['Type'] === 'Mail ud') s.mails++;
    if (a['Type'] === 'Dokument oprettet') s.dok++;
    s.min += Number(a['Minutter']) || 0;
  });
  const c0 = kol_('Mails');
  const nr = sh.getRange(2, kol_('Sagsnr'), sh.getLastRow() - 1, 1).getValues().flat();
  const gl = sh.getRange(2, c0, nr.length, 4).getValues();
  const nu = new Date();
  const ud = nr.map((n, i) => {
    const s = sum[n] || { mails: 0, dok: 0, min: 0 };
    return [s.mails, s.dok, Math.round(s.min / 6) / 10, synket && synket[n] ? nu : gl[i][3]];
  });
  sh.getRange(2, c0, ud.length, 4).setValues(ud);
}

// ============================================================
// 5. DASHBOARD-DATA OG WEB-APP
// ============================================================

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('App');
  t.view = (e && e.parameter && e.parameter.view) || 'dashboard';
  t.iDialog = false;
  return t.evaluate().setTitle('Sagsstyring – juridisk afdeling')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function visApp_(view, titel, b, h) {
  const t = HtmlService.createTemplateFromFile('App');
  t.view = view;
  t.iDialog = true;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(b).setHeight(h), titel);
}

/** Al data til dashboardet. Datoer returneres som tekst (google.script.run kan ikke sende Date). */
function getDashboardData() {
  const sager = tabel_(SH.SAGER).rows;
  const akt = tabel_(SH.AKT).rows;
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  const d30 = new Date(idag.getTime() - 30 * 864e5);
  const omrListe = omraader_();
  const omrNavne = omrListe.map(o => o.navn);
  const omrUnder = {};
  omrListe.forEach(o => { if (o.under.length) omrUnder[o.navn] = o.under; });

  const k = { total: sager.length, aabne: 0, lukkede: 0, nye: 0, afventer: 0, overskredet: 0, oprettet30: 0, lukket30: 0, timer: 0 };
  const omr = {};
  omrNavne.forEach(n => omr[n] = { navn: n, total: 0, aabne: 0, lukkede: 0, timer: 0, typer: {} });
  const ansvarlig = {};

  sager.forEach(s => {
    const o = omr[s['Område']] = omr[s['Område']] || { navn: s['Område'], total: 0, aabne: 0, lukkede: 0, timer: 0, typer: {} };
    o.total++;
    if (s['Status'] === 'Lukket') { k.lukkede++; o.lukkede++; } else {
      k.aabne++; o.aabne++;
      const a = s['Ansvarlig'] || '(ingen)';
      ansvarlig[a] = (ansvarlig[a] || 0) + 1;
    }
    if (s['Status'] === 'Ny') k.nye++;
    if (s['Status'] === 'Afventer') k.afventer++;
    if (s['Frist'] && s['Status'] !== 'Lukket' && new Date(s['Frist']) < idag) k.overskredet++;
    if (s['Oprettet'] && new Date(s['Oprettet']) >= d30) k.oprettet30++;
    if (s['Lukket'] && new Date(s['Lukket']) >= d30) k.lukket30++;
  });

  // Tidsforbrug fra aktivitetsloggen
  const typer = {};
  AKT_TYPER.forEach(t => typer[t] = 0);
  const prSag = {};
  akt.forEach(a => {
    const min = Number(a['Minutter']) || 0;
    if (!min) return;
    typer[a['Type']] = (typer[a['Type']] || 0) + min;
    const o = omr[a['Område']];
    if (o) { o.timer += min; o.typer[a['Type']] = (o.typer[a['Type']] || 0) + min; }
    prSag[a['Sagsnr']] = (prSag[a['Sagsnr']] || 0) + min;
    k.timer += min;
  });
  const tilTimer = m => Math.round(m / 6) / 10;
  Object.keys(typer).forEach(t => typer[t] = tilTimer(typer[t]));
  Object.keys(omr).forEach(n => {
    omr[n].timer = tilTimer(omr[n].timer);
    Object.keys(omr[n].typer).forEach(t => omr[n].typer[t] = tilTimer(omr[n].typer[t]));
  });
  k.timer = tilTimer(k.timer);

  // Oprettet / lukket pr. måned (12 mdr.)
  const mdr = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(idag.getFullYear(), idag.getMonth() - i, 1);
    mdr.push({ key: fmt_(d, 'yyyy-MM'), label: fmt_(d, 'MMM yy'), oprettet: 0, lukket: 0 });
  }
  const mIdx = {}; mdr.forEach((m, i) => mIdx[m.key] = i);
  sager.forEach(s => {
    if (s['Oprettet'] && mIdx[fmt_(s['Oprettet'], 'yyyy-MM')] !== undefined) mdr[mIdx[fmt_(s['Oprettet'], 'yyyy-MM')]].oprettet++;
    if (s['Lukket'] && mIdx[fmt_(s['Lukket'], 'yyyy-MM')] !== undefined) mdr[mIdx[fmt_(s['Lukket'], 'yyyy-MM')]].lukket++;
  });

  const liste = sager.map(s => ({
    nr: s['Sagsnr'], titel: s['Titel'], omraade: s['Område'], under: s['Underområde'] || '', status: s['Status'], prioritet: s['Prioritet'],
    ansvarlig: s['Ansvarlig'], klient: s['Klient/afdeling'], modpart: s['Modpart'],
    oprettet: fmt_(s['Oprettet']), frist: fmt_(s['Frist']), lukket: fmt_(s['Lukket']),
    mappe: s['Mappe'], mails: Number(s['Mails']) || 0, dok: Number(s['Dokumenter']) || 0,
    timer: tilTimer(prSag[s['Sagsnr']] || 0),
    overskredet: !!(s['Frist'] && s['Status'] !== 'Lukket' && new Date(s['Frist']) < idag)
  }));

  // Fordeling på underområder (fx Kommercielle aftaler: salg / indkøb): sager og timer
  const underfordeling = [];
  Object.keys(omrUnder).forEach(navn => {
    omrUnder[navn].concat(['(ikke angivet)']).forEach(u => {
      const her = liste.filter(s => s.omraade === navn && (s.under || '(ikke angivet)') === u);
      if (her.length) underfordeling.push({ omraade: navn, under: u, sager: her.length,
        timer: Math.round(her.reduce((t, s) => t + s.timer, 0) * 10) / 10 });
    });
  });

  let webUrl = '';
  try { webUrl = ScriptApp.getService().getUrl() || ''; } catch (e) { /* ikke udrullet */ }

  return {
    k: k, omraader: Object.keys(omr).map(n => omr[n]), typer: typer, maaneder: mdr,
    ansvarlig: Object.keys(ansvarlig).map(a => ({ navn: a, antal: ansvarlig[a] })).sort((a, b) => b.antal - a.antal),
    underfordeling: underfordeling, omrUnder: omrUnder,
    sager: liste, omrNavne: omrNavne, statuser: STATUSER, prioriteter: PRIORITETER, aktTyper: AKT_TYPER,
    bruger: Session.getActiveUser().getEmail(), webUrl: webUrl, opdateret: fmt_(new Date(), 'yyyy-MM-dd HH:mm')
  };
}

// ============================================================
// 6. RAPPORT I GOOGLE SLIDES
// ============================================================

function lavRapportMenu() {
  const url = lavRapport();
  const html = HtmlService.createHtmlOutput('<p style="font-family:Arial">Rapporten er klar:</p>' +
    '<p style="font-family:Arial"><a href="' + url + '" target="_blank">Åbn rapporten i Google Slides</a></p>').setWidth(360).setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'Rapport');
}

/** Bygger en Slides-præsentation med nøgletal, diagrammer (linket til arket) og sagslister. Returnerer URL. */
function lavRapport() {
  const d = getDashboardData();
  const ss = ss_();

  // 1) Rapportdata + diagrammer i arket (Slides-diagrammer skal komme fra Sheets)
  const rap = hentEllerOpret_(SH.RAP);
  rap.clear();
  rap.getCharts().forEach(c => rap.removeChart(c));
  const omrRows = d.omraader.filter(o => o.total > 0 || o.timer > 0);
  const t1 = [['Område', 'Sager i alt', 'Åbne', 'Lukkede']].concat(omrRows.map(o => [o.navn, o.total, o.aabne, o.lukkede]));
  const t2 = [['Aktivitet', 'Timer']].concat(Object.keys(d.typer).map(t => [t, d.typer[t]]));
  const t3 = [['Område'].concat(d.aktTyper)].concat(omrRows.map(o => [o.navn].concat(d.aktTyper.map(t => o.typer[t] || 0))));
  const t4 = [['Måned', 'Oprettet', 'Lukket']].concat(d.maaneder.map(m => [m.label, m.oprettet, m.lukket]));
  const skriv = (t, col) => rap.getRange(1, col, t.length, t[0].length).setValues(t);
  skriv(t1, 1); skriv(t2, 6); skriv(t3, 9); skriv(t4, 15);
  rap.getRange(1, 1, 1, 18).setFontWeight('bold');

  const r = (col, t) => rap.getRange(1, col, Math.max(t.length, 2), t[0].length);
  const farver = ['#1f4e79', '#2e86ab', '#59a96a', '#f2a541', '#c8553d', '#7b6d8d', '#4f5d75', '#9bc1bc', '#e07a5f'];
  // Hvert diagram laves for sig; et diagram uden data springes over i stedet for at stoppe rapporten
  const harSager = t1.length > 1, harTid = d.k.timer > 0;
  const diagrammer = [
    ['Fordeling på sagsområder', harSager, () => rap.newChart().asPieChart().addRange(rap.getRange(1, 1, t1.length, 2))
      .setTitle('Sager fordelt på område').setColors(farver).setPosition(20, 1, 0, 0).build()],
    ['Tidsforbrug pr. område', harTid, () => rap.newChart().asBarChart().addRange(r(9, t3)).setStacked()
      .setTitle('Estimerede timer pr. område og aktivitet').setColors(farver).setPosition(20, 8, 0, 0).build()],
    ['Hvad bruges tiden på', harTid, () => rap.newChart().asPieChart().addRange(r(6, t2))
      .setTitle('Hvad bruges tiden på (timer)').setColors(farver).setPosition(42, 1, 0, 0).build()],
    ['Udvikling over 12 måneder', harSager, () => rap.newChart().asColumnChart().addRange(r(15, t4))
      .setTitle('Oprettede og lukkede sager pr. måned').setColors(['#2e86ab', '#9aa0a6']).setPosition(42, 8, 0, 0).build()]
  ];
  const indsat = [];
  diagrammer.forEach(x => {
    if (!x[1]) return;
    try { rap.insertChart(x[2]()); indsat.push([x[0], rap.getCharts().slice(-1)[0]]); }
    catch (e) { console.warn('Diagram "' + x[0] + '" fejlede: ' + e); }
  });
  SpreadsheetApp.flush();

  // 2) Præsentationen
  const titel = 'Sagsrapport ' + fmt_(new Date(), 'yyyy-MM-dd');
  const pres = SlidesApp.create(titel);
  DriveApp.getFileById(pres.getId()).moveTo(DriveApp.getFolderById(prop_('RAPPORT_FOLDER_ID')));
  const W = pres.getPageWidth(), H = pres.getPageHeight();

  const forside = pres.getSlides()[0];
  forside.getPlaceholder(SlidesApp.PlaceholderType.CENTERED_TITLE).asShape().getText().setText('Sagsrapport – Juridisk afdeling');
  forside.getPlaceholder(SlidesApp.PlaceholderType.SUBTITLE).asShape().getText()
    .setText('Status pr. ' + fmt_(new Date(), 'd. MMMM yyyy'));

  const nyt = (overskrift) => {
    const s = pres.appendSlide(SlidesApp.PredefinedLayout.TITLE_ONLY);
    s.getPlaceholder(SlidesApp.PlaceholderType.TITLE).asShape().getText().setText(overskrift);
    return s;
  };

  // Nøgletal
  const kpi = nyt('Nøgletal');
  const kort = [['Sager i alt', d.k.total], ['Åbne', d.k.aabne], ['Lukkede', d.k.lukkede], ['Nye (intake)', d.k.nye],
    ['Overskredne frister', d.k.overskredet], ['Oprettet seneste 30 dage', d.k.oprettet30],
    ['Lukket seneste 30 dage', d.k.lukket30], ['Estimerede timer i alt', d.k.timer]];
  const kb = (W - 80) / 4, kh = 100;
  kort.forEach((x, i) => {
    const left = 40 + (i % 4) * kb, top = 110 + Math.floor(i / 4) * (kh + 20);
    const box = kpi.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, left + 5, top, kb - 10, kh);
    box.getFill().setSolidFill('#eef3f8'); box.getBorder().setTransparent();
    const tx = box.getText(); tx.setText(String(x[1]) + '\n' + x[0]);
    tx.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    tx.getRange(0, String(x[1]).length).getTextStyle().setFontSize(30).setBold(true).setForegroundColor('#1f4e79');
    tx.getRange(String(x[1]).length + 1, tx.asString().length - 1).getTextStyle().setFontSize(11).setForegroundColor('#4f5d75');
  });

  // Diagrammer (linket til Sagsregister → kan opdateres i Slides)
  indsat.forEach(x => {
    const s = nyt(x[0]);
    try { s.insertSheetsChart(x[1], 60, 90, W - 120, H - 120); }
    catch (e) { s.insertTextBox('Diagrammet kunne ikke indsættes: ' + e.message, 60, 100, W - 120, 60); }
  });

  // Åbne sager sorteret efter frist
  const aabne = d.sager.filter(s => s.status !== 'Lukket')
    .sort((a, b) => (a.frist || '9999') < (b.frist || '9999') ? -1 : 1).slice(0, 14);
  tabelSlide_(nyt('Åbne sager (nærmeste frister)'), W,
    [['Sagsnr', 'Titel', 'Område', 'Status', 'Ansvarlig', 'Frist']]
      .concat(aabne.map(s => [s.nr, s.titel, s.omraade, s.status, s.ansvarlig, s.frist || '–'])));

  // Mest tidskrævende sager
  const top = d.sager.slice().sort((a, b) => b.timer - a.timer).slice(0, 10);
  tabelSlide_(nyt('Mest tidskrævende sager (estimat)'), W,
    [['Sagsnr', 'Titel', 'Område', 'Mails', 'Dokumenter', 'Timer']]
      .concat(top.map(s => [s.nr, s.titel, s.omraade, s.mails, s.dok, s.timer])));

  const note = nyt('Om tallene');
  note.insertTextBox('Timer er estimater beregnet ud fra registrerede mails (tagget med [sagsnr] i emnefeltet) ' +
    'og dokumenter i sagernes mapper, vægtet med satserne i fanen "Indstillinger" i Sagsregister.\n\n' +
    'Diagrammerne er linket til Sagsregister og kan opdateres i Slides via diagrammets menu ("Opdater").',
    60, 100, W - 120, 200).getText().getTextStyle().setFontSize(14);

  pres.saveAndClose();
  return 'https://docs.google.com/presentation/d/' + pres.getId() + '/edit';
}

function tabelSlide_(slide, W, rows) {
  if (rows.length < 2) { slide.insertTextBox('Ingen sager.', 60, 100, 300, 40); return; }
  const tbl = slide.insertTable(rows.length, rows[0].length, 30, 85, W - 60, 20 * rows.length);
  rows.forEach((r, i) => r.forEach((v, j) => {
    const c = tbl.getCell(i, j);
    c.getText().setText(String(v === null || v === undefined ? '' : v));
    c.getText().getTextStyle().setFontSize(9).setBold(i === 0);
    if (i === 0) c.getFill().setSolidFill('#dfe8f1');
  }));
}

// ============================================================
// 7. HJÆLPEFUNKTIONER
// ============================================================

/** Læser et ID gemt af opsaetning(). */
function prop_(noegle) {
  const v = PropertiesService.getScriptProperties().getProperty(noegle);
  if (!v) throw new Error('Systemet er ikke sat op endnu. Vælg ⚖️ Sagsstyring → Opsætning (kør første gang).');
  return v;
}

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sh_(navn) {
  const ss = ss_();
  let sh = ss.getSheetByName(navn);
  if (!sh) { sikrFaner_(ss); sh = ss.getSheetByName(navn); }
  return sh;
}

/** Opretter manglende faneblade med overskrifter og standardværdier (hurtigt – ingen mapper). */
function sikrFaner_(ss) {
  if (!ss.getSheetByName(SH.SAGER)) {
    const forste = ss.getSheets()[0];
    const kanOmdoebes = forste.getRange(1, 1).getValue() === 'Sagsnr' || forste.getLastRow() === 0;
    if (kanOmdoebes) forste.setName(SH.SAGER);
    else ss.insertSheet(SH.SAGER);
    skrivOverskrifter_(ss.getSheetByName(SH.SAGER), COLS);
  }
  if (!ss.getSheetByName(SH.OMR)) {
    const o = ss.insertSheet(SH.OMR);
    skrivOverskrifter_(o, OMR_COLS);
    o.getRange(2, 1, DEFAULT_OMR.length, OMR_COLS.length).setValues(standardOmraadeRaekker_());
  }
  if (!ss.getSheetByName(SH.AKT)) skrivOverskrifter_(ss.insertSheet(SH.AKT), AKT_COLS);
  if (!ss.getSheetByName(SH.MAILS)) skrivOverskrifter_(ss.insertSheet(SH.MAILS), MAIL_COLS);
  if (!ss.getSheetByName(SH.IND)) {
    const i = ss.insertSheet(SH.IND);
    skrivOverskrifter_(i, ['Indstilling', 'Værdi']);
    const v = DEFAULT_IND.map(r => r[0] === IND.INTERNE ? [r[0], Session.getEffectiveUser().getEmail()] : r);
    i.getRange(2, 1, v.length, 2).setValues(v);
    i.autoResizeColumn(1);
  }
}
function kol_(navn) { return COLS.indexOf(navn) + 1; }
function kolBogstav_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function fmt_(d, p) { return d ? Utilities.formatDate(new Date(d), CFG.TZ, p || 'yyyy-MM-dd') : ''; }
function esc_(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function rens_(s) { return String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim(); }
function toast_(t) { ss_().toast(t, 'Sagsstyring', 5); }

function splitMails_(s) {
  return String(s || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => x.indexOf('@') > 0 || x.indexOf('.') > 0)
    .filter((x, i, a) => a.indexOf(x) === i);
}

function hentEllerOpret_(navn) { return ss_().getSheetByName(navn) || ss_().insertSheet(navn); }

function skrivOverskrifter_(sh, cols) {
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#dfe8f1');
  sh.setFrozenRows(1);
}

function tabel_(navn) {
  const sh = sh_(navn);
  const v = sh.getDataRange().getValues();
  const h = v.shift() || [];
  const rows = v.map((r, i) => {
    const o = { _row: i + 2 };
    h.forEach((k, j) => o[k] = r[j]);
    return o;
  }).filter(o => o[h[0]] !== '' && o[h[0]] !== null);
  return { sh: sh, headers: h, rows: rows };
}

function indstillinger_() {
  const o = {};
  DEFAULT_IND.forEach(r => o[r[0]] = r[1]);
  const sh = sh_(SH.IND);
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0]) o[r[0]] = r[1]; });
  return o;
}

function omraader_() {
  const sh = sh_(SH.OMR);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, OMR_COLS.length).getValues()
    .map((r, i) => ({ navn: String(r[0]).trim(), kode: String(r[1]).trim().toUpperCase(), mappeId: r[2], row: i + 2,
      under: String(r[4] || '').split(',').map(x => x.trim()).filter(String) }))
    .filter(o => o.navn && o.kode);
}

/** Sikrer at området har en mappe under "01 Sager" og returnerer mappe-ID. */
function sikrOmraadeMappe_(o) {
  if (o.mappeId) { try { DriveApp.getFolderById(o.mappeId); return o.mappeId; } catch (e) { /* slettet → opret igen */ } }
  const parent = DriveApp.getFolderById(prop_('SAGER_FOLDER_ID'));
  const it = parent.getFoldersByName(o.navn);
  const f = it.hasNext() ? it.next() : parent.createFolder(o.navn);
  sh_(SH.OMR).getRange(o.row, 3, 1, 2).setValues([[f.getId(), f.getUrl()]]);
  o.mappeId = f.getId();
  return o.mappeId;
}

/** Næste løbenummer pr. år på tværs af områder: KON-2026-0001, ANS-2026-0002, … */
function naesteNr_(kode) {
  const aar = fmt_(new Date(), 'yyyy');
  const props = PropertiesService.getScriptProperties();
  let max = Number(props.getProperty('SEQ_' + aar)) || 0;
  const sh = sh_(SH.SAGER);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat().forEach(v => {
      const m = String(v).match(/^[A-ZÆØÅ]+-(\d{4})-(\d+)$/);
      if (m && m[1] === aar) max = Math.max(max, Number(m[2]));
    });
  }
  const seq = max + 1;
  props.setProperty('SEQ_' + aar, String(seq));
  return kode + '-' + aar + '-' + ('000' + seq).slice(-4);
}

function findSag_(nr) {
  const t = tabel_(SH.SAGER);
  const s = t.rows.find(r => r['Sagsnr'] === nr);
  if (!s) throw new Error('Sagen findes ikke: ' + nr);
  return { sh: t.sh, row: s._row, sag: s };
}

function valgtSag_() {
  const sh = SpreadsheetApp.getActiveSheet();
  const r = sh.getActiveRange().getRow();
  if (sh.getName() !== SH.SAGER || r < 2) {
    SpreadsheetApp.getUi().alert('Markér en række i fanen "' + SH.SAGER + '" først.');
    return null;
  }
  return sh.getRange(r, kol_('Sagsnr')).getValue();
}

function undermappe_(mappe, navn) {
  const it = mappe.getFoldersByName(navn);
  return it.hasNext() ? it.next() : mappe.createFolder(navn);
}

function alleFiler_(mappe) {
  const ud = [];
  const fi = mappe.getFiles();
  while (fi.hasNext()) ud.push(fi.next());
  const mi = mappe.getFolders();
  while (mi.hasNext()) Array.prototype.push.apply(ud, alleFiler_(mi.next()));
  return ud;
}

/** Sagsnotat fra skabelon (pladsholdere som {{SAGSNR}}, {{TAG}}, {{TITEL}} …) eller standardlayout. */
function opretSagsnotat_(mappe, v) {
  const tpl = indstillinger_()[IND.SKABELON];
  let doc;
  if (tpl) {
    const f = DriveApp.getFileById(String(tpl).trim()).makeCopy(v.SAGSNR + ' Sagsnotat', mappe);
    doc = DocumentApp.openById(f.getId());
    Object.keys(v).forEach(k => doc.getBody().replaceText('\\{\\{' + k + '\\}\\}', v[k]));
  } else {
    doc = DocumentApp.create(v.SAGSNR + ' Sagsnotat');
    DriveApp.getFileById(doc.getId()).moveTo(mappe);
    const b = doc.getBody();
    b.appendParagraph(v.SAGSNR + ' – ' + v.TITEL).setHeading(DocumentApp.ParagraphHeading.TITLE);
    b.appendTable([
      ['Sagsnummer', v.SAGSNR], ['Mail-tag (skriv i emnefeltet)', v.TAG], ['Område', v.OMRAADE],
      ['Ansvarlig', v.ANSVARLIG], ['Klient/afdeling', v.KLIENT], ['Modpart', v.MODPART],
      ['Frist', v.FRIST], ['Oprettet', v.OPRETTET]
    ]);
    b.appendParagraph('Beskrivelse').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    b.appendParagraph(v.BESKRIVELSE || '');
    b.appendParagraph('Notater og beslutninger').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    b.appendParagraph(v.OPRETTET + ': Sag oprettet.');
    const forste = b.getChild(0);
    if (forste.getType() === DocumentApp.ElementType.PARAGRAPH && forste.asParagraph().getText() === '') b.removeChild(forste);
  }
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).setDescription('Sagsstyring:sagsnotat ' + v.SAGSNR);
  return doc.getUrl();
}
