/**
 * Web app entry point and dashboard data.
 * Everything shown is objective: counts of matters, emails and documents, and storage size.
 */

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('App');
  t.view = (e && e.parameter && e.parameter.view) || 'dashboard';
  return t.evaluate().setTitle('Legal Matters').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function showApp_(view, title, width, height) {
  const t = HtmlService.createTemplateFromFile('App');
  t.view = view;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(width).setHeight(height), title);
}

/** All dashboard data. Dates are returned as text (google.script.run cannot send Date objects). */
function getDashboardData() {
  const rows = readTable_(SHEETS.MATTERS).rows;
  const counts = {};
  readTable_(SHEETS.ACTIVITY).rows.forEach(a => {
    const c = counts[a['Matter no']] = counts[a['Matter no']] || { emails: 0, docs: 0 };
    if (a['Type'] === ACT.EMAIL_IN || a['Type'] === ACT.EMAIL_OUT) c.emails++;
    if (a['Type'] === ACT.DOC_ADDED) c.docs++;
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d30 = new Date(today.getTime() - 30 * 864e5);
  const areaList = areas_();
  const num = v => Number(v) || 0;

  const matters = rows.map(m => ({
    no: m['Matter no'], title: m['Title'], area: m['Area'], sub: m['Sub-area'] || '', status: m['Status'],
    priority: m['Priority'], owner: m['Owner'], client: m['Client/department'],
    opened: fmt_(m['Opened']), deadline: fmt_(m['Deadline']), closed: fmt_(m['Closed']), folder: m['Folder'],
    emails: (counts[m['Matter no']] || {}).emails || 0, docs: (counts[m['Matter no']] || {}).docs || 0, sizeMb: num(m['Size (MB)']),
    overdue: !!(m['Deadline'] && m['Status'] !== 'Closed' && new Date(m['Deadline']) < today)
  }));

  const k = { total: matters.length, open: 0, new: 0, onHold: 0, closed: 0, opened30: 0, closed30: 0, emails: 0, docs: 0, sizeMb: 0 };
  const areas = {};
  const blankArea = (name, code, subs) => ({ name: name, code: code, subList: subs || [], total: 0, open: 0, closed: 0,
    emails: 0, docs: 0, sizeMb: 0, subs: {} });
  areaList.forEach(a => areas[a.name] = blankArea(a.name, a.code, a.subs));
  const owners = {};

  matters.forEach(m => {
    const a = areas[m.area] = areas[m.area] || blankArea(m.area, '', []);
    a.total++;
    a.emails += m.emails; a.docs += m.docs; a.sizeMb += m.sizeMb;
    if (a.subList.length) {
      const s = a.subs[m.sub || '(not set)'] = a.subs[m.sub || '(not set)'] || { total: 0, open: 0 };
      s.total++; if (m.status !== 'Closed') s.open++;
    }
    if (m.status === 'Closed') { k.closed++; a.closed++; } else {
      k.open++; a.open++;
      owners[m.owner || '(none)'] = (owners[m.owner || '(none)'] || 0) + 1;
    }
    if (m.status === 'New') k.new++;
    if (m.status === 'On hold') k.onHold++;
    if (m.opened && new Date(m.opened) >= d30) k.opened30++;
    if (m.closed && new Date(m.closed) >= d30) k.closed30++;
    k.emails += m.emails; k.docs += m.docs; k.sizeMb += m.sizeMb;
  });
  Object.keys(areas).forEach(n => areas[n].sizeMb = Math.round(areas[n].sizeMb * 10) / 10);
  k.sizeMb = Math.round(k.sizeMb * 10) / 10;

  // Opened / closed per month (12 months)
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ key: fmt_(d, 'yyyy-MM'), label: fmt_(d, 'MMM yy'), opened: 0, closed: 0 });
  }
  const idx = {}; months.forEach((m, i) => idx[m.key] = i);
  matters.forEach(m => {
    if (m.opened && idx[m.opened.slice(0, 7)] !== undefined) months[idx[m.opened.slice(0, 7)]].opened++;
    if (m.closed && idx[m.closed.slice(0, 7)] !== undefined) months[idx[m.closed.slice(0, 7)]].closed++;
  });

  return {
    k: k, areas: Object.keys(areas).map(n => areas[n]), months: months, matters: matters,
    owners: Object.keys(owners).map(o => ({ name: o, count: owners[o] })).sort((a, b) => b.count - a.count),
    areaSubs: areaList.reduce((o, a) => { if (a.subs.length) o[a.name] = a.subs; return o; }, {}),
    areaNames: areaList.map(a => a.name), statuses: STATUSES, priorities: PRIORITIES,
    user: Session.getActiveUser().getEmail(), updated: fmt_(new Date(), 'yyyy-MM-dd HH:mm')
  };
}
