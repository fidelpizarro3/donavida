const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GRUPOS_VALIDOS = ['A', 'B', 'AB', 'O'];
const FACTORES_VALIDOS = ['positivo', 'negativo'];
const SEXOS_VALIDOS = ['femenino', 'masculino', 'x'];

function esTexto(valor, largoMaximo, largoMinimo = 1) {
  return typeof valor === 'string' &&
    valor.trim().length >= largoMinimo &&
    valor.trim().length <= largoMaximo;
}

function esEmailValido(email) {
  return esTexto(email, 255) && EMAIL_VALIDO.test(email.trim());
}

function normalizarDocumento(documento) {
  if (typeof documento !== 'string') return '';
  return documento.replace(/[\.\s-]/g, '').trim().toUpperCase();
}

function esDocumentoValido(documento) {
  const norm = normalizarDocumento(documento);
  return norm.length >= 6 && norm.length <= 20 && /^[A-Z0-9]+$/.test(norm);
}

function esHoraValida(hora) {
  if (hora === null || hora === undefined) return true;
  if (typeof hora !== 'string' || !/^\d{2}:\d{2}$/.test(hora)) return false;
  const [h, m] = hora.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// Horario de contacto preferido: los dos o ninguno, en HH:MM y con desde < hasta.
// null, undefined y '' cuentan como "sin horario". Devuelve el mensaje de error, o null si es válido.
function validarHorarioContacto(desde, hasta) {
  const tieneDesde = desde !== undefined && desde !== null && desde !== '';
  const tieneHasta = hasta !== undefined && hasta !== null && hasta !== '';
  if (tieneDesde !== tieneHasta) {
    return 'Debes indicar tanto el horario de inicio como el de fin de contacto, o bien omitir ambos';
  }
  if (!tieneDesde) return null;
  if (!esHoraValida(desde) || !esHoraValida(hasta)) {
    return 'Los horarios de contacto deben tener formato HH:MM (00:00 a 23:59)';
  }
  if (desde >= hasta) {
    return 'El horario de inicio debe ser anterior al horario de fin';
  }
  return null;
}

function esFechaValida(fecha) {
  if (fecha === null || fecha === undefined) return true;
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const parsed = new Date(`${fecha}T00:00:00.000Z`);
  if (isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === fecha;
}

function obtenerFechaHoy() {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function esFechaNacimientoValida(fecha) {
  if (!esFechaValida(fecha)) return false;
  const hoy = obtenerFechaHoy();
  if (fecha >= hoy) return false;

  const fnac = new Date(`${fecha}T00:00:00.000Z`);
  const hoyDate = new Date(`${hoy}T00:00:00.000Z`);
  const edadMs = hoyDate.getTime() - fnac.getTime();
  const edadAnios = edadMs / (365.25 * 24 * 60 * 60 * 1000);

  // Mínimo 16 años (edad legal para donar) y máximo 110 años
  return edadAnios >= 16 && edadAnios <= 110;
}

function esFechaFuturaOPresente(fecha) {
  if (!esFechaValida(fecha)) return false;
  const hoy = obtenerFechaHoy();
  return fecha >= hoy;
}

function datosInvalidos(res, mensaje) {
  return res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje } });
}

module.exports = {
  EMAIL_VALIDO,
  GRUPOS_VALIDOS,
  FACTORES_VALIDOS,
  SEXOS_VALIDOS,
  esTexto,
  esEmailValido,
  normalizarDocumento,
  esDocumentoValido,
  esHoraValida,
  validarHorarioContacto,
  esFechaValida,
  obtenerFechaHoy,
  esFechaNacimientoValida,
  esFechaFuturaOPresente,
  datosInvalidos,
};
