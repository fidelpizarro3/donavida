// Script descartable: genera un JWT válido para probar rutas protegidas a mano con curl/Postman.
require('dotenv').config();
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { sub: 'usuario-de-prueba', rol: 'institucion' },
  process.env.JWT_SECRET,
  { expiresIn: '8h' }
);

console.log(token);
