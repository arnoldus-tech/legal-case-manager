/**
 * Matters: intake, status changes, sharing and the matter note.
 */

/**
 * Opens a new matter: unique number, folder structure, matter note, sharing and Gmail label.
 * @param {Object} d {title, area, subArea, status, priority, owner, team, external, client, deadline, description}
 *   external = the counterparty's email addresses; used only to recognise their emails, never shared with
 */
function createMatter(d) {
  d = d || {};
  if (!d.title || !d.area) throw new Error('Title and area are required.');
  const area = areas_().find(a => a.name === d.area);
  if (!area) throw new Error('Unknown area: ' + d.area);
  if (area.subs.length && area.subs.indexOf(d.subArea) < 0) throw new Error('Choose a sub-area for ' + area.name + '.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const no = nextMatterNo_(area.code);
    const tag = '[' + no + ']';
    const now = new Date();
    const owner = (d.owner || Session.getActiveUser().getEmail() || '').trim();

    // Folders
    const folder = DriveApp.getFolderById(ensureAreaFolder_(area)).createFolder(no + ' – ' + d.title);
    folder.setDescription('Legal Matters: ' + no + ' | ' + d.title);
    Object.keys(SUBFOLDERS).forEach(k => folder.createFolder(SUBFOLDERS[k]));

    // Sharing: the team gets the whole matter. The folder is never shared with its owner –
    // that only triggers a pointless notification email.
    const me = Session.getEffectiveUser().getEmail().toLowerCase();
    const failed = [];
    splitEmails_([owner, d.team].join(',')).filter(m => m !== me)
      .forEach(m => { try { folder.addEditor(m); } catch (e) { failed.push(m); } });

    const noteUrl = createMatterNote_(folder, {
      MATTER_NO: no, TAG: tag, TITLE: d.title, AREA: area.name + (d.subArea ? ' – ' + d.subArea : ''), OWNER: owner,
      CLIENT: d.client || '', DEADLINE: d.deadline || '', DESCRIPTION: d.description || '', OPENED: fmt_(now)
    });
    try { GmailApp.createLabel(CFG.LABEL_ROOT + '/' + no); } catch (e) { /* may already exist */ }

    const row = {
      'Matter no': no, 'Title': d.title, 'Area': area.name, 'Sub-area': area.subs.length ? d.subArea : '',
      'Status': d.status || 'Open', 'Priority': d.priority || 'Normal', 'Owner': owner, 'Team': d.team || '',
      'External contacts': d.external || '', 'Client/department': d.client || '', 'Opened': now,
      'Deadline': d.deadline ? new Date(d.deadline) : '', 'Closed': '', 'Folder': folder.getUrl(),
      'Folder ID': folder.getId(), 'Description': d.description || '',
      'Emails': 0, 'Documents': 0, 'Size (MB)': 0, 'Last sync': '', 'Requester': d.requester || ''
    };
    const sh = sheet_(SHEETS.MATTERS);
    sh.appendRow(MATTER_COLS.map(c => row[c]));
    formatMatterRow_(sh, sh.getLastRow());
    sheet_(SHEETS.ACTIVITY).appendRow([now, no, area.name, ACT.OPENED, 'Matter opened: ' + d.title, owner, folder.getUrl(), '', '']);

    return { no: no, tag: tag, folderUrl: folder.getUrl(), noteUrl: noteUrl, failed: failed };
  } finally {
    lock.releaseLock();
  }
}

function setStatus(no, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Invalid status: ' + status);
  const m = findMatter_(no);
  m.sh.getRange(m.row, col_('Status')).setValue(status);
  m.sh.getRange(m.row, col_('Closed')).setValue(status === 'Closed' ? new Date() : '');
  sheet_(SHEETS.ACTIVITY).appendRow([new Date(), no, m.matter['Area'], ACT.STATUS, 'Status → ' + status,
    Session.getActiveUser().getEmail(), '', '', '']);
  return true;
}

/** Shares the whole matter folder with a colleague and adds them to the team. */
function shareMatter(no, email) {
  const m = findMatter_(no);
  const folder = DriveApp.getFolderById(m.matter['Folder ID']);
  folder.addEditor(email.trim());
  const current = String(m.matter['Team'] || '');
  m.sh.getRange(m.row, col_('Team')).setValue(current ? current + ', ' + email.trim() : email.trim());
  return folder.getUrl();
}

// ---------- menu actions on the selected row ----------

function showNewMatter() { showApp_('new', 'New matter', 780, 840); }
function showDashboard() { showApp_('dashboard', 'Legal Matters', 1320, 900); }

