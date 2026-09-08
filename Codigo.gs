/**
 * Keeper Cup 3 — backend de inscripción de equipos.
 * Se pega en un proyecto de Apps Script ligado a la Hoja de cálculo de inscripciones
 * y se publica como Web App (ver INSTRUCCIONES.md).
 */

var ROOT_FOLDER_NAME = 'Keeper Cup 3 - Inscripciones';
var SHEET_EQUIPOS = 'Equipos';
var SHEET_JUGADORES = 'Jugadores';

function doGet(e) {
  return ContentService.createTextOutput('Keeper Cup 3 backend activo.');
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.type === 'jugador') {
      return registrarJugadorIndividual_(data);
    }
    if (data.type === 'listarEquipos') {
      return jsonResponse_({ ok: true, equipos: listApprovedTeams_() });
    }
    return registrarEquipo_(data);
  } catch (err) {
    return jsonResponse_({ ok: false, message: err.message });
  }
}

function registrarEquipo_(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var teamFolder = getOrCreateTeamFolder_(data.teamName);

    var logoUrl = '';
    if (data.logo) {
      logoUrl = saveFile_(teamFolder, data.logo, 'escudo_' + sanitize_(data.teamName));
    }

    var equiposSheet = getOrCreateSheet_(ss, SHEET_EQUIPOS,
      ['Fecha', 'Equipo', 'Categoría', 'Ciudad', 'DT', 'Teléfono', 'Correo', 'Escudo (Drive)', '# Jugadores', 'Estado']);

    equiposSheet.appendRow([
      new Date(),
      data.teamName,
      data.category,
      data.city,
      data.dtName,
      data.phone,
      data.email,
      logoUrl,
      (data.players || []).length,
      'Pendiente de pago'
    ]);

    var jugadoresSheet = getOrCreateSheet_(ss, SHEET_JUGADORES,
      ['Fecha', 'Equipo', '#', 'Nombre completo', 'Cédula', 'Fecha nacimiento', 'Posición', 'Foto (Drive)']);

    (data.players || []).forEach(function(p, i) {
      var photoUrl = '';
      if (p.photo) {
        photoUrl = saveFile_(teamFolder, p.photo, 'jugador_' + (i + 1) + '_' + sanitize_(p.fullName));
      }
      jugadoresSheet.appendRow([
        new Date(),
        data.teamName,
        i + 1,
        p.fullName,
        p.cedula,
        p.dob,
        p.position,
        photoUrl
      ]);
    });

    return jsonResponse_({ ok: true, message: 'Inscripción guardada.' });
  } catch (err) {
    return jsonResponse_({ ok: false, message: err.message });
  }
}

function registrarJugadorIndividual_(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var teamFolder = getOrCreateTeamFolder_(data.teamName);

    var photoUrl = '';
    if (data.photo) {
      photoUrl = saveFile_(teamFolder, data.photo, 'jugador_' + sanitize_(data.fullName));
    }

    var jugadoresSheet = getOrCreateSheet_(ss, SHEET_JUGADORES,
      ['Fecha', 'Equipo', '#', 'Nombre completo', 'Cédula', 'Fecha nacimiento', 'Posición', 'Foto (Drive)']);

    jugadoresSheet.appendRow([
      new Date(),
      data.teamName,
      '',
      data.fullName,
      data.cedula,
      data.dob,
      data.position,
      photoUrl
    ]);

    return jsonResponse_({ ok: true, message: 'Jugador registrado.' });
  } catch (err) {
    return jsonResponse_({ ok: false, message: err.message });
  }
}

function listApprovedTeams_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_EQUIPOS);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var headers = rows.shift();
  var colEquipo = headers.indexOf('Equipo');
  var colEstado = headers.indexOf('Estado');
  var teams = [];
  rows.forEach(function(row) {
    var estado = String(row[colEstado] || '').trim().toLowerCase();
    if (estado === 'aprobado') teams.push(row[colEquipo]);
  });
  return teams;
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateTeamFolder_(teamName) {
  var root = getOrCreateRootFolder_();
  var folderName = sanitize_(teamName);
  var it = root.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();
  return root.createFolder(folderName);
}

function getOrCreateRootFolder_() {
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

/**
 * data.file viene como "data:image/png;base64,AAAA..." desde el navegador.
 */
function saveFile_(folder, dataUrl, filenameBase) {
  var parts = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!parts) return '';
  var contentType = parts[1];
  var bytes = Utilities.base64Decode(parts[2]);
  var ext = contentType.split('/')[1] || 'jpg';
  var blob = Utilities.newBlob(bytes, contentType, filenameBase + '.' + ext);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function sanitize_(name) {
  return String(name || 'sin_nombre').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 60);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
