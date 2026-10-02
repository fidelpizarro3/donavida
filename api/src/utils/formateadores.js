/**
 * Utilidades para formatear fechas y horas según los contratos de la API:
 * - Horas: "HH:MM"
 * - Fechas: "YYYY-MM-DD"
 */

function formatearHora(date) {
  if (!date) return null;
  if (typeof date === 'string') {
    if (/^\d{2}:\d{2}$/.test(date)) return date;
    date = new Date(date);
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const horas = String(date.getUTCHours()).padStart(2, '0');
  const minutos = String(date.getUTCMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}

function parsearHora(horaStr) {
  if (!horaStr) return null;
  if (!/^\d{2}:\d{2}$/.test(horaStr)) return null;
  const [h, m] = horaStr.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return new Date(`1970-01-01T${horaStr}:00.000Z`);
}

function formatearFecha(date) {
  if (!date) return null;
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    date = new Date(date);
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parsearFecha(fechaStr) {
  if (!fechaStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return null;
  const parsed = new Date(`${fechaStr}T00:00:00.000Z`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

module.exports = {
  formatearHora,
  parsearHora,
  formatearFecha,
  parsearFecha,
};
