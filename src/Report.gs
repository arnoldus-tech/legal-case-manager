/**
 * Google Slides report: branded cover, key figures, charts linked to the register and a
 * focus slide with placeholders for what the team wants to highlight.
 */

const BRAND = { NAVY: '#16324f', TEAL: '#2a6f97', SKY: '#61a5c2', AMBER: '#e9a03b', MUTED: '#66748a', LIGHT: '#eef3f8' };

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
  const active = used.filter(a => a.emails + a.docs > 0);
  const t1 = [['Area', 'Matters']].concat(used.map(a => [a.name, a.total]));
  const t2 = [['Area', 'Emails', 'Documents']].concat(active.map(a => [a.name, a.emails, a.docs]));
  const t3 = [['Month', 'Opened', 'Closed']].concat(d.months.map(m => [m.label, m.opened, m.closed]));
  const subRows = [];
  d.areas.filter(a => a.subList.length).forEach(a => Object.keys(a.subs).forEach(s => subRows.push([a.name + ': ' + s, a.subs[s].total])));
  const t4 = [['Sub-area', 'Matters']].concat(subRows);
  const put = (t, col) => sh.getRange(1, col, t.length, t[0].length).setValues(t);
  put(t1, 1); put(t2, 4); put(t3, 8); put(t4, 12);
  sh.getRange(1, 1, 1, 13).setFontWeight('bold');

  const palette = ['#16324f', '#2a6f97', '#61a5c2', '#e9a03b', '#c8553d', '#7b6d8d', '#3f8f6b', '#9bc1bc', '#e07a5f',
    '#5c677d', '#b5838d', '#6d9dc5', '#a3b18a', '#d4a373', '#457b9d'];
  const range = (col, t) => sh.getRange(1, col, Math.max(t.length, 2), t[0].length);
  const charts = [
    ['Matters by area', t1.length > 1, () => sh.newChart().asPieChart().addRange(range(1, t1)).setColors(palette)
      .setOption('pieHole', 0.5).setTitle('Matters by area').setPosition(20, 1, 0, 0).build()],
    ['Emails and documents by area', t2.length > 1, () => sh.newChart().asBarChart().addRange(range(4, t2))
      .setColors([BRAND.TEAL, BRAND.AMBER]).setOption('hAxis.viewWindow.min', 0).setTitle('Emails and documents by area')
      .setPosition(20, 8, 0, 0).build()],
    ['Sub-areas', t4.length > 1, () => sh.newChart().asBarChart().addRange(range(12, t4)).setColors([BRAND.NAVY]).setOption('hAxis.viewWindow.min', 0)
      .setTitle('Matters by sub-area').setPosition(42, 1, 0, 0).build()],
    ['Opened and closed matters', t1.length > 1, () => sh.newChart().asColumnChart().addRange(range(8, t3))
      .setColors([BRAND.TEAL, '#c3ccd8']).setOption('vAxis.viewWindow.min', 0).setTitle('Opened and closed matters per month')
      .setPosition(42, 8, 0, 0).build()]
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

  // Cover: navy background, logo and title
  const cover = deck.getSlides()[0];
  cover.getPageElements().forEach(e => e.remove());
  cover.getBackground().setSolidFill(BRAND.NAVY);
  drawLogo_(cover, 60, 60, 44, true);
  const title = cover.insertTextBox('Legal matters', 60, H / 2 - 50, W - 120, 60).getText();
  title.getTextStyle().setFontFamily('Inter').setFontSize(40).setBold(true).setForegroundColor('#ffffff');
  const subtitle = cover.insertTextBox('Status report · ' + fmt_(new Date(), 'd MMMM yyyy'), 60, H / 2 + 10, W - 120, 30).getText();
  subtitle.getTextStyle().setFontFamily('Inter').setFontSize(16).setForegroundColor(BRAND.SKY);
  cover.insertShape(SlidesApp.ShapeType.RECTANGLE, 60, H / 2 + 55, 60, 4).getFill().setSolidFill(BRAND.AMBER);

  const slide = heading => {
    const s = deck.appendSlide(SlidesApp.PredefinedLayout.TITLE_ONLY);
    const t = s.getPlaceholder(SlidesApp.PlaceholderType.TITLE).asShape().getText();
    t.setText(heading);
    t.getTextStyle().setFontFamily('Inter').setBold(true).setForegroundColor(BRAND.NAVY);
    brandFooter_(s, W, H);
    return s;
  };

  // Key figures
  const kpi = slide('Key figures');
  const tiles = [['Matters in total', d.k.total], ['Open', d.k.open], ['New (intake)', d.k.new], ['On hold', d.k.onHold],
    ['Opened, last 30 days', d.k.opened30], ['Closed, last 30 days', d.k.closed30], ['Emails', d.k.emails], ['Documents', d.k.docs]];
  const tw = (W - 80) / 4, th = 100;
  tiles.forEach((x, i) => {
    const box = kpi.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 45 + (i % 4) * tw, 105 + Math.floor(i / 4) * (th + 18), tw - 10, th);
    box.getFill().setSolidFill(i === 1 ? BRAND.NAVY : BRAND.LIGHT); box.getBorder().setTransparent();
    const text = box.getText(); text.setText(String(x[1]) + '\n' + x[0]);
    text.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    text.getTextStyle().setFontFamily('Inter');
    text.getRange(0, String(x[1]).length).getTextStyle().setFontSize(30).setBold(true).setForegroundColor(i === 1 ? '#ffffff' : BRAND.NAVY);
    text.getRange(String(x[1]).length + 1, text.asString().length - 1).getTextStyle().setFontSize(11).setForegroundColor(i === 1 ? '#c7d4e3' : BRAND.MUTED);
  });

  // Charts
  inserted.forEach(c => {
    const s = slide(c[0]);
    try { s.insertSheetsChart(c[1], 60, 85, W - 120, H - 130); }
    catch (e) { s.insertTextBox('The chart could not be inserted: ' + e.message, 60, 100, W - 120, 60); }
  });

  // Focus: placeholders for the matters, themes or risks the team wants to highlight
  const focus = slide('Focus');
  const fw = (W - 100) / 3;
  [1, 2, 3].forEach(i => {
    const box = focus.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 45 + (i - 1) * (fw + 5), 95, fw - 5, H - 165);
    box.getFill().setSolidFill('#ffffff');
    box.getBorder().setWeight(1.5).setDashStyle(SlidesApp.DashStyle.DASH).getLineFill().setSolidFill(BRAND.SKY);
    const text = box.getText();
    text.setText('Focus ' + i + '\n\nAdd the matter, theme or risk you want to highlight – e.g. status, next steps and decisions needed.');
    text.getTextStyle().setFontFamily('Inter').setFontSize(12).setForegroundColor(BRAND.MUTED);
    text.getRange(0, ('Focus ' + i).length).getTextStyle().setFontSize(16).setBold(true).setForegroundColor(BRAND.NAVY);
    text.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.START);
    box.setContentAlignment(SlidesApp.ContentAlignment.TOP);
  });

  const about = slide('About the figures');
  about.insertTextBox('All figures are counted, not estimated: matters from the register, emails filed on matters ' +
    '(automatically or manually) and files in the matter folders.\n\n' +
    'The charts are linked to the matter register and can be refreshed in Slides from the chart menu ("Update").',
    60, 100, W - 120, 200).getText().getTextStyle().setFontFamily('Inter').setFontSize(14).setForegroundColor(BRAND.NAVY);

  deck.saveAndClose();
  return 'https://docs.google.com/presentation/d/' + deck.getId() + '/edit';
}

