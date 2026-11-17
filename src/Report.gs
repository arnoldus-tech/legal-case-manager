/**
 * Google Slides report: KPIs, charts linked to the register, and matter lists.
 */

function createReportFromMenu() {
  const url = createReport();
  const html = HtmlService.createHtmlOutput('<p style="font-family:Arial">The report is ready:</p>' +
    '<p style="font-family:Arial"><a href="' + url + '" target="_blank">Open the report in Google Slides</a></p>').setWidth(360).setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'Report');
}

/** Builds the deck and returns its URL. */
function createReport() {
  const d = getDashboardData();

  // 1) Chart data and charts in the sheet (Slides charts must come from Sheets)
  const sh = getOrCreateSheet_(SHEETS.REPORT);
  sh.clear();
  sh.getCharts().forEach(c => sh.removeChart(c));
  const used = d.areas.filter(a => a.total > 0);
  const t1 = [['Area', 'Matters']].concat(used.map(a => [a.name, a.total]));
  const t2 = [['Area', 'Emails in', 'Emails out', 'Documents']].concat(used.map(a => [a.name, a.emailsIn, a.emailsOut, a.docs]));
  const t3 = [['Month', 'Opened', 'Closed']].concat(d.months.map(m => [m.label, m.opened, m.closed]));
  const subRows = [];
  d.areas.filter(a => a.subList.length).forEach(a => Object.keys(a.subs).forEach(s => subRows.push([a.name + ': ' + s, a.subs[s].total])));
  const t4 = [['Sub-area', 'Matters']].concat(subRows);
  const put = (t, col) => sh.getRange(1, col, t.length, t[0].length).setValues(t);
  put(t1, 1); put(t2, 4); put(t3, 9); put(t4, 13);
  sh.getRange(1, 1, 1, 14).setFontWeight('bold');

  const palette = ['#16324f', '#2a6f97', '#61a5c2', '#e9a03b', '#c8553d', '#7b6d8d', '#3f8f6b', '#9bc1bc', '#e07a5f',
    '#5c677d', '#b5838d', '#6d9dc5', '#a3b18a', '#d4a373', '#457b9d'];
  const range = (col, t) => sh.getRange(1, col, Math.max(t.length, 2), t[0].length);
  const charts = [
    ['Matters by area', t1.length > 1, () => sh.newChart().asPieChart().addRange(range(1, t1)).setColors(palette)
      .setOption('pieHole', 0.5).setTitle('Matters by area').setPosition(20, 1, 0, 0).build()],
    ['Activity by area', t2.length > 1, () => sh.newChart().asBarChart().addRange(range(4, t2)).setStacked()
      .setColors(['#2a6f97', '#61a5c2', '#e9a03b']).setTitle('Emails and documents by area').setPosition(20, 8, 0, 0).build()],
    ['Sub-areas', t4.length > 1, () => sh.newChart().asBarChart().addRange(range(13, t4)).setColors(['#16324f'])
      .setTitle('Matters by sub-area').setPosition(42, 1, 0, 0).build()],
    ['Opened and closed matters', t1.length > 1, () => sh.newChart().asColumnChart().addRange(range(9, t3))
      .setColors(['#2a6f97', '#9aa0a6']).setTitle('Opened and closed matters per month').setPosition(42, 8, 0, 0).build()]
  ];
  const inserted = [];
  charts.forEach(c => {
    if (!c[1]) return;
    try { sh.insertChart(c[2]()); inserted.push([c[0], sh.getCharts().slice(-1)[0]]); }
    catch (e) { console.warn('Chart "' + c[0] + '" failed: ' + e); }
  });
  SpreadsheetApp.flush();

  // 2) The deck
  const deck = SlidesApp.create('Matter report ' + fmt_(new Date(), 'yyyy-MM-dd'));
  DriveApp.getFileById(deck.getId()).moveTo(DriveApp.getFolderById(prop_('REPORTS_FOLDER_ID')));
  const W = deck.getPageWidth(), H = deck.getPageHeight();

  const cover = deck.getSlides()[0];
  cover.getPlaceholder(SlidesApp.PlaceholderType.CENTERED_TITLE).asShape().getText().setText('Legal matters – status report');
  cover.getPlaceholder(SlidesApp.PlaceholderType.SUBTITLE).asShape().getText().setText('As of ' + fmt_(new Date(), 'd MMMM yyyy'));

  const slide = title => {
    const s = deck.appendSlide(SlidesApp.PredefinedLayout.TITLE_ONLY);
    s.getPlaceholder(SlidesApp.PlaceholderType.TITLE).asShape().getText().setText(title);
    return s;
  };

  const kpi = slide('Key figures');
  const tiles = [['Matters in total', d.k.total], ['Open', d.k.open], ['New (intake)', d.k.new], ['On hold', d.k.onHold],
    ['Opened, last 30 days', d.k.opened30], ['Closed, last 30 days', d.k.closed30], ['Emails filed', d.k.emails], ['Documents', d.k.docs]];
  const tw = (W - 80) / 4, th = 100;
  tiles.forEach((x, i) => {
    const box = kpi.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 45 + (i % 4) * tw, 110 + Math.floor(i / 4) * (th + 20), tw - 10, th);
    box.getFill().setSolidFill('#eef3f8'); box.getBorder().setTransparent();
    const text = box.getText(); text.setText(String(x[1]) + '\n' + x[0]);
    text.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    text.getRange(0, String(x[1]).length).getTextStyle().setFontSize(30).setBold(true).setForegroundColor('#16324f');
    text.getRange(String(x[1]).length + 1, text.asString().length - 1).getTextStyle().setFontSize(11).setForegroundColor('#5c677d');
  });

  inserted.forEach(c => {
    const s = slide(c[0]);
    try { s.insertSheetsChart(c[1], 60, 90, W - 120, H - 120); }
    catch (e) { s.insertTextBox('The chart could not be inserted: ' + e.message, 60, 100, W - 120, 60); }
  });

  const open = d.matters.filter(m => m.status !== 'Closed')
    .sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1).slice(0, 14);
  tableSlide_(slide('Open matters – nearest deadlines'), W,
    [['Matter', 'Title', 'Area', 'Status', 'Owner', 'Deadline']]
      .concat(open.map(m => [m.no, m.title, m.area, m.status, m.owner, m.deadline || '–'])));

  const active = d.matters.slice().sort((a, b) => (b.emailsIn + b.emailsOut + b.docs) - (a.emailsIn + a.emailsOut + a.docs)).slice(0, 10);
  tableSlide_(slide('Most active matters'), W,
    [['Matter', 'Title', 'Area', 'Emails', 'Documents', 'Size (MB)']]
      .concat(active.map(m => [m.no, m.title, m.area, m.emailsIn + m.emailsOut, m.docs, m.sizeMb])));

  slide('About the figures').insertTextBox('All figures are counted, not estimated: matters from the register, emails filed ' +
    'on matters (automatically or manually) and files in the matter folders.\n\n' +
    'The charts are linked to the matter register and can be refreshed in Slides from the chart menu ("Update").',
    60, 100, W - 120, 200).getText().getTextStyle().setFontSize(14);

  deck.saveAndClose();
  return 'https://docs.google.com/presentation/d/' + deck.getId() + '/edit';
}

function tableSlide_(slide, W, rows) {
  if (rows.length < 2) { slide.insertTextBox('No matters.', 60, 100, 300, 40); return; }
  const table = slide.insertTable(rows.length, rows[0].length, 30, 85, W - 60, 20 * rows.length);
  rows.forEach((r, i) => r.forEach((v, j) => {
    const cell = table.getCell(i, j);
    cell.getText().setText(String(v === null || v === undefined ? '' : v));
    cell.getText().getTextStyle().setFontSize(9).setBold(i === 0);
    if (i === 0) cell.getFill().setSolidFill('#e3e9f2');
  }));
}
