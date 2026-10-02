require('dotenv').config({ quiet: true });

if (!process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en api/.env (copiá api/.env.example)');
}

const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API de DonaVida en http://localhost:${PORT}`));
