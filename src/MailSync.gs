/**
 * Email and document sync.
 *
 * Email recognition – how the system finds the matter without anyone having to tag the email:
 *   Strong signals (filed automatically):
 *     1. The matter number in the subject (with or without [ ])
 *     2. A plus address in To/Cc, e.g. legal+COM-2026-0007@company.com
 *     3. The thread already carries the label Matters/<no>
 *     4. A reply to a filed email (In-Reply-To / References point to its Message-ID)
 *   Skipped: the "Private" label, excluded domains, newsletters, automated mail and Google
 *     system notifications (which often mention the matter number).
 *   Weak signals (suggestions in the user's own "Unfiled" queue): a matter's external contact,
 *     the same company domain, or a subject resembling the matter title.
 * Classification reads headers only. The body is fetched only when an email is filed.
 */

function syncAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const start = Date.now();
    const ctx = buildContext_();
    try { scanNewEmails_(ctx, start); } catch (e) { console.error('Scanning new emails failed: ' + e); }

    const synced = {};
    const cutoff = Date.now() - 30 * 864e5;
    // Least recently synced first, so every matter is covered across runs
    const matters = ctx.matters
      .filter(m => m['Status'] !== 'Closed' || !m['Closed'] || new Date(m['Closed']).getTime() > cutoff)
      .sort((a, b) => (a['Last sync'] ? new Date(a['Last sync']).getTime() : 0) - (b['Last sync'] ? new Date(b['Last sync']).getTime() : 0));

    for (const m of matters) {
      if (Date.now() - start > CFG.MAX_RUN_MS) break;
      try {
        syncMatterEmails_(ctx, m);
        synced[m['Matter no']] = syncDocuments_(ctx, m);
      } catch (e) {
        console.error('Sync failed for ' + m['Matter no'] + ': ' + e);
      }
    }
    flush_(ctx);
    updateCounts_(synced);
  } finally {
    lock.releaseLock();
  }
}

/** Shared data for one sync run: matters, already filed emails and settings. */
function buildContext_() {
  const settings = settings_();
  const act = sheet_(SHEETS.ACTIVITY);
  const iKey = ACTIVITY_COLS.indexOf('Key'), iNo = ACTIVITY_COLS.indexOf('Matter no');
  const seen = new Set(), midToMatter = {};
  if (act.getLastRow() > 1) {
    act.getRange(2, 1, act.getLastRow() - 1, ACTIVITY_COLS.length).getValues().forEach(r => {
      const k = String(r[iKey] || '');
      if (!k) return;
      seen.add(k);
      if (k.indexOf('MAIL:') === 0) midToMatter[k.slice(5)] = r[iNo];
    });
  }
  const matters = readTable_(SHEETS.MATTERS).rows.filter(m => m['Folder ID']);
  const byNo = {};
  matters.forEach(m => byNo[m['Matter no']] = m);
  return {
    settings: settings, seen: seen, midToMatter: midToMatter, matters: matters, byNo: byNo,
    activity: [], emails: [], folders: {}, labels: {},
    internal: splitEmails_(settings[SETTING.INTERNAL] || Session.getEffectiveUser().getEmail()),
    excluded: splitEmails_(settings[SETTING.EXCLUDED]),
    privateLabel: String(settings[SETTING.PRIVATE_LABEL] || 'Private').trim(),
    me: Session.getEffectiveUser().getEmail()
  };
}

/** Writes buffered Activity and Emails rows in one go. */
function flush_(ctx) {
  if (ctx.activity.length) {
    const sh = sheet_(SHEETS.ACTIVITY);
    sh.getRange(sh.getLastRow() + 1, 1, ctx.activity.length, ACTIVITY_COLS.length).setValues(ctx.activity);
    ctx.activity = [];
  }
  if (ctx.emails.length) {
    const sh = sheet_(SHEETS.EMAILS);
    sh.getRange(sh.getLastRow() + 1, 1, ctx.emails.length, EMAIL_COLS.length).setValues(ctx.emails);
    ctx.emails = [];
  }
}

