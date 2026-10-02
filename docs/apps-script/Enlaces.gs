/**
 * Keeper Cup 3 — Reparar enlaces de fotos rotos (sin acceso) en TODOS los clubes.
 *
 * ARCHIVO NUEVO: no modifica nada. Usa funciones de Carpetas.gs y Codigo.gs.
 *
 * Cuándo usarlo: el DT subió fotos con SU cuenta (o las movió desde su Drive) y en la hoja
 * "Jugadores" el enlace dice "No tienes acceso a este archivo". Tú vuelves a subir las fotos
 * a la carpeta del club (nombradas por cédula: 1234567890.jpg, 1234567890 CI Frente.jpg,
 * 1234567890 CI Reverso.jpg) y ejecutas:
 *
 *   REPARAR_ENLACES_TODOS()  -> revisa cada enlace de foto de cada jugador. Si el script no puede
 *      abrir el archivo (o está en la papelera) Y en la carpeta del club hay una foto con esa
 *      cédula, REEMPLAZA el enlace por la de la carpeta. Un enlace que sí funciona no se toca.
 *      Se puede repetir; continúa donde quedó. Resultado en la pestaña "Resultado Enlaces".
 *   REINICIAR_REPARACION_ENLACES() -> vuelve a empezar desde el primer club.
 *
 * La columna "Rotos sin reemplazo" dice a qué clubes hay que pedirles que vuelvan a subir fotos.
 */

var ENL_HOJA = 'Resultado Enlaces';

function REINICIAR_REPARACION_ENLACES() {
  PropertiesService.getScriptProperties().setProperty('ENL_IDX', '0');
  Logger.log('Listo: la próxima reparación empieza desde el primer club.');
}

function REPARAR_ENLACES_TODOS() {
  var props = PropertiesService.getScriptProperties();
  var desde = Number(props.getProperty('ENL_IDX') || 0);
  var equipos = carpEquipos_();
  if (desde >= equipos.length) desde = 0;
  var inicio = new Date().getTime();
  var resultados = [];
  var i = desde;
  for (; i < equipos.length; i++) {
    if (new Date().getTime() - inicio > CARP_MAX_MS) break;
    var r;
    try {
      r = enlRepararEquipo_(equipos[i], inicio);
    } catch (e) {
      r = { equipo: equipos[i].nombre, revisados: 0, rotos: 0, reemplazados: 0, sinReemplazo: 0, nota: 'Error: ' + e.message };
    }
    resultados.push(r);
    if (r.incompleto) break;
  }
  var terminado = i >= equipos.length;
  props.setProperty('ENL_IDX', terminado ? '0' : String(i));
  enlEscribirResultado_(resultados.filter(function(r) { return !r.incompleto; }), desde === 0);
  var rep = 0, sin = 0;
  resultados.forEach(function(r) { rep += r.reemplazados; sin += r.sinReemplazo; });
  Logger.log('Enlaces reemplazados en esta corrida: ' + rep + '. Rotos sin foto de reemplazo en la carpeta: ' + sin + '.');
  Logger.log(terminado ? 'TERMINADO. Mira la pestaña "' + ENL_HOJA + '".' : 'FALTAN CLUBES: vuelve a ejecutar REPARAR_ENLACES_TODOS para continuar.');
}

function enlRepararEquipo_(eq, inicio) {
  var res = { equipo: eq.nombre, revisados: 0, rotos: 0, reemplazados: 0, sinReemplazo: 0, nota: '', incompleto: false };
  var folderId = carpIdCarpeta_(eq);
  var fotos = {};
  if (folderId) {
    try { fotos = carpIndiceFotos_(carpListarArbol_(folderId).archivos); } catch (e) { res.nota = 'No se pudo leer la carpeta: ' + e.message; }
  } else {
    res.nota = 'Sin carpeta en Drive';
  }
  var ctx = carpContextoJugadores_();
  var teamNorm = eq.nombre.toLowerCase();
  var tipos = [['selfie', 'Foto selfie (Drive)'], ['frente', 'Cédula frente (Drive)'], ['reverso', 'Cédula reverso (Drive)']];
  var cambios = [];
  var cache = {};

  var ceds = Object.keys(ctx.porCedula);
  for (var k = 0; k < ceds.length; k++) {
    var ced = ceds[k];
    var p = ctx.porCedula[ced];
    if (p.fila < 0 || p.equipo.toLowerCase() !== teamNorm) continue;
    if (new Date().getTime() - inicio > CARP_MAX_MS) { res.incompleto = true; return res; }
    for (var t = 0; t < tipos.length; t++) {
      var actual = p[tipos[t][0]];
      var nuevo = (fotos[ced] || {})[tipos[t][0]] || '';
      if (!actual) {
        if (nuevo) { cambios.push({ fila: p.fila, col: ctx.col[tipos[t][1]], valor: nuevo }); res.reemplazados++; }
        continue;
      }
      res.revisados++;
      if (nuevo && enlIdDe_(nuevo) === enlIdDe_(actual)) continue;
      var id = enlIdDe_(actual);
      var roto = id ? !enlAccesible_(id, cache) : false;
      if (!roto) continue;
      res.rotos++;
      if (nuevo) { cambios.push({ fila: p.fila, col: ctx.col[tipos[t][1]], valor: nuevo }); res.reemplazados++; }
      else res.sinReemplazo++;
    }
  }

  if (cambios.length) {
    var lock = LockService.getScriptLock();
    try { lock.waitLock(30000); } catch (e) {
      res.nota = 'El sistema estaba ocupado con un registro; no se guardó nada de este club. Vuelve a ejecutar.';
      res.reemplazados = 0;
      return res;
    }
    try {
      cambios.forEach(function(c) { ctx.sheet.getRange(c.fila, c.col + 1).setValue(c.valor); });
    } finally {
      lock.releaseLock();
    }
  }
  return res;
}

function enlIdDe_(url) {
  var m = String(url || '').match(/\/d\/([A-Za-z0-9_-]{10,})/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}

function enlAccesible_(id, cache) {
  if (cache[id] !== undefined) return cache[id];
  var ok = false;
  try {
    var f = DriveApp.getFileById(id);
    f.getName();
    ok = !f.isTrashed();
  } catch (e) { ok = false; }
  cache[id] = ok;
  return ok;
}

function enlEscribirResultado_(resultados, desdeCero) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(ENL_HOJA);
  var enc = ['Equipo', 'Enlaces revisados', 'Enlaces rotos', 'Reemplazados', 'Rotos sin reemplazo', 'Nota'];
  if (!hoja || desdeCero) {
    if (hoja) ss.deleteSheet(hoja);
    hoja = ss.insertSheet(ENL_HOJA);
    hoja.getRange(1, 1, 1, enc.length).setValues([enc]);
  }
  if (!resultados.length) return;
  var filas = resultados.map(function(r) { return [r.equipo, r.revisados, r.rotos, r.reemplazados, r.sinReemplazo, r.nota]; });
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, enc.length).setValues(filas);
}
