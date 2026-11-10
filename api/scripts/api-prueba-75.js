// Levanta la API de DonaVida contra la base de prueba (donavida_prueba75) que arma preparar-prueba-75.js.
// Usa todo lo demás de api/.env (JWT_SECRET, correo, puerto): solo cambia el nombre de la base.
// Mientras corre, el front (http://localhost:5173) habla con esta API y ve los datos de prueba.
// Para volver a la base de desarrollo, cerrarla y levantar la de siempre con "npm run dev" en api/.
//
// Uso, desde la raíz del repo: node api/scripts/api-prueba-75.js
// (opcional: pasarle otra carpeta api/ como argumento)
const path = require('path');
const fs = require('fs');

const BASE_PRUEBA = 'donavida_prueba75';
const API = path.resolve(process.argv[2] || path.join(__dirname, '..'));
if (!fs.existsSync(path.join(API, 'src/server.js')) || !fs.existsSync(path.join(API, 'node_modules'))) {
  console.error(`"${API}" no parece la carpeta api/ de DonaVida con las dependencias instaladas (npm install).`);
  process.exit(1);
}
require(path.join(API, 'node_modules/dotenv')).config({ path: path.join(API, '.env'), quiet: true });

let url;
try {
  url = new URL(process.env.DATABASE_URL ?? '');
} catch {
  console.error('Falta DATABASE_URL en api/.env');
  process.exit(1);
}
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error(`Por seguridad solo corre contra un Postgres local, y DATABASE_URL apunta a ${url.hostname}.`);
  process.exit(1);
}
url.pathname = `/${BASE_PRUEBA}`;
process.env.DATABASE_URL = url.toString();
console.log(`API de PRUEBA: base ${BASE_PRUEBA} (la de desarrollo no se toca)`);

// server.js carga api/.env desde la carpeta actual: sin pisar DATABASE_URL, que ya está puesta
process.chdir(API);
require(path.join(API, 'src/server.js'));
