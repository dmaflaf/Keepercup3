/**
 * Keeper Cup 3 — Equipos con inscripción MANUAL (nómina y fotos subidas a su carpeta de Drive).
 *
 * ARCHIVO NUEVO: no modifica nada del registro ni de Codigo.gs. Usa de Codigo.gs:
 * SHEET_EQUIPOS, SHEET_JUGADORES, getOrCreateSheet_, forzarColumnaTexto_,
 * normalizarCedula_, extractDriveFolderId_, sanitize_ y getOrCreateRootFolder_.
 *
 * Qué hace, con TODOS los equipos de la hoja "Equipos":
 *   1. REPORTE_CARPETAS_EQUIPOS()  -> SOLO LECTURA. Crea la pestaña "Reporte Carpetas" con lo que
 *      hay en la carpeta de cada club y cuáles necesitan importación.
 *   2. IMPORTAR_NOMINAS_TODOS()    -> por cada club: lee la nómina de su carpeta (Hoja de Google,
 *      Excel o CSV), agrega a "Jugadores" a quienes todavía no están, y completa SOLO los vacíos
 *      (número y enlaces de fotos nombradas por cédula). Nunca duplica una cédula ni pisa datos.
 *      Se puede repetir las veces que quieras. Si no alcanza el tiempo, continúa donde quedó.
 *   3. REINICIAR_IMPORTACION_CARPETAS() -> para volver a empezar desde el primer club.
 *
 * Fotos esperadas en la carpeta: 1234567890.jpg (selfie), 1234567890 CI Frente.jpg,
 * 1234567890 CI Reverso.jpg.  Resultado de cada corrida: pestaña "Resultado Importación".
 * Luego la sincronización con el panel (Sync.gs) lleva los cambios sola, en menos de 5 minutos.
 */

var CARP_HOJA_REPORTE = 'Reporte Carpetas';
var CARP_HOJA_RESULTADO = 'Resultado Importación';
var CARP_MAX_MS = 4.5 * 60 * 1000;
var CARP_PATRON_FOTO = /^(\d{10})(\s+CI\s+(Frente|Reverso))?\.\w+$/i;
var CARP_JUG_HEADERS = ['Fecha', 'Equipo', 'Número', 'Nombres', 'Apellidos', 'Cédula', 'Fecha nacimiento', 'Posición', 'Correo', 'Teléfono', 'Foto selfie (Drive)', 'Cédula frente (Drive)', 'Cédula reverso (Drive)'];
var CARP_MIME_SHEET = 'application/vnd.google-apps.spreadsheet';
var CARP_MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var CARP_MIME_XLS = 'application/vnd.ms-excel';

function REINICIAR_IMPORTACION_CARPETAS() {
  PropertiesService.getScriptProperties().setProperty('CARP_IDX', '0');
  Logger.log('Listo: la próxima importación empieza desde el primer club.');
}

/* ------------------------------ REPORTE (solo lectura) ------------------------------ */

