/**
 * Smart Home Shopping List — Google Apps Script
 *
 * SETUP:
 *  1. Open your Google Sheet → Extensions → Apps Script
 *  2. Paste this entire file, replacing any existing code
 *  3. Click Deploy → New deployment
 *     - Type: Web app
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  4. Copy the web app URL and paste it into CONFIG.sheets.scriptUrl in app.js
 *
 * The sheet must have a header row in row 1 (any text, e.g. "Item").
 * Items live in column A from row 2 downward.
 */

const SHEET_NAME = 'ShoppingList';

function doGet(e) {
  try {
    const sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const action = (e.parameter || {}).action;

    /* ── list ──────────────────────────────────────────────── */
    if (action === 'list') {
      const last  = sheet.getLastRow();
      const rows  = last > 1
        ? sheet.getRange(2, 1, last - 1, 1).getValues()
        : [];
      const items = rows.map(r => String(r[0]).trim()).filter(Boolean);
      return json({ ok: true, items });
    }

    /* ── add (single item) ─────────────────────────────────── */
    if (action === 'add') {
      const item = String((e.parameter || {}).item || '').trim();
      if (!item) return json({ ok: false, error: 'No item provided' });
      sheet.appendRow([item]);
      return json({ ok: true });
    }

    /* ── sync (replace entire list) ────────────────────────── */
    if (action === 'sync') {
      const raw   = (e.parameter || {}).items || '[]';
      const items = JSON.parse(raw).map(String).filter(s => s.trim());
      const last  = sheet.getLastRow();
      if (last > 1) sheet.deleteRows(2, last - 1);
      if (items.length) {
        sheet.getRange(2, 1, items.length, 1).setValues(items.map(v => [v]));
      }
      return json({ ok: true });
    }

    /* ── clear ─────────────────────────────────────────────── */
    if (action === 'clear') {
      const last = sheet.getLastRow();
      if (last > 1) sheet.deleteRows(2, last - 1);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Unknown action: ' + action });

  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
