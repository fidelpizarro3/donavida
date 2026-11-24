// TAREA-18: el comprobante de una donación en PDF, para que el donante lo descargue y lo presente donde lo necesite.
// El texto se arma aparte del dibujo, así se puede probar sin abrir el PDF
const PDFDocument = require('pdfkit');
const { formatearFecha } = require('../utils/formateadores');

const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires';

// "2026-11-24" → "24/11/2026"
const fechaLegible = (fecha) => fecha.split('-').reverse().join('/');

// Grupo y factor en palabras ("O negativo"): el signo − no está en la fuente del PDF
const grupoEnPalabras = (grupo, factor) => `${grupo} ${factor === 'positivo' ? 'positivo' : 'negativo'}`;

// Fecha y hora de emisión en hora de Argentina: "24/11/2026, 15:30"
function momentoArgentina(fecha) {
  return fecha.toLocaleString('es-AR', {
    timeZone: ZONA_ARGENTINA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', // 15:30, no "03:30 p. m."
  });
}

// El contenido del comprobante. donacion trae donante (con usuario) e institucion
function lineasDelComprobante(donacion, emitidoEn = new Date()) {
  const { donante, institucion } = donacion;
  const datos = [
    ['Donante', `${donante.usuario.nombre} ${donante.usuario.apellido}`],
    ['DNI', donante.documento],
    ['Fecha de la donación', fechaLegible(formatearFecha(donacion.fecha))],
    ['Lugar', `${institucion.nombre}, ${institucion.direccion}`],
  ];
  // El grupo confirmado en el análisis de la donación (puede faltar en donaciones viejas)
  if (donacion.grupoConfirmado) {
    datos.push(['Grupo sanguíneo', grupoEnPalabras(donacion.grupoConfirmado, donacion.factorRhConfirmado)]);
  }
  datos.push(['Código del comprobante', donacion.idDonacion]);

  return {
    titulo: 'Comprobante de donación de sangre',
    texto: 'Se deja constancia de que la persona indicada donó sangre en la fecha y el lugar que figuran a continuación.',
    datos,
    pie: `Emitido por DonaVida el ${momentoArgentina(emitidoEn)}. Cada donación puede ayudar hasta a tres personas. ¡Gracias por donar!`,
  };
}

// Dibuja el comprobante y devuelve el PDF (Buffer)
function generarPdfComprobante(contenido) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60, info: { Title: contenido.titulo, Author: 'DonaVida' } });
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    // Encabezado con el rojo de DonaVida
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#c92a2a').text('DonaVida');
    doc.font('Helvetica').fontSize(10).fillColor('#5f6368').text('Red de donación de sangre');
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(17).fillColor('#1f1f1f').text(contenido.titulo);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11).fillColor('#1f1f1f').text(contenido.texto);
    doc.moveDown(1.5);

    for (const [etiqueta, valor] of contenido.datos) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#5f6368').text(etiqueta.toUpperCase(), { characterSpacing: 0.5 });
      doc.font('Helvetica').fontSize(13).fillColor('#1f1f1f').text(valor);
      doc.moveDown(0.8);
    }

    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(9).fillColor('#5f6368').text(contenido.pie);
    doc.end();
  });
}

module.exports = { lineasDelComprobante, generarPdfComprobante };
