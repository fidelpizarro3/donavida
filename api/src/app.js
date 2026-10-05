// La app se arma acá y se levanta en server.js, así Supertest puede probarla sin abrir el puerto.
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const donantesRoutes = require('./routes/donantes.routes');
const aptitudRoutes = require('./routes/aptitud.routes');
const institucionesRoutes = require('./routes/instituciones.routes');
const necesidadesRoutes = require('./routes/necesidades.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/donantes', donantesRoutes);
app.use('/api/donantes', aptitudRoutes); // cuestionario y habilitación (TAREA-3)
app.use('/api/instituciones', institucionesRoutes);
app.use('/api/necesidades', necesidadesRoutes);

// Express 5 manda acá también los errores de las rutas async, sin necesidad de try/catch
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo del pedido no es un JSON válido' } });
  }
  console.error(err);
  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } });
});

module.exports = app;
