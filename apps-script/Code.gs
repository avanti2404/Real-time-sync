/**
 * Real-Time Google Sheets Webhook Trigger
 * ---------------------------------------
 * Fires on any cell edit in the Google Sheet and sends an HTTP POST webhook to Node.js backend.
 */

var BACKEND_WEBHOOK_URL = "https://google-sync-demo.loca.lt/api/sheet-webhook";

// Triggered automatically on direct cell edits
function onEdit(e) {
  sendWebhook();
}

// Triggered on spreadsheet changes
function onChange(e) {
  sendWebhook();
}

function sendWebhook() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var range = sheet.getRange("A1:C10");
    var values = range.getValues();
    
    if (!values || values.length <= 1) return;
    
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (row[0] || row[1] || row[2]) {
        rows.push({
          id: i,
          columnA: String(row[0] || ''),
          columnB: String(row[1] || ''),
          columnC: String(row[2] || '')
        });
      }
    }

    var payload = JSON.stringify({
      event: "sheet_edited",
      timestamp: new Date().toISOString(),
      rows: rows
    });

    var options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Bypass-Tunnel-Reminder": "true"
      },
      payload: payload,
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(BACKEND_WEBHOOK_URL, options);
    Logger.log("Webhook response status: " + response.getResponseCode());
  } catch (err) {
    Logger.log("Error in sendWebhook: " + err.toString());
  }
}
