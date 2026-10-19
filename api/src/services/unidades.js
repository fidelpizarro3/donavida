// TAREA-5: ingreso de unidades de sangre al inventario.
// Lo usan POST /api/unidades (la institución carga una unidad) y el registro de la donación (DV-11),
// que crea las unidades solo con registrarIngresoUnidad.
const { randomBytes } = require('crypto');
const prisma = require('../lib/prisma');
const { GRUPOS_VALIDOS, FACTORES_VALIDOS, esFechaValida, obtenerFechaHoy } = require('../utils/validaciones');
const { formatearFecha, parsearFecha } = require('../utils/formateadores');

// Días que dura cada componente desde la extracción. El issue dice: glóbulos rojos ~42 días, plaquetas 5 a 7.
// Plaquetas en 5, el lado seguro del rango. Sangre entera no está: el issue no dice cuánto dura.
const DIAS_DE_VIDA = {
  globulos_rojos: 42,
  plaquetas: 5,
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Sin 0/O ni 1/I, para que el código se pueda leer y copiar a mano sin confundirse
const LETRAS_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Código único que identifica a la unidad en todo su recorrido: "U-" y 10 caracteres al azar.
// Lo pone siempre el sistema, así DV-11 puede crear unidades sin que nadie lo escriba.
// La base no deja repetirlo (índice único en unidad_sangre.codigo).
function generarCodigo() {
  const caracteres = [...randomBytes(10)].map((byte) => LETRAS_CODIGO[byte % LETRAS_CODIGO.length]);
  return `U-${caracteres.join('')}`;
}

// fechaExtraccion + los días que dura el componente (fechas YYYY-MM-DD)
function calcularVencimiento(componente, fechaExtraccion) {
  const dias = DIAS_DE_VIDA[componente];
  return formatearFecha(new Date(parsearFecha(fechaExtraccion).getTime() + dias * MS_POR_DIA));
}

// TAREA-6: desde cuántos días antes de vencer una unidad se muestra "por vencer".
// No se guarda en la base: se calcula en cada consulta, porque cambia sola con los días.
// Las plaquetas duran 5 días en total, por eso su aviso es mucho más corto.
const DIAS_AVISO_VENCIMIENTO = {
  globulos_rojos: 7,
  plaquetas: 2,
};

// Días que le quedan a una unidad (fechas YYYY-MM-DD): 0 si vence hoy, negativo si ya venció
function calcularDiasRestantes(fechaVencimiento, hoy) {
  return Math.round((parsearFecha(fechaVencimiento).getTime() - parsearFecha(hoy).getTime()) / MS_POR_DIA);
}

function estaPorVencer(componente, diasRestantes) {
  return diasRestantes >= 0 && diasRestantes <= DIAS_AVISO_VENCIMIENTO[componente];
}

// Revisa los datos de una unidad nueva. Devuelve el mensaje de error, o null si está todo bien
function validarIngreso({ grupoSanguineo, factorRh, componente, fechaExtraccion }, hoy) {
  if (!GRUPOS_VALIDOS.includes(grupoSanguineo)) return 'grupoSanguineo debe ser A, B, AB u O';
  if (!FACTORES_VALIDOS.includes(factorRh)) return 'factorRh debe ser positivo o negativo';
  if (!Object.hasOwn(DIAS_DE_VIDA, componente)) return 'componente debe ser globulos_rojos o plaquetas';
  if (typeof fechaExtraccion !== 'string' || !esFechaValida(fechaExtraccion)) {
    return 'fechaExtraccion debe tener formato YYYY-MM-DD';
  }
  if (fechaExtraccion > hoy) return 'fechaExtraccion no puede ser una fecha futura';
  // La unidad nace disponible: no se puede cargar una que ya venció
  const vencimiento = calcularVencimiento(componente, fechaExtraccion);
  if (vencimiento < hoy) return `Con esa fecha de extracción la unidad ya venció (el ${vencimiento})`;
  return null;
}

// Cómo se devuelve una unidad
function mapearUnidad(unidad) {
  return {
    idUnidadSangre: unidad.idUnidadSangre,
    codigo: unidad.codigo,
    idInstitucion: unidad.idInstitucion,
    idDonacion: unidad.idDonacion,
    grupoSanguineo: unidad.grupoSanguineo,
    factorRh: unidad.factorRh,
    componente: unidad.componente,
    fechaExtraccion: formatearFecha(unidad.fechaExtraccion),
    fechaVencimiento: formatearFecha(unidad.fechaVencimiento),
    estado: unidad.estado,
  };
}

// Crea UNA unidad en estado "disponible" y su movimiento de "ingreso", juntos: si falla uno no queda ninguno.
//   datos: { idInstitucion, grupoSanguineo, factorRh, componente, fechaExtraccion, idDonacion?, idUsuario? }
// Para DV-11: idDonacion es la donación que generó la unidad, y db puede ser la transacción
// en la que registra la donación (así todo queda en la misma transacción).
// Devuelve { error } si los datos no son válidos, o { unidad } con la unidad creada.
async function registrarIngresoUnidad(datos, db = prisma) {
  const error = validarIngreso(datos, obtenerFechaHoy());
  if (error) return { error };

  const { idInstitucion, grupoSanguineo, factorRh, componente, fechaExtraccion } = datos;
  const crear = async (tx) => {
    const unidad = await tx.unidadSangre.create({
      data: {
        codigo: generarCodigo(),
        idInstitucion,
        idDonacion: datos.idDonacion ?? null,
        grupoSanguineo,
        factorRh,
        componente,
        fechaExtraccion: parsearFecha(fechaExtraccion),
        fechaVencimiento: parsearFecha(calcularVencimiento(componente, fechaExtraccion)),
        estado: 'disponible',
      },
    });
    await tx.movimientoUnidad.create({
      data: {
        idUnidadSangre: unidad.idUnidadSangre,
        tipo: 'ingreso',
        estadoAnterior: null,
        estadoNuevo: 'disponible',
        idInstitucionDestino: idInstitucion, // la unidad entra a esta institución
        idUsuario: datos.idUsuario ?? null,
      },
    });
    return unidad;
  };

  // Dentro de una transacción de quien llama (DV-11) no se puede abrir otra: se usa la suya
  const unidad = db.$transaction ? await db.$transaction(crear) : await crear(db);
  return { unidad };
}

module.exports = {
  // Para DV-11 (registro de la donación) y para la ruta
  registrarIngresoUnidad,
  mapearUnidad,
  // TAREA-6: para el stock
  calcularDiasRestantes,
  estaPorVencer,
  // Lógica pura, exportada para los tests
  DIAS_DE_VIDA,
  DIAS_AVISO_VENCIMIENTO,
  generarCodigo,
  calcularVencimiento,
  validarIngreso,
};
