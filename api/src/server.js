require('dotenv').config({ quiet: true });

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en api/.env (copiá api/.env.example)');
}

const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API de DonaVida en http://localhost:${PORT}`));
// TAREA-4: cierra las necesidades vencidas al arrancar y después una vez por hora
const { cerrarVencidas } = require('./routes/necesidades.routes');
const UNA_HORA = 60 * 60 * 1000;
cerrarVencidas().catch(console.error);
setInterval(() => cerrarVencidas().catch(console.error), UNA_HORA);
