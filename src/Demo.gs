/**
 * Demo data: creates matters with random area, status, dates and simulated emails and documents.
 * All demo matters have "DEMO – " in Client/department and can be removed with deleteDemoMatters().
 * Contacts use example.com domains; nothing refers to real organisations.
 */

/** Titles per area code. For areas with sub-areas the titles are grouped by sub-area. */
const DEMO_TITLES = {
  CAP: ['Company announcement – guidance update', 'Insider list – acquisition project', 'Share buy-back programme 2026', 'Delayed disclosure assessment (MAR art. 17)', 'Managers\' transactions notification'],
  CORP: ['Capital increase in subsidiary', 'Liquidation of dormant entity', 'Signing authority – subsidiaries', 'Parent company guarantee to bank', 'Merger of two subsidiaries'],
  GOV: ['AGM 2027 – agenda and proxies', 'Remuneration report 2026', 'Board rules of procedure update', 'Board evaluation', 'Corporate governance statement'],
  MA: ['Acquisition of software company – due diligence', 'Joint venture in Poland', 'Divestment of business unit', 'Letter of intent – target in Germany', 'Post-merger integration'],
  COM: {
    'Sales': ['Customer contract – defence ministry', 'Bid for public tender', 'Distribution agreement – Nordics', 'General terms of sale update', 'Warranty claim from customer'],
    'Procurement': ['Framework agreement with subcontractor', 'Consultancy agreement – project management', 'Warehouse lease – Aarhus', 'Supply agreement – electronic components', 'Purchasing terms update'],
    'Collaboration': ['Teaming agreement – consortium', 'MoU on industrial cooperation', 'Research collaboration with university', 'Partnership agreement – development project', 'Consortium agreement – EU project']
  },
  IT: ['SaaS agreement – new HR system', 'Cloud migration – contract terms', 'IT operations outsourcing', 'Licence audit', 'ERP implementation agreement'],
  IP: {
    'Patents & designs': ['Patent application – radar technology', 'Employee invention agreement', 'Design registration – new product line'],
    'Trademarks & domains': ['EU trademark registration', 'Trademark infringement', 'Domain name dispute'],
    'Licensing & know-how': ['Out-licensing of own technology', 'Know-how transfer to subsidiary', 'Software module licence'],
    'NDAs': ['NDA – potential partner', 'NDA – supplier dialogue', 'NDA – acquisition target', 'Mutual NDA – customer']
  },
  EMP: ['Termination – salaried employee', 'Executive service agreement', 'Incentive programme – warrants', 'Non-compete on departure', 'Employee handbook update'],
  DATA: ['Data processing agreement – payroll system', 'Personal data breach', 'DPIA – new CRM', 'Data subject access request', 'NIS2 gap analysis'],
  EXP: ['Export licence – delivery to Asia', 'Dual-use classification of product', 'ITAR assessment of component', 'Sanctions screening of new customer', 'Internal export control procedure'],
  CMP: ['Whistleblower report', 'Anti-corruption policy update', 'Internal investigation – travel expenses', 'Agent due diligence', 'Supplier code of conduct'],
  ANT: ['Cooperation with competitor on tender', 'Merger filing', 'Trade association meeting – guidelines', 'Exclusivity clause assessment', 'Dawn raid preparedness'],
  ESG: ['CSRD – double materiality assessment', 'Supply chain due diligence', 'Green claims in marketing', 'Climate targets – legal review', 'Human rights policy'],
  DIS: ['Customer complaint', 'Damages claim against supplier', 'Debt collection – unpaid invoice', 'Settlement negotiation', 'Insurance claim – warehouse damage'],
  GEN: ['General advice – marketing', 'Powers of attorney for management', 'Insurance programme review', 'Template update', 'Legal input to annual report']
};
const DEMO_DEPARTMENTS = ['Procurement', 'HR', 'Sales', 'Finance', 'Executive management', 'IT', 'Marketing', 'Facilities', 'Engineering'];
const DEMO_CONTACTS = ['j.holm@lawfirm.example.com', 'contracts@nordlog.example.com', 'legal@datasecure.example.com',
  'purchasing@customer.example.com', 'm.lund@partner.example.com', 'counsel@supplier.example.com'];
const DEMO_ATTACHMENTS = ['', '', '', 'Draft_v2.docx', 'Agreement_final.pdf', 'Annex 1 – Specification.pdf', 'Comments.docx', 'Term sheet.pdf'];
const DEMO_FOLLOWUPS = ['Comments on draft', 'Follow-up', 'Questions on terms', 'Meeting invitation', 'Signed version'];

