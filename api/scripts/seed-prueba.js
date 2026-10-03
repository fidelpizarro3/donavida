// Script descartable, solo para crear un dato de prueba y probar el endpoint de instituciones.
// No es parte del proyecto final. Se puede borrar cuando ya no haga falta.
const prisma = require('../src/lib/prisma');

async function main() {
  const institucion = await prisma.institucion.create({
    data: {
      nombre: 'Hospital Central',
      direccion: 'Av. Siempre Viva 123',
      tipo: 'hospital',
      estado: 'pendiente',
      latitud: -38.95,
      longitud: -68.06,
    },
  });

  console.log('idInstitucion de prueba:', institucion.idInstitucion);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
