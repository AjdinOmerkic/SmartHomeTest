/**
 * Smart Home Dashboard — Google Apps Script
 *
 * Deploy this as a Web App:
 *   Extensions → Apps Script → Deploy → New deployment
 *   Type: Web App
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Copy the Web App URL and paste it into CONFIG.sheets.scriptUrl in app.js
 */

var SHEET_NAME = 'Sheet1';

function doGet(e) {
  var action = (e.parameter && e.parameter.action) || 'list';
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var result = { ok: true };

  try {

    if (action === 'list') {
      // Return all items from column A, skipping header row
      var lastRow = sheet.getLastRow();
      var items   = [];
      if (lastRow >= 2) {
        var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        data.forEach(function(row) {
          var val = String(row[0]).trim();
          if (val) items.push(val);
        });
      }
      result.items = items;

    } else if (action === 'add') {
      // Append one item to the bottom of the list
      var item = e.parameter.item;
      if (item && item.trim()) {
        sheet.appendRow([item.trim()]);
      }

    } else if (action === 'sync') {
      // Replace the entire list with the supplied array
      // Used after deleting items so the sheet matches local state exactly
      var newItems = JSON.parse(decodeURIComponent(e.parameter.items || '[]'));
      var lastRow  = sheet.getLastRow();
      if (lastRow >= 2) sheet.deleteRows(2, lastRow - 1);
      if (newItems.length > 0) {
        var values = newItems.map(function(t) { return [t]; });
        sheet.getRange(2, 1, values.length, 1).setValues(values);
      }

    } else if (action === 'clear') {
      // Delete all rows except the header
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) sheet.deleteRows(2, lastRow - 1);

    }

  } catch (err) {
    result = { ok: false, error: err.message };
  }

  var output = ContentService.createTextOutput(JSON.stringify(result));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
