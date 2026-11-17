/**
 * Menu, one-time setup, triggers and sheet structure.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚖️ Matters')
    .addItem('New matter…', 'showNewMatter')
    .addItem('Open dashboard', 'showDashboard')
    .addSeparator()
    .addItem('Show email tag for selected matter', 'showTagForSelected')
    .addItem('Close selected matter', 'closeSelected')
    .addItem('Reopen selected matter', 'reopenSelected')
    .addItem('Share selected matter with a colleague…', 'shareSelected')
    .addSeparator()
    .addItem('Sync emails and documents now', 'syncAll')
    .addItem('Create Slides report', 'createReportFromMenu')
    .addSeparator()
    .addItem('Enable automatic email sync for me', 'installSyncTrigger')
    .addItem('Setup (run first)', 'setup')
    .addSubMenu(ui.createMenu('Demo')
      .addItem('Create demo matters', 'createDemoMatters')
      .addItem('Delete demo matters', 'deleteDemoMatters')
      .addItem('Reset areas to defaults', 'resetAreas'))
    .addToUi();
}

/**
 * Creates sheets, default areas and settings, finds or creates the folder structure next to
 * the spreadsheet and installs the sync trigger. Safe to run again.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());

  // Root folder: the folder above "00 System" if the sheet lives there, otherwise the sheet's own folder
  const sheetFolder = DriveApp.getFileById(ss.getId()).getParents().next();
  const root = sheetFolder.getName() === SYSTEM_FOLDER && sheetFolder.getParents().hasNext()
    ? sheetFolder.getParents().next() : sheetFolder;
  props.setProperty('ROOT_FOLDER_ID', root.getId());
  Object.keys(MAIN_FOLDERS).forEach(k => props.setProperty(k, subfolder_(root, MAIN_FOLDERS[k]).getId()));

  ensureSheets_(ss);
  [[SHEETS.MATTERS, MATTER_COLS], [SHEETS.AREAS, AREA_COLS], [SHEETS.ACTIVITY, ACTIVITY_COLS],
    [SHEETS.EMAILS, EMAIL_COLS]].forEach(x => writeHeaders_(ss.getSheetByName(x[0]), x[1]));

  // Settings: add any missing keys without overwriting existing values
  const st = ss.getSheetByName(SHEETS.SETTINGS);
  writeHeaders_(st, ['Setting', 'Value']);
  const existing = st.getLastRow() > 1 ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().flat() : [];
  DEFAULT_SETTINGS.filter(r => existing.indexOf(r[0]) < 0).forEach(r => {
    st.appendRow(r[0] === SETTING.INTERNAL ? [r[0], Session.getEffectiveUser().getEmail()] : r);
  });
  st.autoResizeColumn(1);

  formatMattersSheet_(ss);
  try { GmailApp.getUserLabelByName(CFG.LABEL_ROOT) || GmailApp.createLabel(CFG.LABEL_ROOT); } catch (e) { /* Gmail not available */ }
  installSyncTrigger(true);

  try {
    SpreadsheetApp.getUi().alert('Setup complete',
      'Sheets, folders and automatic sync (every 15 minutes) are ready.\n\n' +
      'Tip: Demo → Create demo matters fills the system with sample data.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { console.log('Setup complete.'); }   // run from the editor
}

/** Creates any missing system sheets with headers and default values (fast – no folders). */
function ensureSheets_(ss) {
  const add = (name, cols) => { if (!ss.getSheetByName(name)) writeHeaders_(ss.insertSheet(name), cols); };
  add(SHEETS.MATTERS, MATTER_COLS);
  if (!ss.getSheetByName(SHEETS.AREAS)) {
    const a = ss.insertSheet(SHEETS.AREAS);
    writeHeaders_(a, AREA_COLS);
    a.getRange(2, 1, DEFAULT_AREAS.length, AREA_COLS.length).setValues(defaultAreaRows_());
  }
  add(SHEETS.ACTIVITY, ACTIVITY_COLS);
  add(SHEETS.EMAILS, EMAIL_COLS);
  if (!ss.getSheetByName(SHEETS.SETTINGS)) {
    const s = ss.insertSheet(SHEETS.SETTINGS);
    writeHeaders_(s, ['Setting', 'Value']);
    const v = DEFAULT_SETTINGS.map(r => r[0] === SETTING.INTERNAL ? [r[0], Session.getEffectiveUser().getEmail()] : r);
    s.getRange(2, 1, v.length, 2).setValues(v);
    s.autoResizeColumn(1);
  }
}

/** Drop-downs, date formats and conditional formatting on the Matters sheet. */
function formatMattersSheet_(ss) {
  const sh = ss.getSheetByName(SHEETS.MATTERS);
  const n = sh.getMaxRows() - 1;
  const list = values => SpreadsheetApp.newDataValidation().requireValueInList(values, true).build();
  sh.getRange(2, col_('Status'), n).setDataValidation(list(STATUSES));
  sh.getRange(2, col_('Priority'), n).setDataValidation(list(PRIORITIES));
  sh.getRange(2, col_('Area'), n).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(SHEETS.AREAS).getRange('A2:A'), true).build());
  ['Opened', 'Deadline', 'Closed'].forEach(c => sh.getRange(2, col_(c), n).setNumberFormat('yyyy-mm-dd'));
  sh.getRange(2, col_('Last sync'), n).setNumberFormat('yyyy-mm-dd hh:mm');
  sh.setFrozenColumns(2);
  const status = colLetter_(col_('Status'));
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + status + '2="Closed"')
      .setFontColor('#9aa0a6').setRanges([sh.getRange(2, 1, n, MATTER_COLS.length)]).build()
  ]);
}

/** Each team member runs this once so that their own Gmail is synced to the matters. */
function installSyncTrigger(quiet) {
  ScriptApp.getProjectTriggers()
    .filter(t => ['syncAll', 'synkroniser'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(15).create();
  if (quiet !== true) SpreadsheetApp.getUi().alert('Your Gmail and the matter folders are now synced every 15 minutes.');
}

/** Simple trigger: when the status is edited in the sheet, set/clear the closing date and log it. */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== SHEETS.MATTERS || e.range.getColumn() !== col_('Status') || e.range.getRow() < 2) return;
  const row = e.range.getRow();
  const status = e.range.getValue();
  sh.getRange(row, col_('Closed')).setValue(status === 'Closed' ? new Date() : '');
  // Simple triggers may not use openById → use e.source
  e.source.getSheetByName(SHEETS.ACTIVITY).appendRow([new Date(), sh.getRange(row, col_('Matter no')).getValue(),
    sh.getRange(row, col_('Area')).getValue(), ACT.STATUS, 'Status → ' + status, '', '', '', '']);
}
