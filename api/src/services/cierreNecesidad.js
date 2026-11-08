// Suma a una necesidad lo que la cubre y la cierra cuando se completa.
// TAREA-12 (DV-13): la usa la recepción de una transferencia ligada a una necesidad.
// TAREA-13 (DV-14) le suma el cierre de la convocatoria y el aviso de agradecimiento.
const prisma = require('../lib/prisma');

// Si la necesidad sigue abierta y ya tiene todo lo que pidió, la pasa a "cubierta".
// El cambio es condicional (solo si sigue abierta): aunque se llame dos veces, se cierra una sola.
// db puede ser la transacción de quien la llama. Devuelve true si la cerró ahora.
async function cerrarSiCubierta(idNecesidad, db = prisma) {
  const necesidad = await db.necesidad.findUnique({ where: { idNecesidad } });
  if (!necesidad || necesidad.estado !== 'abierta' || necesidad.unidadesCubiertas < necesidad.unidadesSolicitadas) {
    return false;
  }
  const { count } = await db.necesidad.updateMany({
    where: { idNecesidad, estado: 'abierta' },
    data: { estado: 'cubierta', cerradaEn: new Date() },
  });
  return count === 1;
}

// Suma unidades a lo cubierto de una necesidad abierta (sin pasarse de lo que pidió) y la cierra si se completó.
// Si la necesidad ya no está abierta (cubierta, cerrada a mano o vencida), no suma nada:
// las unidades igual entran al stock de la institución.
// db puede ser la transacción de quien la llama. Devuelve la necesidad como quedó.
async function sumarCobertura(idNecesidad, unidades, db = prisma) {
  // Suma atómica: si otra operación suma al mismo tiempo, no se pisan
  const { count } = await db.necesidad.updateMany({
    where: { idNecesidad, estado: 'abierta' },
    data: { unidadesCubiertas: { increment: unidades } },
  });
  if (count === 1) {
    const necesidad = await db.necesidad.findUnique({ where: { idNecesidad } });
    // Si en el medio llegaron donaciones, lo cubierto no puede pasar de lo pedido: lo que sobra va al stock
    if (necesidad.unidadesCubiertas > necesidad.unidadesSolicitadas) {
      await db.necesidad.update({
        where: { idNecesidad },
        data: { unidadesCubiertas: necesidad.unidadesSolicitadas },
      });
    }
    await cerrarSiCubierta(idNecesidad, db);
  }
  return db.necesidad.findUnique({ where: { idNecesidad } });
}

module.exports = { cerrarSiCubierta, sumarCobertura };
