/**
 * Keeper Cup 3 — Sincronización automática con el panel (keeper.com.ec/admin).
 *
 * ARCHIVO NUEVO: no modifica nada del registro. Se agrega al mismo proyecto de
 * Apps Script que Codigo.gs (usa SHEET_EQUIPOS, SHEET_JUGADORES y normalizarCedula_).
 *
 * Cada 5 minutos revisa las hojas "Equipos" y "Jugadores" y envía al panel solo
 * las filas NUEVAS o CAMBIADAS (equipos nuevos, jugadores nuevos, números de
 * camiseta que guardan los DT, correcciones hechas a mano en la hoja).
 *
 * CONFIGURACIÓN (una vez): Configuración del proyecto (engranaje) → Propiedades
 * del script → agregar:
 *   PANEL_URL = https://keeper.com.ec
 *   SYNC_KEY  = (la misma clave larga que se pone en Vercel)
 * Luego ejecutar una vez la función instalarSincronizacion.
 */

var SYNC_HOJA_ESTADO = '_SyncEstado';
var SYNC_HOJA_ERRORES = 'Sync Errores';
var SYNC_LOTE = 100;
var SYNC_MAX_MS = 4.5 * 60 * 1000;

function instalarSincronizacion() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarConPanel') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarConPanel').timeBased().everyMinutes(5).create();
  Logger.log('Listo: la sincronización con el panel correrá cada 5 minutos.');
}

function desinstalarSincronizacion() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarConPanel') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Sincronización desactivada.');
}

/** Para probar a mano: ejecútala y mira el Registro (Ctrl+Enter). */
function PROBAR_SINCRONIZACION() {
  sincronizarConPanel();
}

function sincronizarConPanel() {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) { Logger.log('Ya hay una sincronización en curso; se omite.'); return; }
  var inicio = new Date().getTime();
  var estado = syncCargarEstado_();
  var errores = [];
  var enviadas = 0;
  try {
    var equipos = syncLeerHoja_(SHEET_EQUIPOS).filter(function(r) { return String(r['Equipo'] || '').trim(); });
    var jugadores = syncLeerHoja_(SHEET_JUGADORES).filter(function(r) { return String(r['Nombres'] || '').trim() || String(r['Cédula'] || '').trim(); });

    var pendEq = [];
    equipos.forEach(function(r) {
      var k = 'E|' + String(r['Equipo']).trim().toLowerCase();
      var h = syncHash_(r);
      if (estado.mapa[k] !== h) pendEq.push({ k: k, h: h, r: r });
    });
    var pendJug = [];
    jugadores.forEach(function(r, i) {
      var ced = normalizarCedula_(r['Cédula']);
      var k = 'J|' + (ced || ('fila' + (i + 2)));
      var h = syncHash_(r);
      if (estado.mapa[k] !== h) pendJug.push({ k: k, h: h, r: r });
    });

    enviadas += syncEnviarLotes_(pendEq, 'equipos', estado, errores, inicio);
    enviadas += syncEnviarLotes_(pendJug, 'jugadores', estado, errores, inicio);
  } catch (err) {
    errores.push('Error inesperado: ' + err.message);
  } finally {
    if (enviadas > 0) syncGuardarEstado_(estado);
    syncEscribirErrores_(errores);
    lock.releaseLock();
  }
  Logger.log('Sincronización terminada. Filas enviadas: ' + enviadas + '. Problemas: ' + errores.length + '.');
}

function syncEnviarLotes_(pend, campo, estado, errores, inicio) {
  var enviadas = 0;
  for (var i = 0; i < pend.length; i += SYNC_LOTE) {
    if (new Date().getTime() - inicio > SYNC_MAX_MS) {
      Logger.log('Se agotó el tiempo; el resto continúa en la próxima corrida.');
      break;
    }
    var lote = pend.slice(i, i + SYNC_LOTE);
    var cuerpo = { equipos: [], jugadores: [] };
    cuerpo[campo] = lote.map(function(x) { return x.r; });
    var res = syncPost_('/api/sync/ingest', cuerpo);
    if (res.code !== 200 || !res.json || !res.json.ok) {
      errores.push('No se pudo enviar un lote de ' + campo + ' (HTTP ' + res.code + '). Se reintenta en la próxima corrida.');
      break;
    }
    var rechazadas = {};
    ((res.json.rechazadas || {})[campo] || []).forEach(function(idx) { rechazadas[idx] = true; });
    lote.forEach(function(x, idx) {
      if (!rechazadas[idx]) { estado.mapa[x.k] = x.h; enviadas++; }
    });
    (res.json.incidencias || []).forEach(function(n) {
      errores.push(n.hoja + ': ' + n.mensaje + (n.detalle ? ' — ' + n.detalle : ''));
    });
  }
  return enviadas;
}

