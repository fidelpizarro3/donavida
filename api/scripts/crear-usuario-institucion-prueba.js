// Script descartable: crea un usuario real con rol institucion (sin institucion propia todavia)
// y genera un token valido para él, para poder probar POST /api/instituciones de punta a punta.
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../src/lib/prisma');

async function main() {
  const usuario = await prisma.usuario.create({
    data: {
      email: `institucion-prueba-${Date.now()}@mail.com`,
      passwordHash: '1234',
      nombre: 'Juan',
      apellido: 'Perez',
      rol: 'institucion',
    },
  });

  const token = jwt.sign(
    { sub: usuario.idUsuario, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  console.log('idUsuario:', usuario.idUsuario);
  console.log('token:', token);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