/** Emails with the matter number in the subject, and every email in threads carrying the matter's label. */
function syncMatterEmails_(ctx, matter) {
  const no = matter['Matter no'];
  const label = matterLabel_(ctx, no);
  GmailApp.search('subject:"' + no + '"', 0, 100).forEach(t => {
    if (isPrivate_(ctx, t)) return;
    if (label) t.addLabel(label);
    t.getMessages().forEach(m => fileEmail_(ctx, matter, m, 'Matter no in subject'));
  });
  if (label) label.getThreads(0, 100).forEach(t => {
    if (isPrivate_(ctx, t)) return;
    t.getMessages().forEach(m => fileEmail_(ctx, matter, m, 'Thread'));
  });
}

/** Goes through new emails since the last run (per user) and files or suggests them. */
function scanNewEmails_(ctx, start) {
  const up = PropertiesService.getUserProperties();
  const now = Date.now();
  const all = up.getProperties();
  // Clean up keys from the earlier Danish version
  Object.keys(all).filter(k => /^(Q:|I:|SIDST_SCAN$)/.test(k)).forEach(k => up.deleteProperty(k));

  const from = Number(all.LAST_SCAN) || (now - CFG.FIRST_SCAN_DAYS * 864e5);
  const q = 'after:' + Math.floor((from - 3600 * 1000) / 1000) + ' -in:spam -in:trash -in:chats';
  const queue = readQueue_(all);
  const dismissed = new Set();
  Object.keys(all).forEach(k => {
    if (k.indexOf('X:') !== 0) return;
    if (now - Number(all[k]) > 90 * 864e5) up.deleteProperty(k); else dismissed.add(k.slice(2));
  });

  let page = 0, done = true;
  for (;;) {
    if (Date.now() - start > CFG.MAX_RUN_MS / 2) { done = false; break; }
    const threads = GmailApp.search(q, page * 50, 50);
    threads.forEach(t => {
      try { processThread_(ctx, t, queue, dismissed, up); } catch (e) { console.warn('Thread skipped: ' + e); }
    });
    if (threads.length < 50) break;
    page++;
  }
  if (done) up.setProperty('LAST_SCAN', String(now));
  trimQueue_(up, queue);
}

function processThread_(ctx, t, queue, dismissed, up) {
  if (isPrivate_(ctx, t)) return;
  const prefix = CFG.LABEL_ROOT + '/';
  const threadNo = t.getLabels().map(l => l.getName())
    .filter(n => n.indexOf(prefix) === 0 && ctx.byNo[n.slice(prefix.length)])
    .map(n => n.slice(prefix.length))[0] || '';

  t.getMessages().forEach(m => {
    const mid = messageId_(m);
    if (ctx.seen.has('MAIL:' + mid) || dismissed.has(mid) || queue[m.getId()] || isExcluded_(ctx, m)) return;
    const c = classify_(ctx, m, threadNo);
    if (!c) return;
    if (c.no) fileEmail_(ctx, ctx.byNo[c.no], m, c.source);
    else addToQueue_(up, queue, m, mid, c.suggestions);
  });
}

/** Returns {no, source} for a strong signal, {suggestions: […]} for weak signals, otherwise null. */
function classify_(ctx, m, threadNo) {
  if (isSystemEmail_(m)) return null;
  const numbers = (String(m.getSubject() || '').toUpperCase().match(MATTER_NO_RE) || []).filter(n => ctx.byNo[n]);
  if (numbers.length) return { no: numbers[0], source: 'Matter no in subject' };

  const addr = [m.getTo(), m.getCc(), m.getHeader('Delivered-To')].join(',').toUpperCase();
  const plus = (addr.match(/\+([A-Z]{2,5}-\d{4}-\d{4})@/) || [])[1];
  if (plus && ctx.byNo[plus]) return { no: plus, source: 'Plus address' };

  if (threadNo) return { no: threadNo, source: 'Thread' };

  const ref = references_(m).find(r => ctx.midToMatter[r] && ctx.byNo[ctx.midToMatter[r]]);
  if (ref) return { no: ctx.midToMatter[ref], source: 'Reply in matter thread' };

  if (isBulk_(m)) return null;
  const suggestions = suggest_(ctx, m);
  return suggestions.length ? { suggestions: suggestions } : null;
}