function REPORTE_CARPETAS_EQUIPOS() {
  var inicio = new Date().getTime();
  var equipos = carpEquipos_();
  var ctx = carpContextoJugadores_();
  var filas = [];
  var incompleto = false;

  equipos.forEach(function(eq) {
    if (new Date().getTime() - inicio > CARP_MAX_MS) { incompleto = true; return; }
    var teamNorm = eq.nombre.toLowerCase();
    var total = 0, sinSelfie = 0;
    Object.keys(ctx.porCedula).forEach(function(ced) {
      var p = ctx.porCedula[ced];
      if (p.equipo.toLowerCase() !== teamNorm) return;
      total++;
      if (!p.selfie) sinSelfie++;
    });

    var folderId = carpIdCarpeta_(eq);
    if (!folderId) { filas.push([eq.nombre, eq.estado, total, sinSelfie, '(sin carpeta)', 0, 0, 'Sin carpeta en Drive']); return; }
    var archivos;
    try { archivos = carpListar_(folderId); } catch (e) { filas.push([eq.nombre, eq.estado, total, sinSelfie, '', 0, 0, 'No se pudo leer la carpeta: ' + e.message]); return; }

    var nomina = carpBuscarNomina_(archivos);
    var fotos = carpIndiceFotos_(archivos);
    var conFoto = Object.keys(fotos);
    var sinFila = conFoto.filter(function(c) { return !ctx.porCedula[c]; }).length;

    var queHacer = 'OK';
    if (nomina || sinFila > 0) queHacer = 'Importar (IMPORTAR_NOMINAS_TODOS)';
    else if (sinSelfie > 0 && conFoto.length > 0) queHacer = 'Completar fotos (IMPORTAR_NOMINAS_TODOS)';
    else if (sinSelfie > 0) queHacer = 'Faltan fotos: pedirlas al DT';
    filas.push([eq.nombre, eq.estado, total, sinSelfie, nomina ? nomina.name : '(ninguna)', conFoto.length, sinFila, queHacer]);
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(CARP_HOJA_REPORTE);
  if (hoja) ss.deleteSheet(hoja);
  hoja = ss.insertSheet(CARP_HOJA_REPORTE);
  var enc = ['Equipo', 'Estado', 'Jugadores en la hoja', 'Sin selfie en la hoja', 'Nómina en la carpeta', 'Cédulas con fotos en la carpeta', 'De esas, sin fila en la hoja', 'Qué hacer'];
  hoja.getRange(1, 1, 1, enc.length).setValues([enc]);
  if (filas.length) hoja.getRange(2, 1, filas.length, enc.length).setValues(filas);
  Logger.log('Reporte listo (' + filas.length + ' equipos)' + (incompleto ? ' — se agotó el tiempo, vuelve a ejecutarlo' : '') + '. Mira la pestaña "' + CARP_HOJA_REPORTE + '".');
}

/* ------------------------------ IMPORTACIÓN DE TODOS LOS CLUBES ------------------------------ */

function IMPORTAR_NOMINAS_TODOS() {
  var props = PropertiesService.getScriptProperties();
  var desde = Number(props.getProperty('CARP_IDX') || 0);
  var equipos = carpEquipos_();
  if (desde >= equipos.length) desde = 0;
  var ctx = carpContextoJugadores_();
  var inicio = new Date().getTime();
  var resultados = [];
  var i = desde;
  for (; i < equipos.length; i++) {
    if (new Date().getTime() - inicio > CARP_MAX_MS) break;
    var r;
    try {
      r = carpImportarEquipo_(equipos[i], ctx);
    } catch (e) {
      r = { equipo: equipos[i].nombre, nuevos: 0, fotos: 0, numeros: 0, existian: 0, otroEquipo: 0, invalidos: 0, nota: 'Error: ' + e.message };
    }
    resultados.push(r);
  }
  var terminado = i >= equipos.length;
  props.setProperty('CARP_IDX', terminado ? '0' : String(i));
  carpEscribirResultado_(resultados, desde === 0);
  var nuevos = 0, fotos = 0, numeros = 0;
  resultados.forEach(function(r) { nuevos += r.nuevos; fotos += r.fotos; numeros += r.numeros; });
  Logger.log('Clubes revisados en esta corrida: ' + resultados.length + '. Jugadores nuevos: ' + nuevos + '. Enlaces de fotos completados: ' + fotos + '. Números completados: ' + numeros + '.');
  Logger.log(terminado ? 'TERMINADO: se revisaron todos los clubes. Mira la pestaña "' + CARP_HOJA_RESULTADO + '".' : 'FALTAN CLUBES: vuelve a ejecutar IMPORTAR_NOMINAS_TODOS para continuar (quedaron ' + (equipos.length - i) + ').');
}

function carpImportarEquipo_(eq, ctx) {
  var res = { equipo: eq.nombre, nuevos: 0, fotos: 0, numeros: 0, existian: 0, otroEquipo: 0, invalidos: 0, nota: '' };
  var folderId = carpIdCarpeta_(eq);
  if (!folderId) { res.nota = 'Sin carpeta en Drive'; return res; }
  var archivos;
  try { archivos = carpListar_(folderId); } catch (e) { res.nota = 'No se pudo leer la carpeta: ' + e.message; return res; }

  var fotos = carpIndiceFotos_(archivos);
  var teamNorm = eq.nombre.toLowerCase();
  var nuevasFilas = [];
  var cambios = [];

  var nomina = carpBuscarNomina_(archivos);
  if (nomina) {
    var filas = null;
    try { filas = carpLeerFilasNomina_(nomina); } catch (e) { res.nota = e.message; }
    if (filas && filas.length) {
      var enc = filas.shift();
      var iNombres = carpColumna_(enc, ['nombre'], 0);
      var iApellidos = carpColumna_(enc, ['apellido'], 1);
      var iCedula = carpColumna_(enc, ['cedula'], 2);
      var iFecha = carpColumna_(enc, ['nacimiento', 'fecha'], 3);
      var iPosicion = carpColumna_(enc, ['posicion'], 4);
      var iCorreo = carpColumna_(enc, ['correo', 'email', 'mail'], 5);
      var iTelefono = carpColumna_(enc, ['telefono', 'celular'], 6);
      var iNumero = carpColumna_(enc, ['camiseta', 'dorsal', 'numero'], -1);
      var tz = Session.getScriptTimeZone();

      filas.forEach(function(fila) {
        var nombres = String(fila[iNombres] || '').trim();
        var apellidos = String(fila[iApellidos] || '').trim();
        var cedula = normalizarCedula_(fila[iCedula]);
        if (!nombres || !apellidos || !/^\d{10}$/.test(cedula)) { res.invalidos++; return; }
        var numero = iNumero > -1 ? String(fila[iNumero] || '').trim() : '';
        var previo = ctx.porCedula[cedula];
        if (previo) {
          if (previo.equipo.toLowerCase() !== teamNorm) { res.otroEquipo++; return; }
          res.existian++;
          if (numero && !previo.numero && previo.fila > 0) {
            cambios.push({ fila: previo.fila, col: ctx.col['Número'], valor: numero });
            previo.numero = numero;
            res.numeros++;
          }
          return;
        }
        var fechaRaw = fila[iFecha];
        var fecha = fechaRaw instanceof Date ? Utilities.formatDate(fechaRaw, tz, 'yyyy-MM-dd') : String(fechaRaw || '').trim();
        var f = fotos[cedula] || {};
        nuevasFilas.push([new Date(), eq.nombre, numero, nombres, apellidos, cedula, fecha,
          String(fila[iPosicion] || '').trim(), String(fila[iCorreo] || '').trim(), String(fila[iTelefono] || '').trim(),
          f.selfie || '', f.frente || '', f.reverso || '']);
        ctx.porCedula[cedula] = { fila: -1, equipo: eq.nombre, numero: numero, selfie: f.selfie || '', frente: f.frente || '', reverso: f.reverso || '' };
        res.nuevos++;
      });
    }
  }

  // Completar SOLO los vacíos de los jugadores que ya estaban en la hoja, con las fotos nombradas por cédula
  var tipos = [['selfie', 'Foto selfie (Drive)'], ['frente', 'Cédula frente (Drive)'], ['reverso', 'Cédula reverso (Drive)']];
  Object.keys(ctx.porCedula).forEach(function(ced) {
    var p = ctx.porCedula[ced];
    if (p.fila < 0 || p.equipo.toLowerCase() !== teamNorm) return;
    var f = fotos[ced];
    if (!f) return;
    tipos.forEach(function(t) {
      if (f[t[0]] && !p[t[0]]) {
        cambios.push({ fila: p.fila, col: ctx.col[t[1]], valor: f[t[0]] });
        p[t[0]] = f[t[0]];
        res.fotos++;
      }
    });
  });

  if (nuevasFilas.length || cambios.length) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      res.nota = 'El sistema estaba ocupado con un registro; no se guardó nada de este club. Vuelve a ejecutar.';
      res.nuevos = 0; res.fotos = 0; res.numeros = 0;
      return res;
    }
    try {
      if (nuevasFilas.length) ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, nuevasFilas.length, CARP_JUG_HEADERS.length).setValues(nuevasFilas);
      cambios.forEach(function(c) { ctx.sheet.getRange(c.fila, c.col + 1).setValue(c.valor); });
    } finally {
      lock.releaseLock();
    }
  }
  if (!res.nota && !nomina && !Object.keys(fotos).length) res.nota = 'Sin nómina ni fotos por cédula en la carpeta';
  return res;
}