function createDemoMatters() {
  const start = Date.now();
  const areas = areas_();
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const now = new Date();
  const daysAgo = n => new Date(now.getTime() - n * 864e5);
  const me = Session.getEffectiveUser().getEmail();
  const activity = [], emails = [], sizes = {};
  let created = 0;

  for (let i = 0; i < 30; i++) {
    if (Date.now() - start > CFG.MAX_RUN_MS) break;   // stay within Apps Script's 6-minute limit
    const area = pick(areas);
    const sub = area.subs.length ? pick(area.subs) : '';
    const pool = DEMO_TITLES[area.code] || DEMO_TITLES.GEN;
    const title = pick(Array.isArray(pool) ? pool : (pool[sub] || Object.values(pool)[0]));
    const r = Math.random();
    const status = r < 0.10 ? 'New' : r < 0.60 ? 'Open' : r < 0.75 ? 'On hold' : 'Closed';
    const age = 5 + Math.floor(Math.random() * 350);
    const opened = daysAgo(age);
    const closed = status === 'Closed' ? daysAgo(Math.floor(Math.random() * age)) : '';
    const deadline = status === 'Closed' ? '' : fmt_(daysAgo(-Math.floor(Math.random() * 60) + 10));

    const res = createMatter({
      title: title, area: area.name, subArea: sub, status: status, priority: pick(['High', 'Normal', 'Normal', 'Low']),
      client: CFG.DEMO_PREFIX + pick(DEMO_DEPARTMENTS), deadline: deadline, description: 'Demo matter created automatically.'
    });
    const m = findMatter_(res.no);
    m.sh.getRange(m.row, col_('Opened')).setValue(opened);
    if (closed) m.sh.getRange(m.row, col_('Closed')).setValue(closed);

    // Simulated emails in 1–3 conversations, and documents
    const end = closed ? closed.getTime() : now.getTime();
    const when = () => new Date(opened.getTime() + Math.random() * (end - opened.getTime()));
    const contact = pick(DEMO_CONTACTS);
    const threads = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, (x, j) => ({
      id: 'DEMO-THREAD:' + res.no + ':' + j, subject: res.tag + ' ' + (j === 0 ? title : pick(DEMO_FOLLOWUPS)) }));
    const nIn = Math.floor(Math.random() * 25), nOut = Math.floor(Math.random() * 15), nDocs = Math.floor(Math.random() * 8);
    for (let k = 0; k < nIn + nOut; k++) {
      const out = k >= nIn, t = when(), th = pick(threads), mid = 'DEMO:' + res.no + ':' + k;
      activity.push([t, res.no, area.name, out ? ACT.EMAIL_OUT : ACT.EMAIL_IN, th.subject, out ? me : contact, '', 'MAIL:' + mid, 'Demo']);
      emails.push([res.no, t, out ? 'Out' : 'In', out ? me : contact, out ? contact : me, '', (k ? 'Re: ' : '') + th.subject,
        pick(DEMO_ATTACHMENTS), th.id, mid, '', '', 'Demo', me, 20 + Math.floor(Math.random() * 400)]);
    }
    for (let k = 0; k < nDocs; k++) {
      activity.push([when(), res.no, area.name, ACT.DOC_ADDED, pick(['Draft', 'Annex', 'Memo', 'Signed agreement', 'Board paper']),
        me, '', 'DOC:DEMO:' + res.no + ':' + k, 'Demo']);
    }
    sizes[res.no] = Math.round(((nIn + nOut) * 0.15 + nDocs * 0.8 + Math.random()) * 1048576);
    created++;
  }

  const write = (name, width, rows) => {
    if (!rows.length) return;
    const sh = sheet_(name);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, width).setValues(rows);
  };
  write(SHEETS.ACTIVITY, ACTIVITY_COLS.length, activity);
  write(SHEETS.EMAILS, EMAIL_COLS.length, emails);
  updateCounts_(sizes);
  try { SpreadsheetApp.getUi().alert(created + ' demo matters created.' + (created < 30 ? ' Run it again to create the rest.' : '')); }
  catch (e) { console.log(created + ' demo matters created.'); }
}

/** Removes all demo matters: folders go to the trash, rows in Matters, Activity and Emails are deleted. */
function deleteDemoMatters() {
  const t = readTable_(SHEETS.MATTERS);
  const demo = t.rows.filter(m => String(m['Client/department']).indexOf(CFG.DEMO_PREFIX) === 0);
  const nos = new Set(demo.map(m => m['Matter no']));
  demo.forEach(m => {
    try { DriveApp.getFolderById(m['Folder ID']).setTrashed(true); } catch (e) { /* already gone */ }
    try { const l = GmailApp.getUserLabelByName(CFG.LABEL_ROOT + '/' + m['Matter no']); if (l) l.deleteLabel(); } catch (e) { /* ignore */ }
  });
  removeRows_(t.sh, MATTER_COLS.length, 0, nos);
  removeRows_(sheet_(SHEETS.ACTIVITY), ACTIVITY_COLS.length, ACTIVITY_COLS.indexOf('Matter no'), nos);
  removeRows_(sheet_(SHEETS.EMAILS), EMAIL_COLS.length, 0, nos);
  try { SpreadsheetApp.getUi().alert(demo.length + ' demo matters removed (folders are in the trash).'); }
  catch (e) { console.log(demo.length + ' demo matters removed.'); }
}

/** Replaces the Areas sheet with the default list. Folder IDs are kept for areas with the same name. */
function resetAreas() {
  const sh = sheet_(SHEETS.AREAS);
  const old = {};
  areas_().forEach(a => old[a.name] = a);
  const rows = defaultAreaRows_().map(r => {
    const o = old[r[0]];
    return o && o.folderId ? [r[0], r[1], o.folderId, sh.getRange(o.row, 4).getValue(), r[4]] : r;
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), AREA_COLS.length)).clearContent();
  writeHeaders_(sh, AREA_COLS);
  sh.getRange(2, 1, rows.length, AREA_COLS.length).setValues(rows);
  try { SpreadsheetApp.getUi().alert('The areas have been reset to the default list (' + rows.length + ' areas).'); }
  catch (e) { console.log('Areas reset.'); }
}

/** Rewrites a sheet without the rows whose column colIdx (0-based) is in the set – faster than deleting one by one. */
function removeRows_(sh, width, colIdx, set) {
  compactSheet_(sh, width, r => !set.has(r[colIdx]));
}
