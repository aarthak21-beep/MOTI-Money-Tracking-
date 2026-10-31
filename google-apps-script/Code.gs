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
