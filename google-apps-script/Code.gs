/**
 * MOTI Google Sheets Cloud Sync
 * Deploy as a Web App: Execute as "User accessing the web app";
 * Who has access: "Anyone with Google account".
 * Keep the spreadsheet private and grant access only to trusted Google accounts.
 */
const SHEET_NAME = 'MOTI Cloud Backup';
const BACKUP_SCOPE = 'SHARED';

function doGet(e) {
  const params = (e && e.parameter) || {};
  let result;
  if (params.action === 'weekly-load') {
    const snapshot = readSnapshot_();
    const records = snapshot.snapshot && Array.isArray(snapshot.snapshot.weeklyIncome)
      ? snapshot.snapshot.weeklyIncome : [];
    result = { ok: true, found: records.length > 0, records: records };
  } else {
    result = readSnapshot_();
  }
  const body = JSON.stringify(result);
  const callback = params.callback || '';
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(callback + '(' + body + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action === 'weekly-save') {
      const existing = readSnapshot_().snapshot || {};
      existing.weeklyIncome = Array.isArray(payload.records) ? payload.records : [];
      saveSnapshot_(existing);
    } else if (payload.action === 'save' && payload.snapshot && typeof payload.snapshot === 'object') {
      saveSnapshot_(payload.snapshot);
    } else {
      throw new Error('Invalid MOTI sync payload');
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveSnapshot_(snapshot) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const json = JSON.stringify(snapshot);
  writeModuleSheets_(snapshot);
  const updatedAt = new Date();
  let row = values.findIndex((r, i) => i > 0 && r[0] === BACKUP_SCOPE) + 1;
  if (row === 0) row = values.findIndex((r, i) => i > 0 && r[1]) + 1;
  if (row === 0) sheet.appendRow([BACKUP_SCOPE, json, updatedAt]);
  else sheet.getRange(row, 1, 1, 3).setValues([[BACKUP_SCOPE, json, updatedAt]]);
}

function readSnapshot_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const row = values.find((r, i) => i > 0 && r[0] === BACKUP_SCOPE)
    || values.find((r, i) => i > 0 && r[1]);
  return { ok: true, snapshot: row && row[1] ? JSON.parse(row[1]) : null };
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(['Backup scope', 'MOTI data (JSON)', 'Last synced']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Human-readable tabs are derived views; the full JSON snapshot remains the restore source of truth.
function writeModuleSheets_(snapshot) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = snapshot.data && typeof snapshot.data === 'object' ? snapshot.data : snapshot;
  const stock = (data.stockTrades || []).map((t, i, all) => {
    const entry = Number(t.entryPrice) || 0;
    const exit = Number(t.exitPrice) || 0;
    const qty = Number(t.quantity) || 0;
    const pnl = t.status === 'CLOSED' ? (Number(t.actualPnl) || ((exit - entry) * qty)) : '';
    const cumulative = all.slice(0, i + 1).reduce((sum, item) =>
      sum + (item.status === 'CLOSED' ? (Number(item.actualPnl) || (((Number(item.exitPrice) || 0) - (Number(item.entryPrice) || 0)) * (Number(item.quantity) || 0))) : 0), 0);
    return [t.serialNumber || i + 1, t.entryDate || '', t.stockName || '', t.exchange || '', entry || '', qty || '',
      Number(t.totalInvestment) || (entry * qty) || '', t.exitDate || '', exit || '', pnl, cumulative || '', t.status || '', t.source || ''];
  });
  writeTab_(ss, 'Stock Trading', ['Sr No.','DATE','STOCK','EXCHANGE','ENTRY','QTY','INVESTMENT','EXIT DATE','EXIT','P&L','TOTAL P&L','STATUS','SOURCE'], stock);

  const weekly = (data.weeklyIncome || []).map((w, i) =>
    [w.serialNumber || i + 1, w.weekStartDate || w.weekDate || '', Number(w.openingBalance) || 0,
      Number(w.weeklyIncome) || Number(w.extraAddition) || 0, Number(w.targetGrowthRate) || 0,
      Number(w.finalAmount) || 0]);
  writeTab_(ss, 'Weekly Capital', ['Sr. No.','WEEK DATE','PREVIOUS CAPITAL','EXTRA ADDITION','TARGET GROWTH RATE','FINAL AMOUNT'], weekly);

  const zerodha = snapshot.zerodhaHistory || {};
  const rows = (zerodha.orders || []).map(o => [o.order_id || '', o.tradingsymbol || '', o.exchange || '', o.transaction_type || '', o.quantity || '', o.status || '', o.order_timestamp || '']);
  writeTab_(ss, 'Zerodha Orders', ['ORDER ID','SYMBOL','EXCHANGE','SIDE','QTY','STATUS','ORDER TIME'], rows);
  const fills = (zerodha.trades || []).map(t => [t.trade_id || '', t.order_id || '', t.tradingsymbol || '', t.exchange || '', t.transaction_type || '', t.quantity || '', t.price || '', t.fill_timestamp || '']);
  writeTab_(ss, 'Zerodha Fills', ['TRADE ID','ORDER ID','SYMBOL','EXCHANGE','SIDE','QTY','PRICE','FILL TIME'], fills);
  const holdings = (zerodha.holdings || []).map(h => [h.tradingsymbol || '', h.exchange || '', h.quantity || 0, h.average_price || 0, h.last_price || 0, h.pnl || 0]);
  writeTab_(ss, 'Zerodha Holdings', ['SYMBOL','EXCHANGE','QTY','AVG PRICE','LTP','P&L'], holdings);
  const positions = (zerodha.positions || []).map(p => [p.tradingsymbol || '', p.exchange || '', p.product || '', p.quantity || 0, p.average_price || 0, p.last_price || 0, p.pnl || 0]);
  writeTab_(ss, 'Zerodha Positions', ['SYMBOL','EXCHANGE','PRODUCT','QTY','AVG PRICE','LTP','P&L'], positions);

  const daily = (data.dailyEarnings || []).map(d => [d.date || '', d.incomeSource || '', Number(d.totalDailyIncome) || 0, Number(d.dailyExpenses) || 0, Number(d.netDailyIncome) || 0, d.notes || '']);
  writeTab_(ss, 'Daily Earnings', ['DATE','INCOME SOURCE','TOTAL INCOME','EXPENSES','NET INCOME','NOTES'], daily);
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