/** Weak signals against open matters opened before the email. At most 3 suggestions, best first. */
function suggest_(ctx, m) {
  const date = m.getDate().getTime();
  const own = a => ctx.internal.some(x => a.indexOf(x) >= 0);
  const addrs = addresses_([m.getFrom(), m.getTo(), m.getCc()].join(',')).filter(a => !own(a));
  const domains = addrs.map(a => a.split('@')[1]).filter(d => FREE_MAIL_DOMAINS.indexOf(d) < 0);
  const subjectWords = words_(m.getSubject());

  const out = [];
  ctx.matters.forEach(mt => {
    if (mt['Status'] === 'Closed' || (mt['Opened'] && new Date(mt['Opened']).getTime() > date)) return;
    const ext = addresses_(mt['External contacts']);
    let score = 0; const reasons = [];
    if (addrs.some(a => ext.indexOf(a) >= 0)) { score += 3; reasons.push('contact on the matter'); }
    else if (domains.some(d => ext.some(e => e.split('@')[1] === d))) { score += 2; reasons.push('same domain as a matter contact'); }
    const common = words_(mt['Title']).filter(w => subjectWords.indexOf(w) >= 0);
    if (common.length >= 2 || (common.length === 1 && score > 0)) { score += 2; reasons.push('subject resembles the matter title'); }
    if (score >= 2) out.push({ no: mt['Matter no'], title: mt['Title'], reason: reasons.join(' + '), score: score });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Files one email on the matter: PDF, original .eml and attachments in "01 Correspondence",
 * a Gmail label, and rows in Activity and Emails. The Message-ID ensures the same email in
 * several mailboxes is only counted once.
 */
function fileEmail_(ctx, matter, m, source) {
  const mid = messageId_(m);
  const key = 'MAIL:' + mid;
  if (!matter || ctx.seen.has(key)) return false;
  if (String(source).indexOf('Manual') !== 0 && isSystemEmail_(m)) return false;
  ctx.seen.add(key);
  const no = matter['Matter no'];
  ctx.midToMatter[mid] = no;

  const s = ctx.settings;
  const from = m.getFrom();
  const outgoing = ctx.internal.some(x => from.toLowerCase().indexOf(x) >= 0);
  const attachments = m.getAttachments({ includeInlineImages: false });
  const raw = m.getRawContent();
  let link = gmailSearchLink_(mid), pdfUrl = '', emlUrl = '';

  if (isYes_(s[SETTING.SAVE_PDF]) || isYes_(s[SETTING.SAVE_EML]) || isYes_(s[SETTING.SAVE_ATTACHMENTS])) {
    const folder = ctx.folders[no] = ctx.folders[no] || subfolder_(DriveApp.getFolderById(matter['Folder ID']), SUBFOLDERS.MAIL);
    const name = (fmt_(m.getDate(), 'yyyy-MM-dd HHmm') + ' – ' + cleanName_(from.replace(/<.*>/, '')) + ' – ' + cleanName_(m.getSubject())).substring(0, 150);
    if (isYes_(s[SETTING.SAVE_PDF])) {
      try {
        const f = folder.createFile(emailAsPdf_(m).setName(name + '.pdf'));
        f.setDescription('LegalMatters:email ' + mid);
        link = pdfUrl = f.getUrl();
      } catch (e) { console.warn('PDF failed: ' + e); }
    }
    if (isYes_(s[SETTING.SAVE_EML])) {
      try {
        const f = subfolder_(folder, EML_FOLDER).createFile(Utilities.newBlob(raw, 'message/rfc822', name + '.eml'));
        f.setDescription('LegalMatters:eml ' + mid);
        emlUrl = 'https://drive.google.com/uc?export=download&id=' + f.getId();   // downloaded and opened in a mail client
      } catch (e) { console.warn('.eml failed: ' + e); }
    }
    if (isYes_(s[SETTING.SAVE_ATTACHMENTS])) {
      attachments.forEach(a => {
        try { folder.createFile(a.copyBlob()).setDescription('LegalMatters:attachment ' + mid); } catch (e) { /* too large */ }
      });
    }
  }
  const label = matterLabel_(ctx, no);
  if (label) { try { m.getThread().addLabel(label); } catch (e) { /* ignore */ } }

  ctx.activity.push([m.getDate(), no, matter['Area'], outgoing ? ACT.EMAIL_OUT : ACT.EMAIL_IN, m.getSubject(), from, link, key, source]);
  ctx.emails.push([no, m.getDate(), outgoing ? 'Out' : 'In', from, m.getTo(), m.getCc(), m.getSubject(),
    attachments.map(a => a.getName()).join(', '), threadRoot_(m) || mid, mid, pdfUrl, emlUrl, source, ctx.me,
    Math.round(raw.length / 1024)]);
  return true;
}

function emailAsPdf_(m) {
  const html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11px}' +
    'table.h td{padding:2px 8px 2px 0;vertical-align:top}</style></head><body>' +
    '<h2>' + esc_(m.getSubject()) + '</h2><table class="h">' +
    '<tr><td><b>From</b></td><td>' + esc_(m.getFrom()) + '</td></tr>' +
    '<tr><td><b>To</b></td><td>' + esc_(m.getTo()) + '</td></tr>' +
    (m.getCc() ? '<tr><td><b>Cc</b></td><td>' + esc_(m.getCc()) + '</td></tr>' : '') +
    '<tr><td><b>Date</b></td><td>' + fmt_(m.getDate(), 'yyyy-MM-dd HH:mm') + '</td></tr>' +
    '<tr><td><b>Attachments</b></td><td>' + esc_(m.getAttachments().map(a => a.getName()).join(', ')) + '</td></tr>' +
    '</table><hr>' + (m.getBody() || esc_(m.getPlainBody())) + '</body></html>';
  try {
    return Utilities.newBlob(html, 'text/html', 'email.html').getAs('application/pdf');
  } catch (e) {
    const plain = html.replace(/<hr>[\s\S]*<\/body>/, '<hr><pre>' + esc_(m.getPlainBody()) + '</pre></body>');
    return Utilities.newBlob(plain, 'text/html', 'email.html').getAs('application/pdf');
  }
}

// ---------- documents and counts ----------

/** Registers files in the matter folder and returns the folder's total size in bytes. */
function syncDocuments_(ctx, matter) {
  const no = matter['Matter no'];
  let bytes = 0;
  allFiles_(DriveApp.getFolderById(matter['Folder ID'])).forEach(f => {
    bytes += f.getSize();
    const desc = f.getDescription() || '';
    // Email copies and the generated matter note are not documents
    if (/^LegalMatters:(email|eml|note) /.test(desc)) return;
    const id = f.getId();
    let owner = '';
    try { owner = f.getOwner() ? f.getOwner().getEmail() : ''; } catch (e) { /* shared drive */ }

    const added = 'DOC:' + id;
    if (!ctx.seen.has(added)) {
      ctx.seen.add(added);
      ctx.activity.push([f.getDateCreated(), no, matter['Area'], ACT.DOC_ADDED, f.getName(), owner, f.getUrl(), added, '']);
    }
    // One entry per day a Google file is edited
    const updated = f.getLastUpdated();
    if (String(f.getMimeType()).indexOf('application/vnd.google-apps') === 0 &&
        updated.getTime() - f.getDateCreated().getTime() > 10 * 60 * 1000) {
      const edited = 'EDIT:' + id + ':' + fmt_(updated, 'yyyyMMdd');
      if (!ctx.seen.has(edited)) {
        ctx.seen.add(edited);
        ctx.activity.push([updated, no, matter['Area'], ACT.DOC_EDITED, f.getName(), owner, f.getUrl(), edited, '']);
      }
    }
  });
  return bytes;
}

/**
 * Recounts emails and documents per matter from the Activity log, and stores the folder size
 * for the matters synced in this run (synced = {matterNo: bytes}).
 */
function updateCounts_(synced) {
  const sh = sheet_(SHEETS.MATTERS);
  if (sh.getLastRow() < 2) return;
  const counts = {};
  readTable_(SHEETS.ACTIVITY).rows.forEach(a => {
    const c = counts[a['Matter no']] = counts[a['Matter no']] || { emails: 0, docs: 0 };
    if (a['Type'] === ACT.EMAIL_IN || a['Type'] === ACT.EMAIL_OUT) c.emails++;
    if (a['Type'] === ACT.DOC_ADDED) c.docs++;
  });
  const first = col_('Emails');
  const nos = sh.getRange(2, col_('Matter no'), sh.getLastRow() - 1, 1).getValues().flat();
  const old = sh.getRange(2, first, nos.length, 4).getValues();
  const now = new Date();
  const out = nos.map((no, i) => {
    if (!no) return ['', '', '', ''];   // blank row – leave it blank
    const c = counts[no] || { emails: 0, docs: 0 };
    const isSynced = synced && synced[no] !== undefined;
    return [c.emails, c.docs, isSynced ? Math.round(synced[no] / 1048576 * 10) / 10 : old[i][2], isSynced ? now : old[i][3]];
  });
  sh.getRange(2, first, out.length, 4).setValues(out);
}

// ---------- "Unfiled": suggestions stored per user in User Properties (visible only to the owner) ----------

function readQueue_(all) {
  const q = {};
  Object.keys(all).forEach(k => {
    if (k.indexOf('U:') !== 0) return;
    try { q[k.slice(2)] = JSON.parse(all[k]); } catch (e) { /* corrupt entry */ }
  });
  return q;
}

function addToQueue_(up, queue, m, mid, suggestions) {
  const e = { id: m.getId(), mid: mid, date: m.getDate().toISOString(), from: m.getFrom(),
    subject: String(m.getSubject() || '').substring(0, 300),
    suggestions: suggestions.map(s => ({ no: s.no, title: s.title, reason: s.reason })) };
  up.setProperty('U:' + e.id, JSON.stringify(e));
  queue[e.id] = e;
}

function trimQueue_(up, queue) {
  Object.keys(queue).sort((a, b) => queue[a].date < queue[b].date ? 1 : -1)
    .slice(CFG.MAX_UNFILED).forEach(id => { up.deleteProperty('U:' + id); delete queue[id]; });
}

/** For the web app: the user's own suggestions plus open matters to choose from. */
function getUnfiled() {
  const q = readQueue_(PropertiesService.getUserProperties().getProperties());
  const items = Object.keys(q).map(id => Object.assign({ link: gmailSearchLink_(q[id].mid) }, q[id]))
    .sort((a, b) => a.date < b.date ? 1 : -1);
  const matters = readTable_(SHEETS.MATTERS).rows.filter(m => m['Status'] !== 'Closed')
    .map(m => ({ no: m['Matter no'], title: m['Title'] })).sort((a, b) => a.no < b.no ? 1 : -1);
  return { items: items, matters: matters };
}

/** Files the email – and the rest of its thread – on the matter. The label makes future replies follow. */
function fileToMatter(id, no) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ctx = buildContext_();
    const matter = ctx.byNo[no];
    if (!matter) throw new Error('Unknown matter: ' + no);
    const t = GmailApp.getMessageById(id).getThread();
    const source = 'Manual – ' + Session.getActiveUser().getEmail();
    let count = 0;
    t.getMessages().forEach(m => { if (fileEmail_(ctx, matter, m, source)) count++; });
    const label = matterLabel_(ctx, no);
    if (label) t.addLabel(label);
    flush_(ctx);
    updateCounts_({});
    const up = PropertiesService.getUserProperties();
    t.getMessages().forEach(m => up.deleteProperty('U:' + m.getId()));
    return { no: no, count: count };
  } finally {
    lock.releaseLock();
  }
}