function carpEscribirResultado_(resultados, desdeCero) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(CARP_HOJA_RESULTADO);
  var enc = ['Equipo', 'Jugadores nuevos', 'Fotos completadas', 'Números completados', 'Ya estaban en la hoja', 'En la nómina pero inscritos en otro equipo', 'Filas inválidas', 'Nota'];
  if (!hoja || desdeCero) {
    if (hoja) ss.deleteSheet(hoja);
    hoja = ss.insertSheet(CARP_HOJA_RESULTADO);
    hoja.getRange(1, 1, 1, enc.length).setValues([enc]);
  }
  if (!resultados.length) return;
  var filas = resultados.map(function(r) { return [r.equipo, r.nuevos, r.fotos, r.numeros, r.existian, r.otroEquipo, r.invalidos, r.nota]; });
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, enc.length).setValues(filas);
}

/* ------------------------------ AUXILIARES ------------------------------ */

function carpEquipos_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EQUIPOS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var v = sheet.getDataRange().getValues();
  var h = v.shift();
  var cE = h.indexOf('Equipo'), cS = h.indexOf('Estado'), cC = h.indexOf('Carpeta equipo (link)');
  return v.map(function(r) {
    return { nombre: String(r[cE] || '').trim(), estado: String(r[cS] || '').trim(), carpetaLink: cC > -1 ? String(r[cC] || '').trim() : '' };
  }).filter(function(e) { return e.nombre; });
}

