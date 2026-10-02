// Crea un usuario administrador: el registro público no permite el rol admin.
// Uso, desde api/:  npm run crear-admin -- <email> <contraseña> <nombre> <apellido>
require('dotenv').config({ quiet: true });
const bcrypt = require('bcrypt');
const prisma = require('../src/lib/prisma');

async function main() {
  const [email, password, nombre, apellido] = process.argv.slice(2);
  if (!email || !password || !nombre || !apellido) {
    console.error('Uso: npm run crear-admin -- <email> <contraseña> <nombre> <apellido>');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres');
    process.exitCode = 1;
    return;
  }

  const admin = await prisma.usuario.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10),
      nombre,
      apellido,
      rol: 'admin',
      emailVerificado: true,
    },
  });
  console.log(`Admin creado: ${admin.email} (${admin.idUsuario})`);
}

main()
  .catch((err) => {
    console.error(err.code === 'P2002' ? 'Ya existe un usuario con ese email' : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