/** Removes the suggestion and remembers it, so the email is not suggested again. */
function dismissSuggestion(id) {
  const up = PropertiesService.getUserProperties();
  const raw = up.getProperty('U:' + id);
  up.deleteProperty('U:' + id);
  if (raw) { try { up.setProperty('X:' + JSON.parse(raw).mid, String(Date.now())); } catch (e) { /* ignore */ } }
  return true;
}

// ---------- email list ----------

/** Filed emails for one matter (no) or all matters (no empty), newest first. */
function getEmails(no) {
  return readTable_(SHEETS.EMAILS).rows.filter(r => !no || r['Matter no'] === no).map(r => ({
    no: r['Matter no'], date: r['Date'] ? new Date(r['Date']).toISOString() : '', direction: r['Direction'],
    from: r['From'], to: r['To'], cc: r['Cc'], subject: r['Subject'], attachments: r['Attachments'],
    thread: r['Thread'], mid: r['Message-ID'], pdf: r['PDF'], eml: r['EML'], source: r['Source'],
    sizeKb: Number(r['Size (KB)']) || 0, gmail: /^TEST:|^DEMO:/.test(r['Message-ID']) ? '' : gmailSearchLink_(r['Message-ID'])
  })).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 2000);
}

/**
 * Full-text search in filed emails and attachments using Drive's own search, limited to the
 * matters' correspondence folders. Returns the matching Message-IDs.
 */