function syncConfig_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('PANEL_URL');
  var key = p.getProperty('SYNC_KEY');
  if (!url || !key) throw new Error('Faltan PANEL_URL o SYNC_KEY en las Propiedades del script.');
  return { url: String(url).replace(/\/+$/, ''), key: key };
}

function syncHost_(u) {
  var m = String(u).match(/^https?:\/\/([^\/:?#]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

function syncPost_(ruta, cuerpo) {
  var c = syncConfig_();
  var url = c.url + ruta;
  var anfitrion = syncHost_(url);
  for (var salto = 0; salto < 4; salto++) {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(cuerpo),
      headers: { 'x-sync-key': c.key },
      muteHttpExceptions: true,
      followRedirects: false
    });
    var code = res.getResponseCode();
    if (code >= 300 && code < 400) {
      var cab = res.getHeaders();
      var destino = cab['Location'] || cab['location'];
      if (!destino) return { code: code, json: null };
      if (destino.indexOf('http') !== 0) destino = url.match(/^https?:\/\/[^\/]+/)[0] + destino;
      if (syncHost_(destino) !== anfitrion) return { code: 0, json: null };
      url = destino;
      continue;
    }
    var json = null;
    try { json = JSON.parse(res.getContentText()); } catch (e) {}
    return { code: code, json: json };
  }
  return { code: 0, json: null };
}

function syncLeerHoja_(nombre) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var valores = sheet.getDataRange().getValues();
  var headers = valores.shift();
  var tz = Session.getScriptTimeZone();
  return valores.map(function(fila) {
    var o = {};
    headers.forEach(function(h, i) {
      var v = fila[i];
      if (v instanceof Date) v = Utilities.formatDate(v, tz, h === 'Fecha' ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd');
      o[h] = String(v === null || v === undefined ? '' : v);
    });
    return o;
  });
}

function syncHash_(obj) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(obj));
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function syncCargarEstado_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(SYNC_HOJA_ESTADO);
  if (!hoja) {
    hoja = ss.insertSheet(SYNC_HOJA_ESTADO);
    hoja.getRange(1, 1, hoja.getMaxRows(), 2).setNumberFormat('@');
    hoja.getRange(1, 1, 1, 2).setValues([['clave', 'hash']]);
    hoja.hideSheet();
  }
  var mapa = {};
  if (hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues().forEach(function(r) {
      if (r[0]) mapa[String(r[0])] = String(r[1]);
    });
  }
  return { hoja: hoja, mapa: mapa };
}

function syncGuardarEstado_(estado) {
  var hoja = estado.hoja;
  hoja.clear();
  hoja.getRange(1, 1, hoja.getMaxRows(), 2).setNumberFormat('@');
  hoja.getRange(1, 1, 1, 2).setValues([['clave', 'hash']]);
  var filas = Object.keys(estado.mapa).map(function(k) { return [k, estado.mapa[k]]; });
  if (filas.length) hoja.getRange(2, 1, filas.length, 2).setValues(filas);
}

function syncEscribirErrores_(errores) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(SYNC_HOJA_ERRORES);
  if (!errores.length) {
    if (hoja) ss.deleteSheet(hoja);
    return;
  }
  if (!hoja) hoja = ss.insertSheet(SYNC_HOJA_ERRORES);
  hoja.clear();
  hoja.getRange(1, 1, 1, 2).setValues([['Fecha', 'Problema al sincronizar con el panel']]);
  var ahora = new Date();
  hoja.getRange(2, 1, errores.length, 2).setValues(errores.map(function(e) { return [ahora, e]; }));
}