/** The arnoldus.tech mark drawn with native shapes: a rounded square with "a" and an amber dot, plus the wordmark. */
function drawLogo_(slide, left, top, size, onDark) {
  const mark = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, left, top, size, size);
  mark.getFill().setSolidFill(BRAND.TEAL); mark.getBorder().setTransparent();
  const a = mark.getText(); a.setText('a');
  a.getTextStyle().setFontFamily('Inter').setBold(true).setFontSize(Math.round(size * 0.55)).setForegroundColor('#ffffff');
  a.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  mark.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  const dot = slide.insertShape(SlidesApp.ShapeType.ELLIPSE, left + size * 0.68, top + size * 0.58, size * 0.16, size * 0.16);
  dot.getFill().setSolidFill(BRAND.AMBER); dot.getBorder().setTransparent();
  const word = slide.insertTextBox('arnoldus.tech', left + size + 10, top + size * 0.18, 260, size * 0.7).getText();
  word.getTextStyle().setFontFamily('Inter').setBold(true).setFontSize(Math.round(size * 0.42)).setForegroundColor(onDark ? '#ffffff' : BRAND.NAVY);
  word.getRange(8, 13).getTextStyle().setForegroundColor(BRAND.SKY);
}

/** Thin accent line and a small wordmark at the bottom of a content slide. */
function brandFooter_(slide, W, H) {
  slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, H - 6, W, 6).getFill().setSolidFill(BRAND.NAVY);
  slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, H - 6, 90, 6).getFill().setSolidFill(BRAND.AMBER);
  slide.getShapes().slice(-2).forEach(s => s.getBorder().setTransparent());
  const t = slide.insertTextBox('Legal Matters · arnoldus.tech', W - 230, H - 30, 200, 20).getText();
  t.getTextStyle().setFontFamily('Inter').setFontSize(9).setForegroundColor(BRAND.MUTED);
  t.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.END);
}