function showTagForSelected() {
  const no = selectedMatter_(); if (!no) return;
  SpreadsheetApp.getUi().alert('Email tag', 'Optional – put this anywhere in the subject line:\n\n[' + no + ']',
    SpreadsheetApp.getUi().ButtonSet.OK);
}
function closeSelected() { const no = selectedMatter_(); if (no) { setStatus(no, 'Closed'); toast_(no + ' closed.'); } }
function reopenSelected() { const no = selectedMatter_(); if (no) { setStatus(no, 'Open'); toast_(no + ' reopened.'); } }
function shareSelected() {
  const no = selectedMatter_(); if (!no) return;
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Share ' + no + ' with a colleague', 'Email (Google account). The colleague gets edit access to the matter folder.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK || !res.getResponseText()) return;
  shareMatter(no, res.getResponseText());
  toast_('Shared with ' + res.getResponseText());
}

function selectedMatter_() {
  const sh = SpreadsheetApp.getActiveSheet();
  const r = sh.getActiveRange().getRow();
  if (sh.getName() !== SHEETS.MATTERS || r < 2) {
    SpreadsheetApp.getUi().alert('Select a row in the "' + SHEETS.MATTERS + '" sheet first.');
    return null;
  }
  return sh.getRange(r, col_('Matter no')).getValue();
}

// ---------- helpers ----------

/** Date formats on one matter row (appended rows do not always inherit the column format). */
function formatMatterRow_(sh, row) {
  ['Opened', 'Deadline', 'Closed'].forEach(c => sh.getRange(row, col_(c)).setNumberFormat('yyyy-mm-dd'));
  sh.getRange(row, col_('Last sync')).setNumberFormat('yyyy-mm-dd hh:mm');
}

function findMatter_(no) {
  const t = readTable_(SHEETS.MATTERS);
  const m = t.rows.find(r => r['Matter no'] === no);
  if (!m) throw new Error('Matter not found: ' + no);
  return { sh: t.sh, row: m._row, matter: m };
}

/** Next running number per year across areas: COM-2026-0001, EMP-2026-0002, … */
function nextMatterNo_(code) {
  const year = fmt_(new Date(), 'yyyy');
  const props = PropertiesService.getScriptProperties();
  let max = Number(props.getProperty('SEQ:' + year)) || 0;
  const sh = sheet_(SHEETS.MATTERS);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat().forEach(v => {
      const m = String(v).match(/^[A-Z]+-(\d{4})-(\d+)$/);
      if (m && m[1] === year) max = Math.max(max, Number(m[2]));
    });
  }
  props.setProperty('SEQ:' + year, String(max + 1));
  return code + '-' + year + '-' + ('000' + (max + 1)).slice(-4);
}

/** Ensures the area has a folder under "01 Matters" and returns its ID. */
function ensureAreaFolder_(area) {
  if (area.folderId) { try { DriveApp.getFolderById(area.folderId); return area.folderId; } catch (e) { /* deleted → recreate */ } }
  const f = subfolder_(DriveApp.getFolderById(prop_('MATTERS_FOLDER_ID')), area.name);
  sheet_(SHEETS.AREAS).getRange(area.row, 3, 1, 2).setValues([[f.getId(), f.getUrl()]]);
  area.folderId = f.getId();
  return area.folderId;
}

/** Matter note from a template (placeholders like {{MATTER_NO}}, {{TAG}}, {{TITLE}} …) or a default layout. */
function createMatterNote_(folder, v) {
  const template = String(settings_()[SETTING.NOTE_TEMPLATE] || '').trim();
  let doc;
  if (template) {
    const f = DriveApp.getFileById(template).makeCopy(v.MATTER_NO + ' Matter note', folder);
    doc = DocumentApp.openById(f.getId());
    Object.keys(v).forEach(k => doc.getBody().replaceText('\\{\\{' + k + '\\}\\}', v[k]));
  } else {
    doc = DocumentApp.create(v.MATTER_NO + ' Matter note');
    DriveApp.getFileById(doc.getId()).moveTo(folder);
    const b = doc.getBody();
    b.appendParagraph(v.MATTER_NO + ' – ' + v.TITLE).setHeading(DocumentApp.ParagraphHeading.TITLE);
    b.appendTable([
      ['Matter number', v.MATTER_NO], ['Email tag (optional)', v.TAG], ['Area', v.AREA], ['Owner', v.OWNER],
      ['Client/department', v.CLIENT], ['Deadline', v.DEADLINE], ['Opened', v.OPENED]
    ]);
    b.appendParagraph('Description').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    b.appendParagraph(v.DESCRIPTION || '');
    b.appendParagraph('Notes and decisions').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    b.appendParagraph(v.OPENED + ': Matter opened.');
    const first = b.getChild(0);
    if (first.getType() === DocumentApp.ElementType.PARAGRAPH && first.asParagraph().getText() === '') b.removeChild(first);
  }
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).setDescription('LegalMatters:note ' + v.MATTER_NO);
  return doc.getUrl();
}
