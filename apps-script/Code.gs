/**
 * PracticApp · backend de respaldo (Google Apps Script)
 * =====================================================
 *
 * Web app que lee/escribe la planilla de práctica. Corre COMO VOS (el dueño),
 * así que la app web NO necesita ningún login de Google: solo manda el nombre
 * de la persona + los datos de la sesión.
 *
 * --- Deploy (una sola vez) ---
 *  1. Abrí tu planilla en Google Sheets → menú "Extensiones" → "Apps Script".
 *  2. Borrá lo que haya y pegá TODO este archivo. Guardá (Ctrl/Cmd+S).
 *  3. Botón "Implementar" → "Nueva implementación".
 *       - Tipo: "Aplicación web".
 *       - Ejecutar como: "Yo" (tu cuenta).
 *       - Quién tiene acceso: "Cualquier persona".
 *  4. Autorizá los permisos cuando te los pida (es tu propia cuenta).
 *  5. Copiá la "URL de la aplicación web" (termina en /exec).
 *       → ponela en la env var VITE_SHEETS_ENDPOINT (Vercel + .env local).
 *
 * Si después editás el script, "Implementar" → "Administrar implementaciones"
 * → editás la existente y "Nueva versión" (así la URL no cambia).
 *
 * Probar rápido: abrí en el navegador  <URL>?action=list&name=TuNombre
 */

var SHEET_NAME = 'Sesiones';
var HEADER = [
  'Nombre', 'Fecha', 'Inicio', 'Minutos', 'Foco', 'Notas',
  'ID', 'startedAt_ms', 'durationSec', 'Borrado',
];
// 0-based column positions, matching HEADER.
var COL = {
  name: 0, date: 1, inicio: 2, minutos: 3, foco: 4, notas: 5,
  id: 6, startedAt: 7, durationSec: 8, borrado: 9,
};

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADER);
  // Keep Fecha (B) and Inicio (C) as plain text so Sheets doesn't coerce them
  // into Date/time values and break the exact round-trip.
  sh.getRange('B:C').setNumberFormat('@');
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return handle_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  return handle_(body);
}

function handle_(req) {
  try {
    var action = req.action || 'list';
    if (action === 'list') return json_({ sessions: list_(req.name) });
    if (action === 'append') return json_(append_(req.name, req.sessions || []));
    if (action === 'delete') return json_(del_(req.name, req.ids || []));
    return json_({ error: 'accion desconocida: ' + action });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function ymd_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v).trim();
}

/** Live (not soft-deleted) sessions owned by `name`. */
function list_(name) {
  var me = String(name || '').trim();
  var sh = getSheet_();
  var tz = sh.getParent().getSpreadsheetTimeZone();
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) { // skip header
    var r = rows[i];
    if (String(r[COL.name]).trim() !== me) continue;
    if (String(r[COL.borrado]).trim().toUpperCase() === 'TRUE') continue;
    out.push({
      id: String(r[COL.id]),
      date: ymd_(r[COL.date], tz),
      startedAt: Number(r[COL.startedAt]) || 0,
      durationSec: Number(r[COL.durationSec]) || 0,
      focus: String(r[COL.foco] || ''),
      notes: String(r[COL.notas] || ''),
    });
  }
  return out;
}

/** Append new sessions for `name`, skipping any id already present (dedupe). */
function append_(name, sessions) {
  var me = String(name || '').trim();
  var sh = getSheet_();
  var tz = sh.getParent().getSpreadsheetTimeZone();
  var lastRow = sh.getLastRow();
  var existing = {};
  if (lastRow >= 2) {
    var ids = sh.getRange(2, COL.id + 1, lastRow - 1, 1).getValues();
    for (var j = 0; j < ids.length; j++) existing[String(ids[j][0])] = true;
  }
  var rows = [];
  for (var k = 0; k < sessions.length; k++) {
    var s = sessions[k];
    var id = String(s.id || '');
    if (!id || existing[id]) continue;
    existing[id] = true;
    var startedAt = Number(s.startedAt) || 0;
    var inicio = startedAt ? Utilities.formatDate(new Date(startedAt), tz, 'HH:mm') : '';
    rows.push([
      me, String(s.date || ''), inicio,
      Math.round((Number(s.durationSec) || 0) / 60),
      String(s.focus || ''), String(s.notes || ''),
      id, startedAt, Number(s.durationSec) || 0, '',
    ]);
  }
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
  }
  return { added: rows.length };
}

/** Soft-delete: mark `name`'s rows whose id is in `ids` with Borrado = TRUE. */
function del_(name, ids) {
  var me = String(name || '').trim();
  var idSet = {};
  for (var i = 0; i < ids.length; i++) idSet[String(ids[i])] = true;
  var sh = getSheet_();
  var values = sh.getDataRange().getValues();
  var count = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (String(row[COL.name]).trim() !== me) continue;
    if (!idSet[String(row[COL.id])]) continue;
    if (String(row[COL.borrado]).trim().toUpperCase() === 'TRUE') continue;
    sh.getRange(r + 1, COL.borrado + 1).setValue('TRUE');
    count++;
  }
  return { deleted: count };
}
