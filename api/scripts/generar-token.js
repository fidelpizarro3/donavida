// Script descartable: genera un JWT valido para CUALQUIER idUsuario/rol que le pases, para
// no tener que recrear usuarios de prueba cada vez que un token viejo vence (duran 8hs).
// Uso: node scripts/generar-token.js <idUsuario> <rol>
require('dotenv').config();
const jwt = require('jsonwebtoken');

const [idUsuario, rol] = process.argv.slice(2);
if (!idUsuario || !rol) {
  console.error('Uso: node scripts/generar-token.js <idUsuario> <rol>');
  process.exit(1);
}

const token = jwt.sign({ sub: idUsuario, rol }, process.env.JWT_SECRET, { expiresIn: '8h' });
console.log(token);