function searchEmailContent(no, query) {
  query = String(query || '').trim();
  if (query.length < 2) return [];
  const escaped = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const mids = new Set();
  readTable_(SHEETS.MATTERS).rows.filter(m => m['Folder ID'] && (!no || m['Matter no'] === no)).forEach(m => {
    try {
      const it = DriveApp.getFolderById(m['Folder ID']).getFoldersByName(SUBFOLDERS.MAIL);
      if (!it.hasNext()) return;
      const files = DriveApp.searchFiles("fullText contains '" + escaped + "' and '" + it.next().getId() + "' in parents and trashed = false");
      while (files.hasNext()) {
        const hit = String(files.next().getDescription() || '').match(/^LegalMatters:(?:email|eml|attachment) (.+)$/);
        if (hit) mids.add(hit[1].trim());
      }
    } catch (e) { console.warn('Search failed for ' + m['Matter no'] + ': ' + e); }
  });
  return Array.from(mids);
}

// ---------- small email helpers ----------

function messageId_(m) { return String(m.getHeader('Message-ID') || m.getId()).replace(/[<>]/g, '').trim(); }
function gmailSearchLink_(mid) { return 'https://mail.google.com/mail/u/0/#search/rfc822msgid%3A' + encodeURIComponent(mid); }

function references_(m) {
  const found = ((m.getHeader('In-Reply-To') || '') + ' ' + (m.getHeader('References') || '')).match(/<[^>]+>/g) || [];
  return found.map(r => r.slice(1, -1).trim());
}

