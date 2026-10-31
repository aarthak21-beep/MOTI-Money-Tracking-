/**
 * MOTI Google Sheets Cloud Sync
 * Deploy as a Web App: Execute as "User accessing the web app";
 * Who has access: "Anyone with Google account".
 * The Google account used by the app must have access to this spreadsheet.
 */
const SHEET_NAME = 'MOTI Cloud Backup';

function doGet(e) {
  const callback = (e && e.parameter && e.parameter.callback) || '';
  const result = readSnapshot_();
  const body = JSON.stringify(result);
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(callback + '(' + body + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action !== 'save' || !payload.snapshot) throw new Error('Invalid sync payload');
    const email = Session.getActiveUser().getEmail();
    if (!email) throw new Error('Sign in with the Google account that owns the spreadsheet.');
    const sheet = getSheet_();
    const values = sheet.getDataRange().getValues();
    const json = JSON.stringify(payload.snapshot);
    writeModuleSheets_(payload.snapshot.data || {});
    const updatedAt = new Date();
    let row = values.findIndex((r, i) => i > 0 && r[0] === email) + 1;
    if (row === 0) {
      sheet.appendRow([email, json, updatedAt]);
    } else {
      sheet.getRange(row, 2, 1, 2).setValues([[json, updatedAt]]);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function readSnapshot_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) return { ok: false, error: 'Google sign-in is required.' };
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const row = values.find((r, i) => i > 0 && r[0] === email);
  return { ok: true, snapshot: row ? JSON.parse(row[1]) : null };
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(['Google account', 'MOTI data (JSON)', 'Last synced']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeModuleSheets_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const stock = (data.stockTrades || []).map((t, i, all) => {
    const entry = Number(t.entryPrice) || 0;
    const exit = Number(t.exitPrice) || 0;
    const qty = Number(t.quantity) || 0;
    const pnl = t.status === 'CLOSED' ? (Number(t.actualPnl) || ((exit - entry) * qty)) : '';
    const cumulative = all.slice(0, i + 1).reduce((sum, item) =>
      sum + (item.status === 'CLOSED' ? (Number(item.actualPnl) || (((Number(item.exitPrice) || 0) - (Number(item.entryPrice) || 0)) * (Number(item.quantity) || 0))) : 0), 0);
    return [t.serialNumber || i + 1, t.entryDate || '', t.stockName || '', entry || '', qty || '',
      Number(t.totalInvestment) || (entry * qty) || '', t.exitDate || '', exit || '',
      '', Number(t.targetEarnings) || (entry && qty ? (Number(t.targetEarnings) || 0) : ''),
      pnl, cumulative || '', entry && exit ? ((exit - entry) / entry) * 100 : ''];
  });
  writeTab_(ss, 'Stock Trading',
    ['Sr No.', 'DATE', 'STOCK', 'ENTRY', 'QTY', 'INVESTMENT', 'EXIT DATE', 'EXIT', 'CMI', 'TARGET EARN', 'P&L', 'TOTAL P&L', '%'],
    stock);

  const weekly = (data.weeklyIncome || []).map((w, i) => {
    const base = Number(w.openingBalance) || 0;
    const zomato = Number(w.weeklyIncome) || 0;
    const growth = base * 0.03;
    return [w.serialNumber || i + 1, w.weekStartDate || '', base, zomato, growth, base + zomato + growth];
  });
  writeTab_(ss, 'Weekly Income',
    ['Sr. No.', 'DATE', 'BASE', 'ZOMATO', '3.00%', 'FINAL AMOUNT'], weekly);

  const daily = (data.dailyEarnings || []).map((d) => [
    d.date || '', d.incomeSource || '', Number(d.shift1) || 0, Number(d.shift2) || 0,
    Number(d.shift3) || 0, Number(d.bonus) || 0, Number(d.offers) || 0,
    Number(d.otherEarnings) || 0, Number(d.totalDailyIncome) || 0,
    Number(d.dailyExpenses) || 0, Number(d.netDailyIncome) || 0, d.notes || ''
  ]);
  writeTab_(ss, 'Daily Earnings',
    ['DATE', 'INCOME SOURCE', 'SHIFT 1', 'SHIFT 2', 'SHIFT 3', 'BONUS', 'OFFERS',
      'OTHER EARNINGS', 'TOTAL DAILY INCOME', 'DAILY EXPENSES', 'NET DAILY INCOME', 'NOTES'],
    daily);
}

function writeTab_(ss, name, headers, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  const values = [headers].concat(rows);
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.autoResizeColumns(1, headers.length);
}
