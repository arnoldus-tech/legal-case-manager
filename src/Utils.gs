/**
 * Shared helpers: spreadsheet access, settings, formatting and Drive utilities.
 */

/** Reads an ID stored by setup(). */
function prop_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('The system is not set up yet. Choose ⚖️ Matters → Setup (run first).');
  return v;
}

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Returns the sheet, creating the system's sheets first if any are missing. */
function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { ensureSheets_(ss); sh = ss.getSheetByName(name); }
  return sh;
}

function col_(name) { return MATTER_COLS.indexOf(name) + 1; }

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function fmt_(d, pattern) { return d ? Utilities.formatDate(new Date(d), CFG.TIMEZONE, pattern || 'yyyy-MM-dd') : ''; }
function esc_(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function cleanName_(s) { return String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim(); }
function toast_(t) { ss_().toast(t, 'Legal Matters', 5); }
function isYes_(v) { return /^(yes|ja|true|y)$/i.test(String(v).trim()); }

/** Email addresses or domains from a comma/semicolon/space-separated string, lower-case and unique. */
function splitEmails_(s) {
  return String(s || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase())
    .filter(x => x.indexOf('@') > 0 || x.indexOf('.') > 0)
    .filter((x, i, a) => a.indexOf(x) === i);
}

function getOrCreateSheet_(name) { return ss_().getSheetByName(name) || ss_().insertSheet(name); }

function writeHeaders_(sh, cols) {
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#e3e9f2');
  sh.setFrozenRows(1);
}

/** Reads a sheet into objects keyed by header. Rows with an empty first column are skipped. */
function readTable_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift() || [];
  const rows = values.map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => o[h] = r[j]);
    return o;
  }).filter(o => o[headers[0]] !== '' && o[headers[0]] !== null);
  return { sh: sh, headers: headers, rows: rows };
}

/**
 * Rewrites the data rows of a sheet: keeps the rows that have a value in the first column (and pass
 * the optional filter), closes any gaps and clears everything else – including columns beyond width
 * left over from an earlier layout.
 */
function compactSheet_(sh, width, keepRow) {
  const lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), width);
  if (lastRow < 2) return;
  const all = sh.getRange(2, 1, lastRow - 1, width).getValues();
  const keep = all.filter(r => r[0] !== '' && r[0] !== null && (!keepRow || keepRow(r)));
  sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
}

function settings_() {
  const o = {};
  DEFAULT_SETTINGS.forEach(r => o[r[0]] = r[1]);
  const sh = sheet_(SHEETS.SETTINGS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0]) o[r[0]] = r[1]; });
  return o;
}

/** Matter areas from the Areas sheet, including their sub-areas. */
function areas_() {
  const sh = sheet_(SHEETS.AREAS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, AREA_COLS.length).getValues()
    .map((r, i) => ({
      name: String(r[0]).trim(), code: String(r[1]).trim().toUpperCase(), folderId: r[2], row: i + 2,
      subs: String(r[4] || '').split(',').map(x => x.trim()).filter(String)
    }))
    .filter(a => a.name && a.code);
}

function defaultAreaRows_() { return DEFAULT_AREAS.map(a => [a[0], a[1], '', '', a[2]]); }

function subfolder_(folder, name) {
  const it = folder.getFoldersByName(name);
  return it.hasNext() ? it.next() : folder.createFolder(name);
}

function allFiles_(folder) {
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext()) out.push(files.next());
  const folders = folder.getFolders();
  while (folders.hasNext()) Array.prototype.push.apply(out, allFiles_(folders.next()));
  return out;
}