function carpIdCarpeta_(eq) {
  var id = extractDriveFolderId_(eq.carpetaLink);
  if (id) return id;
  var it = getOrCreateRootFolder_().getFoldersByName(sanitize_(eq.nombre));
  return it.hasNext() ? it.next().getId() : null;
}

function carpListar_(folderId) {
  var out = [];
  var token = null;
  do {
    var params = {
      q: "'" + folderId + "' in parents and trashed = false",
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      pageSize: 1000
    };
    if (token) params.pageToken = token;
    var r = Drive.Files.list(params);
    (r.files || []).forEach(function(f) { out.push(f); });
    token = r.nextPageToken || null;
  } while (token);
  return out;
}

function carpIndiceFotos_(archivos) {
  var idx = {};
  var fechas = {};
  archivos.forEach(function(f) {
    var m = String(f.name || '').match(CARP_PATRON_FOTO);
    if (!m) return;
    var tipo = !m[3] ? 'selfie' : (/frente/i.test(m[3]) ? 'frente' : 'reverso');
    var clave = m[1] + '|' + tipo;
    var mod = String(f.modifiedTime || '');
    if (fechas[clave] && fechas[clave] > mod) return;
    fechas[clave] = mod;
    if (!idx[m[1]]) idx[m[1]] = {};
    idx[m[1]][tipo] = 'https://drive.google.com/file/d/' + f.id + '/view?usp=drivesdk';
  });
  return idx;
}

function carpBuscarNomina_(archivos) {
  var cand = archivos.filter(function(f) {
    var n = String(f.name || '');
    if (/^TEMP_IMPORT_/i.test(n) || /^carnets_.*\.zip$/i.test(n)) return false;
    return f.mimeType === CARP_MIME_SHEET || f.mimeType === CARP_MIME_XLSX || f.mimeType === CARP_MIME_XLS ||
      f.mimeType === 'text/csv' || /\.(xlsx|xls|csv)$/i.test(n);
  });
  cand.sort(function(a, b) { return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')); });
  return cand[0] || null;
}

function carpLeerFilasNomina_(f) {
  if (f.mimeType === CARP_MIME_SHEET) {
    return SpreadsheetApp.openById(f.id).getSheets()[0].getDataRange().getValues();
  }
  if (f.mimeType === 'text/csv' || /\.csv$/i.test(String(f.name || ''))) {
    return Utilities.parseCsv(DriveApp.getFileById(f.id).getBlob().getDataAsString());
  }
  var copia = null;
  try {
    copia = Drive.Files.copy({ name: 'TEMP_IMPORT_' + f.name, mimeType: CARP_MIME_SHEET }, f.id);
  } catch (e) {
    throw new Error('No se pudo convertir el Excel "' + f.name + '" (' + e.message + '). Ábrelo en Drive con Hojas de cálculo y guárdalo como Hoja de Google.');
  }
  try {
    return SpreadsheetApp.openById(copia.id).getSheets()[0].getDataRange().getValues();
  } finally {
    try { DriveApp.getFileById(copia.id).setTrashed(true); } catch (e2) {}
  }
}

function carpQuitarAcentos_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function carpColumna_(encabezados, posibles, respaldo) {
  for (var i = 0; i < encabezados.length; i++) {
    var h = carpQuitarAcentos_(encabezados[i]);
    for (var j = 0; j < posibles.length; j++) {
      if (h.indexOf(posibles[j]) !== -1) return i;
    }
  }
  return respaldo;
}

function carpContextoJugadores_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet_(ss, SHEET_JUGADORES, CARP_JUG_HEADERS);
  forzarColumnaTexto_(sheet, 'Cédula');
  var v = sheet.getDataRange().getValues();
  var h = v[0] || [];
  var col = {};
  h.forEach(function(x, i) { col[x] = i; });
  var porCedula = {};
  for (var i = 1; i < v.length; i++) {
    var ced = normalizarCedula_(v[i][col['Cédula']]);
    if (!ced) continue;
    porCedula[ced] = {
      fila: i + 1,
      equipo: String(v[i][col['Equipo']] || '').trim(),
      numero: String(v[i][col['Número']] || '').trim(),
      selfie: String(v[i][col['Foto selfie (Drive)']] || '').trim(),
      frente: String(v[i][col['Cédula frente (Drive)']] || '').trim(),
      reverso: String(v[i][col['Cédula reverso (Drive)']] || '').trim()
    };
  }
  return { sheet: sheet, col: col, porCedula: porCedula };
}