/** The thread's first email (the root in References), so a conversation groups across mailboxes. */
function threadRoot_(m) {
  const r = (m.getHeader('References') || '').match(/<[^>]+>/) || (m.getHeader('In-Reply-To') || '').match(/<[^>]+>/);
  return r ? r[0].slice(1, -1).trim() : '';
}

function addresses_(s) {
  return (String(s || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(a => a.toLowerCase());
}

function words_(s) {
  return String(s || '').toLowerCase().replace(/^(\s*(re|sv|fw|fwd|vs)\s*:\s*)+/i, '')
    .split(/[^a-zæøå0-9]+/).filter(w => w.length >= 5);
}

function isPrivate_(ctx, t) { return t.getLabels().some(l => l.getName() === ctx.privateLabel); }

function isExcluded_(ctx, m) {
  if (!ctx.excluded.length) return false;
  const a = addresses_(m.getFrom()).join(' ');
  return ctx.excluded.some(x => a.indexOf(x) >= 0);
}

function isBulk_(m) {
  return !!m.getHeader('List-Unsubscribe') || /bulk|list|junk/i.test(m.getHeader('Precedence') || '') ||
    /no-?reply|do-?not-?reply|mailer-daemon|notifications?@/i.test(m.getFrom());
}

/** Automated notifications from Google (sharing, comments, calendar) – they mention the matter number but are not matter emails. */
function isSystemEmail_(m) {
  return /(no-?reply|notification)[^@]*@(docs\.|calendar\.)?google\.com/i.test(m.getFrom());
}

function matterLabel_(ctx, no) {
  if (ctx.labels[no] !== undefined) return ctx.labels[no];
  const name = CFG.LABEL_ROOT + '/' + no;
  try { ctx.labels[no] = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); } catch (e) { ctx.labels[no] = null; }
  return ctx.labels[no];
}
