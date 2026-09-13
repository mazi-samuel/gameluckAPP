/**
 * Penalty Kick Arena — Google Sheets backend (Apps Script Web App)
 *
 * Deploy: Extensions > Apps Script in a Google Sheet, paste this file.
 * Project Settings > Script Properties > add API_KEY with a random secret,
 * then Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy the deployment URL into game-service.js (cloudApiUrl / cloudApiKey).
 */

function getApiKey() {
  return PropertiesService.getScriptProperties().getProperty('API_KEY');
}

const STATS_SHEET_NAME = 'PlayerStats';
const STATS_HEADERS = ['playerId', 'coins', 'wins', 'streaks', 'bestStreak', 'plays', 'updatedAt'];

function getStatsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STATS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATS_SHEET_NAME);
    sheet.appendRow(STATS_HEADERS);
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function findPlayerRow(sheet, playerId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === playerId) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'getStats') {
    const playerId = e.parameter.playerId;
    if (!playerId) return jsonResponse({ error: 'Missing playerId' });

    const sheet = getStatsSheet();
    const row = findPlayerRow(sheet, playerId);
    if (row === -1) return jsonResponse({ found: false });

    const values = sheet.getRange(row, 1, 1, STATS_HEADERS.length).getValues()[0];
    const stats = {};
    STATS_HEADERS.forEach((key, i) => { stats[key] = values[i]; });
    return jsonResponse({ found: true, stats: stats });
  }

  return jsonResponse({ error: 'Unknown action' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON body' });
  }

  const apiKey = getApiKey();
  if (!apiKey || body.apiKey !== apiKey) {
    return jsonResponse({ error: 'Unauthorized' });
  }

  if (body.action === 'updateStats') {
    return updateStats(body.playerId, body.stats);
  }

  return jsonResponse({ error: 'Unknown action' });
}

function updateStats(playerId, stats) {
  if (!playerId || !stats) return jsonResponse({ error: 'Missing playerId or stats' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getStatsSheet();
    const row = findPlayerRow(sheet, playerId);
    const values = [
      playerId,
      Number(stats.coins) || 0,
      Number(stats.wins) || 0,
      Number(stats.streaks) || 0,
      Number(stats.bestStreak) || 0,
      Number(stats.plays) || 0,
      new Date().toISOString()
    ];

    if (row === -1) {
      sheet.appendRow(values);
    } else {
      sheet.getRange(row, 1, 1, values.length).setValues([values]);
    }
  } finally {
    lock.releaseLock();
  }

  return jsonResponse({ success: true });
}
